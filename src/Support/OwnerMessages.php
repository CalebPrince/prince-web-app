<?php

declare(strict_types=1);

namespace App\Support;

/**
 * The governor for everything agents send to the owner. Each agent that is
 * about to email or WhatsApp the owner calls route() first. Jev rates the
 * message (how important, does it need the owner to act, does it repeat a recent
 * one) and fixed rules decide what happens:
 *
 *   send      goes out immediately, as before
 *   hold      routine: waits in owner_message_queue and goes out in one digest
 *   collapse  a repeat of something recent: held and grouped under the original
 *
 * Nothing is ever dropped. The tier is set by code at each call site, not by Jev:
 *   critical   never held (an outage, a customer who needs the owner, money)
 *   scheduled  a report that is already a summary, so it is never held
 *   normal     Jev decides
 * A message with no tier is treated as critical, so an unreviewed call site can
 * never lose an alert. Modes and fail-open behaviour: see AgentJudgment.
 *
 * Digest: held messages go out together at agent_digest_times (default
 * 09:00 and 17:00, site timezone), never in quiet hours, and anything held longer
 * than 24 hours goes at the next chance. Run by database/send_owner_digest.php.
 */
final class OwnerMessages
{
    private const IMPORTANT_AT = 2.0;       // importance 0..3: needs a decision today
    private const NEEDS_ACTION_AT = 0.70;
    private const DUPLICATE_AT = 0.85;
    private const CAP_BYPASS_AT = 2.6;      // even over the daily cap, time-critical still goes
    private const DEFAULT_IMMEDIATE_CAP = 12;
    private const WHATSAPP_MAX = 1300;

    /** @var callable|null test seam: fn(string $body, array $fields): bool */
    public static $whatsapp = null;
    /** @var callable|null test seam: fn(string $to, string $subject, string $body): bool */
    public static $mailer = null;

    /**
     * Decide what to do with one message to the owner.
     *
     * @param array{agent:string,kind:string,tier?:string,subject:string,body:string,ref?:string} $msg
     * @return array{action:string,importance:?float,reason:string,mode:string}
     */
    public static function route(array $msg): array
    {
        $mode = AgentJudgment::mode('owner');
        $tier = $msg['tier'] ?? 'critical';
        $out = ['action' => 'send', 'importance' => null, 'reason' => '', 'mode' => $mode];
        if ($mode === 'off') {
            return $out;
        }
        try {
            if ($tier !== 'normal') {
                $out['reason'] = $tier === 'scheduled' ? 'scheduled report, never held' : 'critical by rule, never held';
                AgentJudgment::record('owner_message', $msg['agent'], $msg['kind'], $msg['ref'] ?? null, $mode, null, 'send', $msg['subject'], $out['reason']);
                return $out;
            }
            if (!AgentJudgment::available()) {
                return $out + ['reason' => 'Jev unavailable'];
            }

            $rating = self::rate($msg);
            if ($rating === null) {
                $out['reason'] = 'Jev unavailable, sent as usual';
                AgentJudgment::record('owner_message', $msg['agent'], $msg['kind'], $msg['ref'] ?? null, $mode, null, 'send', $msg['subject'], $out['reason']);
                return $out;
            }

            [$action, $why] = self::decideHandling($rating, self::immediateSentToday());
            $out['importance'] = $rating['importance'];
            $out['reason'] = $why;
            $live = $mode === 'live';

            if ($action !== 'send' && $live) {
                self::enqueue($msg, $rating, $why, $action === 'collapse');
                $out['action'] = $action;
            }
            AgentJudgment::record(
                'owner_message', $msg['agent'], $msg['kind'], $msg['ref'] ?? null, $mode, $rating, $action, $msg['subject'],
                $live ? ($action === 'send' ? 'sent now: ' . $why : 'held for the digest: ' . $why) : 'shadow: would ' . ($action === 'send' ? 'send now' : 'hold for the digest') . ': ' . $why
            );
            return $out;
        } catch (\Throwable $e) {
            error_log('OwnerMessages: ' . $e->getMessage());
            return ['action' => 'send', 'importance' => null, 'reason' => 'error, sent as usual', 'mode' => $mode];
        }
    }

    /**
     * Pure: what to do given Jev's rating and how many non-critical messages already went out today.
     *
     * @param array{importance:float,needs_action:float,duplicate:float} $r
     * @return array{0:string,1:string}
     */
    public static function decideHandling(array $r, int $immediateToday, ?int $cap = null): array
    {
        $cap ??= max(1, (int) (Settings::get('agent_owner_immediate_daily_cap') ?: self::DEFAULT_IMMEDIATE_CAP));
        if ($r['duplicate'] >= self::DUPLICATE_AT) {
            return ['collapse', sprintf('repeats a recent message (%.0f%% alike)', $r['duplicate'] * 100)];
        }
        $needsYou = $r['importance'] >= self::IMPORTANT_AT || $r['needs_action'] >= self::NEEDS_ACTION_AT;
        if ($needsYou) {
            if ($immediateToday >= $cap && $r['importance'] < self::CAP_BYPASS_AT) {
                return ['hold', "daily limit of {$cap} immediate messages reached and it is not time-critical"];
            }
            return ['send', $r['needs_action'] >= self::NEEDS_ACTION_AT ? 'needs your action' : sprintf('important (%.1f/3)', $r['importance'])];
        }
        return ['hold', sprintf('routine (%.1f/3), no action needed from you', $r['importance'])];
    }

    /**
     * Jev's rating of one message.
     *
     * @param array<string,mixed> $msg
     * @return array{importance:float,needs_action:float,duplicate:float}|null
     */
    public static function rate(array $msg): ?array
    {
        $recent = [];
        try {
            $rows = Database::get()->query(
                "SELECT agent, detail, created_at FROM agent_decisions
                 WHERE area = 'owner_message' AND created_at >= datetime('now', '-24 hours') ORDER BY id DESC LIMIT 10"
            )->fetchAll(\PDO::FETCH_ASSOC);
            foreach ($rows as $r) {
                $recent[] = ['from' => $r['agent'], 'subject' => (string) $r['detail'], 'when_utc' => $r['created_at']];
            }
        } catch (\Throwable $e) {
            // history is a nicety; rating still works without it
        }

        $answers = TypeSafeClient::ask([
            'context' => 'A solo web, mobile and AI studio owner receives messages from his team of AI agents. He wants to be interrupted only when it matters.',
            'from_agent' => $msg['agent'],
            'kind' => $msg['kind'],
            'subject' => mb_substr((string) $msg['subject'], 0, 200),
            'message' => mb_substr((string) $msg['body'], 0, 900),
            'messages_sent_to_him_recently' => $recent,
        ], [
            'importance' => [
                'type' => 'score',
                'instructions' => 'How important is it that the owner sees this message right now?',
                'criteria' => [
                    'Routine information or a status update. Nothing to do, fine to read later.',
                    'Useful to know soon, but no decision or action is needed today.',
                    'Needs the owner\'s decision or action today.',
                    'Time-critical: money at stake, a customer waiting on him, or something broken right now.',
                ],
            ],
            'needs_action' => AgentJudgment::yesNo(
                'Does this message ask the owner to decide or do something?',
                'Yes: it asks for an approval, a decision, a reply or an action.',
                'No: it only informs.'
            ),
            'duplicate' => AgentJudgment::yesNo(
                'Does this message say essentially what one of the recently sent messages already said?',
                'Yes: the same news or request as a recent message.',
                'No: it is new information.'
            ),
        ], 5, 'OwnerMessages');
        if ($answers === null) {
            return null;
        }
        $imp = TypeSafeClient::score($answers, 'importance');
        $act = TypeSafeClient::noul($answers, 'needs_action');
        $dup = TypeSafeClient::noul($answers, 'duplicate');
        if ($imp === null || $act === null || $dup === null) {
            error_log('OwnerMessages: incomplete answers: ' . substr((string) json_encode($answers), 0, 300));
            return null;
        }
        return ['importance' => round($imp, 2), 'needs_action' => round($act, 3), 'duplicate' => round($dup, 3)];
    }

    /** Non-critical messages that went out immediately in the last 24 hours (for the daily cap). */
    private static function immediateSentToday(): int
    {
        try {
            return (int) Database::get()->query(
                "SELECT COUNT(*) FROM agent_decisions WHERE area = 'owner_message' AND decision = 'send'
                   AND jev_json IS NOT NULL AND mode = 'live' AND created_at >= datetime('now', '-24 hours')"
            )->fetchColumn();
        } catch (\Throwable $e) {
            return 0;
        }
    }

    private static function enqueue(array $msg, array $rating, string $why, bool $isRepeat): void
    {
        $pdo = Database::get();
        $dupOf = null;
        if ($isRepeat) {
            $st = $pdo->prepare("SELECT id FROM owner_message_queue WHERE agent = ? AND subject = ? AND created_at >= datetime('now', '-24 hours') ORDER BY id ASC LIMIT 1");
            $st->execute([$msg['agent'], $msg['subject']]);
            $dupOf = $st->fetchColumn() ?: null;
        }
        $pdo->prepare(
            'INSERT INTO owner_message_queue (agent, kind, subject, body, ref, importance, reason, duplicate_of) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$msg['agent'], $msg['kind'], $msg['subject'], $msg['body'], $msg['ref'] ?? null, $rating['importance'], $why, $dupOf]);
    }

    // ----------------------------------------------------------------- digest

    /**
     * Which digest slot is due now, or null. A slot is due once its time has
     * passed today and it has not been sent, at most one slot per call.
     *
     * @param string $times comma separated HH:MM in site time
     */
    public static function dueSlot(\DateTime $now, string $times, ?string $lastSlot): ?string
    {
        $slots = [];
        foreach (explode(',', $times) as $t) {
            $t = trim($t);
            if (preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t)) {
                $slots[] = $t;
            }
        }
        sort($slots);
        $today = $now->format('Y-m-d');
        $due = null;
        foreach ($slots as $t) {
            $key = "{$today} {$t}";
            if ($now->format('H:i') >= $t && ($lastSlot === null || $lastSlot < $key)) {
                $due = $key;
            }
        }
        return $due;
    }

    /**
     * Send the digest if one is due (or $force). Returns how many held items went out.
     *
     * @return array{sent:int,slot:?string,note:?string}
     */
    public static function flushDigest(\PDO $pdo, bool $force = false): array
    {
        $out = ['sent' => 0, 'slot' => null, 'note' => null];
        $rows = $pdo->query("SELECT * FROM owner_message_queue WHERE status = 'held' ORDER BY created_at ASC, id ASC LIMIT 200")->fetchAll(\PDO::FETCH_ASSOC);
        if ($rows === []) {
            return $out;
        }
        if (!$force) {
            if (LisaJudgment::inQuietHours()) {
                $out['note'] = 'Quiet hours: the digest waits.';
                return $out;
            }
            $now = AgentJudgment::localNow();
            $slot = self::dueSlot($now, (string) (Settings::get('agent_digest_times') ?: '09:00,17:00'), Settings::get('agent_digest_last_slot') ?: null);
            $stale = strtotime((string) $rows[0]['created_at'] . ' UTC') < time() - 24 * 3600;
            if ($slot === null && !$stale) {
                return $out;
            }
            $out['slot'] = $slot;
        }

        [$whatsAppBody, $emailBody, $subject] = self::compose($rows);
        $to = Settings::get('notification_email') ?: Settings::get('social_email');
        $delivered = false;
        if (self::$whatsapp !== null) {
            $delivered = (bool) (self::$whatsapp)($whatsAppBody, ['name' => 'Agent digest', 'reason' => $subject, 'summary' => mb_substr($emailBody, 0, 900), 'message' => $whatsAppBody]);
        } elseif (WhatsAppNotifier::isOwnerConfigured()) {
            $delivered = WhatsAppNotifier::sendOwnerAlert($whatsAppBody, ['name' => 'Agent digest', 'reason' => $subject, 'summary' => mb_substr($emailBody, 0, 900), 'message' => $whatsAppBody]);
        }
        if ($to) {
            $mailed = self::$mailer !== null ? (bool) (self::$mailer)($to, $subject, $emailBody) : Mailer::send($to, $subject, $emailBody);
            $delivered = $delivered || $mailed;
        }
        if (!$delivered) {
            $out['note'] = 'Neither WhatsApp nor email could deliver the digest, so it stays queued.';
            return $out;
        }

        $ids = array_column($rows, 'id');
        $pdo->exec("UPDATE owner_message_queue SET status = 'sent', sent_at = datetime('now') WHERE id IN (" . implode(',', array_map('intval', $ids)) . ')');
        if ($out['slot'] !== null) {
            Settings::set('agent_digest_last_slot', $out['slot']);
        }
        $out['sent'] = count($rows);
        return $out;
    }

    /**
     * Pure: build the digest text from held rows. Grouped by agent, repeats counted, no AI.
     *
     * @param array<int,array<string,mixed>> $rows
     * @return array{0:string,1:string,2:string} [whatsapp, email, subject]
     */
    public static function compose(array $rows): array
    {
        $groups = [];
        foreach ($rows as $r) {
            $key = $r['duplicate_of'] ? 'dup' : 'main';
            if ($key === 'dup') {
                $groups['__dups'][$r['duplicate_of']] = ($groups['__dups'][$r['duplicate_of']] ?? 0) + 1;
                continue;
            }
            $groups[$r['agent']][] = $r;
        }
        $dups = $groups['__dups'] ?? [];
        unset($groups['__dups']);
        $count = count($rows);
        $subject = "Agent digest: {$count} update" . ($count === 1 ? '' : 's');

        $wa = "\u{1F4CB} *{$subject}*\n";
        $em = "{$subject}\n\nThese were routine, so they waited instead of interrupting you.\n";
        foreach ($groups as $agent => $items) {
            $wa .= "\n*" . ucfirst((string) $agent) . "*\n";
            $em .= "\n" . ucfirst((string) $agent) . "\n";
            foreach ($items as $i) {
                $repeat = $dups[$i['id']] ?? 0;
                $line = '- ' . $i['subject'] . ($repeat > 0 ? " (x" . ($repeat + 1) . ')' : '');
                $wa .= $line . "\n";
                $em .= $line . "\n  " . trim(preg_replace('/\s+/', ' ', mb_substr((string) $i['body'], 0, 400)) ?? '') . "\n";
            }
        }
        $wa .= "\nDetails: https://princecaleb.dev/admin/agent-decisions";
        if (mb_strlen($wa) > self::WHATSAPP_MAX) {
            $wa = mb_substr($wa, 0, self::WHATSAPP_MAX - 100) . "\n...and more. Full list: https://princecaleb.dev/admin/agent-decisions";
        }
        return [$wa, $em, $subject];
    }
}
