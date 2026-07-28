<?php

declare(strict_types=1);

namespace App\Support;

use App\Controllers\NurturerController;

/**
 * Polls the configured Gmail inbox for replies from known cold leads.
 * Detection always pauses scheduled follow-ups before classification, so a
 * mailbox or AI failure can delay a response but can never cause a stale drip
 * email to go out after the prospect has replied.
 */
class NurturerReplySync
{
    private const LOOKBACK_DAYS = 30;
    private const MAX_MESSAGES_PER_RUN = 100;

    /** @return array{enabled:bool,checked:int,matched:int,replied:int,review:int,stopped:int,error:?string} */
    public static function run(): array
    {
        $summary = ['enabled' => false, 'checked' => 0, 'matched' => 0, 'replied' => 0, 'review' => 0, 'stopped' => 0, 'error' => null];
        if (Settings::get('nurturer_reply_sync_enabled') !== '1') return $summary;
        $summary['enabled'] = true;
        if (!function_exists('imap_open')) {
            $summary['error'] = 'PHP IMAP extension is not enabled.';
            return $summary;
        }

        $username = trim((string) Settings::get('smtp_gmail_address'));
        $password = preg_replace('/\s+/', '', (string) Settings::get('smtp_app_password'));
        if (!filter_var($username, FILTER_VALIDATE_EMAIL) || $password === '') {
            $summary['error'] = 'Reply mailbox username or password is not configured.';
            return $summary;
        }

        $host = self::imapHost(
            (string) Settings::get('imap_host'),
            (string) Settings::get('smtp_host')
        );
        $mailbox = '{' . $host . ':993/imap/ssl}INBOX';
        $imap = @imap_open($mailbox, $username, $password, OP_READONLY, 1);
        if (!$imap) {
            $summary['error'] = 'Could not connect to the reply mailbox: ' . (imap_last_error() ?: 'unknown IMAP error');
            return $summary;
        }

        try {
            $since = date('d-M-Y', strtotime('-' . self::LOOKBACK_DAYS . ' days'));
            $uids = imap_search($imap, 'SINCE "' . $since . '"', SE_UID) ?: [];
            $uids = array_slice(array_reverse($uids), 0, self::MAX_MESSAGES_PER_RUN);
            foreach ($uids as $uid) {
                $summary['checked']++;
                self::processMessage($imap, (int) $uid, $summary);
            }
        } finally {
            imap_close($imap);
        }
        return $summary;
    }

    private static function processMessage($imap, int $uid, array &$summary): void
    {
        $overview = imap_fetch_overview($imap, (string) $uid, FT_UID)[0] ?? null;
        if (!$overview) return;
        $from = self::address((string) ($overview->from ?? ''));
        if (!$from) return;

        $pdo = Database::get();
        $lead = $pdo->prepare(
            "SELECT e.*, ml.business_name, ml.industry, ml.pitch_body
             FROM drip_enrollments e
             LEFT JOIN marketing_leads ml ON ml.id = e.lead_id
             WHERE lower(e.email) = lower(?) AND e.lead_id IS NOT NULL
             ORDER BY e.id DESC LIMIT 1"
        );
        $lead->execute([$from]);
        $enrollment = $lead->fetch();
        if (!$enrollment) return;

        $messageId = trim((string) ($overview->message_id ?? ''));
        if ($messageId === '') {
            $messageId = '<imap-' . hash('sha256', $from . '|' . ($overview->date ?? '') . '|' . ($overview->subject ?? '') . '|' . $uid) . '@princecaleb.dev>';
        }
        $exists = $pdo->prepare('SELECT 1 FROM nurturer_replies WHERE message_id = ?');
        $exists->execute([$messageId]);
        if ($exists->fetchColumn()) return;

        $subject = self::decodeHeader((string) ($overview->subject ?? ''));
        $body = trim(self::messageBody($imap, $uid));
        if ($body === '') return;
        $body = mb_substr(self::stripQuotedReply($body), 0, 12000);
        $received = isset($overview->udate) ? gmdate('Y-m-d H:i:s', (int) $overview->udate) : gmdate('Y-m-d H:i:s');
        $inReplyTo = trim((string) ($overview->in_reply_to ?? ''));

        $insert = $pdo->prepare(
            'INSERT OR IGNORE INTO nurturer_replies
             (enrollment_id, message_id, in_reply_to, from_email, subject, body, received_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $insert->execute([$enrollment['id'], $messageId, $inReplyTo, $from, $subject, $body, $received]);
        if ($insert->rowCount() === 0) return;
        $replyId = (int) $pdo->lastInsertId();
        $summary['matched']++;

        // The non-negotiable guardrail: any real reply stops all scheduled
        // fixed and AI follow-ups before classification or generation begins.
        $pdo->prepare("UPDATE drip_enrollments SET status = 'stopped', nurturer_enabled = 0 WHERE id = ?")
            ->execute([$enrollment['id']]);

        $threadStmt = $pdo->prepare(
            'SELECT body, reply_body, received_at FROM nurturer_replies
             WHERE enrollment_id = ? AND id <> ? ORDER BY received_at ASC LIMIT 20'
        );
        $threadStmt->execute([$enrollment['id'], $replyId]);
        $threadContext = (string) ($enrollment['pitch_body'] ?: '');
        foreach ($threadStmt->fetchAll() ?: [] as $turn) {
            $threadContext .= "\n\nProspect replied:\n" . (string) $turn['body'];
            if (trim((string) ($turn['reply_body'] ?? '')) !== '') {
                $threadContext .= "\n\nPrince Caleb replied:\n" . (string) $turn['reply_body'];
            }
        }

        $deterministic = self::deterministicClassification($body);
        $result = $deterministic ? [
            'classification' => $deterministic,
            'confidence' => 1.0,
            'needs_review' => false,
            'subject_line' => '',
            'email_body' => '',
        ] : NurturerController::generateReplyContinuation(
            (string) ($enrollment['name'] ?: $enrollment['business_name'] ?: ''),
            (string) ($enrollment['lead_industry'] ?: $enrollment['industry'] ?: ''),
            $threadContext,
            $subject,
            $body
        );

        if ($result === null) {
            self::markReview($pdo, $replyId, 'needs_review', null, '', '');
            $summary['review']++;
            return;
        }

        $classification = $result['classification'];
        $confidence = (float) $result['confidence'];
        $replySubject = trim((string) $result['subject_line']);
        $replyBody = trim((string) $result['email_body']);

        if (in_array($classification, ['unsubscribe', 'not_interested'], true)) {
            self::suppress($pdo, $from, 'reply_' . $classification);
            $pdo->prepare("UPDATE marketing_leads SET status = 'rejected', updated_at = datetime('now') WHERE id = ?")
                ->execute([$enrollment['lead_id']]);
            self::markReview($pdo, $replyId, $classification, $confidence, '', '', 'received');
            $summary['stopped']++;
            return;
        }
        if ($classification === 'out_of_office') {
            self::markReview($pdo, $replyId, $classification, $confidence, '', '', 'received');
            $summary['stopped']++;
            return;
        }

        $autoSafe = in_array($classification, ['interested', 'question', 'neutral', 'not_now'], true)
            && !$result['needs_review'] && $confidence >= 0.75 && $replyBody !== ''
            && Settings::get('nurturer_reply_auto_send') === '1';
        if (!$autoSafe) {
            self::markReview($pdo, $replyId, $classification, $confidence, $replySubject, $replyBody);
            $summary['review']++;
            return;
        }

        if ($replySubject === '') $replySubject = preg_match('/^re:/i', $subject) ? $subject : 'Re: ' . $subject;
        $html = EmailTemplate::wrapMarketing($replyBody, 'Reply from Prince Caleb');
        $sent = Mailer::sendHtml(
            $from,
            $replySubject,
            $html,
            $replyBody,
            Mailer::replyInbox(),
            ['In-Reply-To' => $messageId, 'References' => trim($inReplyTo . ' ' . $messageId)]
        );
        self::markReview(
            $pdo, $replyId, $classification, $confidence, $replySubject, $replyBody,
            $sent ? 'replied' : 'review'
        );
        if ($sent) {
            $pdo->prepare("UPDATE nurturer_replies SET replied_at = datetime('now') WHERE id = ?")->execute([$replyId]);
            $summary['replied']++;
        } else {
            $summary['review']++;
        }
    }

    private static function deterministicClassification(string $body): ?string
    {
        $text = strtolower($body);
        if (preg_match('/\b(unsubscribe|remove me|stop emailing|do not email|don\'t email|opt out)\b/', $text)) return 'unsubscribe';
        if (preg_match('/\b(not interested|no thanks|do not contact|don\'t contact)\b/', $text)) return 'not_interested';
        if (preg_match('/\b(out of office|automatic reply|auto-?reply|away from the office)\b/', $text)) return 'out_of_office';
        return null;
    }

    private static function markReview(
        \PDO $pdo,
        int $id,
        string $classification,
        ?float $confidence,
        string $subject,
        string $body,
        string $status = 'review'
    ): void {
        $pdo->prepare(
            'UPDATE nurturer_replies
             SET classification=?, confidence=?, reply_subject=?, reply_body=?, status=? WHERE id=?'
        )->execute([$classification, $confidence, $subject, $body, $status, $id]);
    }

    private static function suppress(\PDO $pdo, string $email, string $reason): void
    {
        $pdo->prepare('INSERT OR IGNORE INTO email_suppressions (email, reason) VALUES (?, ?)')
            ->execute([strtolower($email), $reason]);
        $pdo->prepare("UPDATE drip_enrollments SET status='stopped', nurturer_enabled=0 WHERE lower(email)=lower(?)")
            ->execute([$email]);
    }

    private static function imapHost(string $configuredImapHost, string $smtpHost): string
    {
        $configuredImapHost = strtolower(trim($configuredImapHost));
        if ($configuredImapHost !== '') return $configuredImapHost;

        $smtpHost = strtolower(trim($smtpHost));
        if ($smtpHost === '' || $smtpHost === 'smtp.gmail.com') return 'imap.gmail.com';
        return str_starts_with($smtpHost, 'smtp.') ? 'imap.' . substr($smtpHost, 5) : $smtpHost;
    }

    private static function address(string $value): ?string
    {
        $parsed = imap_rfc822_parse_adrlist($value, '');
        foreach ($parsed ?: [] as $entry) {
            $email = strtolower(trim(($entry->mailbox ?? '') . '@' . ($entry->host ?? '')));
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) return $email;
        }
        return null;
    }

    private static function decodeHeader(string $value): string
    {
        $parts = imap_mime_header_decode($value);
        $out = '';
        foreach ($parts ?: [] as $part) {
            $charset = strtoupper((string) ($part->charset ?? 'UTF-8'));
            $text = (string) ($part->text ?? '');
            $out .= ($charset && $charset !== 'DEFAULT' && $charset !== 'UTF-8')
                ? (mb_convert_encoding($text, 'UTF-8', $charset) ?: $text)
                : $text;
        }
        return trim($out ?: $value);
    }

    private static function messageBody($imap, int $uid): string
    {
        $structure = imap_fetchstructure($imap, $uid, FT_UID);
        if (!$structure) return '';
        $plain = self::findPart($imap, $uid, $structure, 'TEXT', 'PLAIN');
        if ($plain !== null) return $plain;
        $html = self::findPart($imap, $uid, $structure, 'TEXT', 'HTML');
        return $html === null ? '' : html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    private static function findPart($imap, int $uid, object $part, string $type, string $subtype, string $section = ''): ?string
    {
        $types = ['TEXT', 'MULTIPART', 'MESSAGE', 'APPLICATION', 'AUDIO', 'IMAGE', 'VIDEO', 'OTHER'];
        $partType = $types[(int) ($part->type ?? 7)] ?? 'OTHER';
        if ($partType === $type && strtoupper((string) ($part->subtype ?? '')) === $subtype) {
            $body = $section === '' ? imap_body($imap, $uid, FT_UID | FT_PEEK) : imap_fetchbody($imap, $uid, $section, FT_UID | FT_PEEK);
            return match ((int) ($part->encoding ?? 0)) {
                3 => base64_decode($body, true) ?: '',
                4 => quoted_printable_decode($body),
                default => (string) $body,
            };
        }
        foreach (($part->parts ?? []) as $index => $child) {
            $childSection = $section === '' ? (string) ($index + 1) : $section . '.' . ($index + 1);
            $found = self::findPart($imap, $uid, $child, $type, $subtype, $childSection);
            if ($found !== null) return $found;
        }
        return null;
    }

    private static function stripQuotedReply(string $body): string
    {
        $body = preg_split('/\ROn .+ wrote:\R|\RFrom:\s.+\R|\R-{2,}\s*Original Message\s*-{2,}\R/i', $body, 2)[0] ?? $body;
        $lines = array_filter(preg_split('/\R/', $body) ?: [], fn($line) => !str_starts_with(ltrim($line), '>'));
        return trim(implode("\n", $lines));
    }
}
