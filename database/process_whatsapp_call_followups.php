<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/autoload.php';
require_once dirname(__DIR__) . '/config/config.php';

use App\Support\Database;
use App\Support\EmailTemplate;
use App\Support\Mailer;
use App\Support\Settings;
use App\Support\WhatsAppNotifier;

$pdo = Database::get();
$templateSid = trim((string) Settings::get('twilio_whatsapp_post_call_content_sid'));
$templateApproved = strtolower((string) Settings::get('twilio_whatsapp_post_call_template_status')) === 'approved';
$enabled = Settings::get('twilio_whatsapp_post_call_enabled') === '1';
$rows = $pdo->query(
    "SELECT f.*, v.transcript_json
     FROM whatsapp_call_followups f
     JOIN telephony_calls tc ON tc.id = f.telephony_call_id
     LEFT JOIN voice_demo_sessions v ON v.id = f.session_id
     WHERE (f.status = 'queued' OR f.email_status = 'queued') AND f.attempts < 3
       AND tc.status = 'completed'
     ORDER BY f.created_at ASC LIMIT 20"
)->fetchAll();

foreach ($rows as $row) {
    $turns = json_decode((string) ($row['transcript_json'] ?? '[]'), true) ?: [];
    $points = [];
    foreach ($turns as $turn) {
        if (!is_array($turn)) continue;
        $text = trim(preg_replace('/\s+/', ' ', (string) ($turn['text'] ?? '')) ?? '');
        if ($text === '') continue;
        $speaker = ($turn['role'] ?? '') === 'assistant' ? 'Lisa' : 'Customer';
        $points[] = "{$speaker}: " . mb_substr($text, 0, 220);
    }
    $summary = $points
        ? mb_substr(implode("\n", array_slice($points, -6)), 0, 1200)
        : 'Thank you for discussing your business needs with Lisa.';
    $name = trim((string) ($row['contact_name'] ?? '')) ?: 'there';
    if (($row['email_status'] ?? '') === 'queued' && filter_var($row['recipient_email'] ?? '', FILTER_VALIDATE_EMAIL)) {
        $html = EmailTemplate::wrapMarketing(
            "Hi {$name},\n\nThank you for speaking with Lisa today.\n\nHere is a summary of your call:\n{$summary}\n\nReply to this email if you have any questions.",
            'Lisa call summary'
        );
        $sent = Mailer::sendHtml(
            (string) $row['recipient_email'],
            'Your conversation with Lisa — summary and next steps',
            $html,
            "Hi {$name},\n\nThank you for speaking with Lisa today.\n\nHere is a summary of your call:\n{$summary}\n\nReply to this email if you have any questions."
        );
        $pdo->prepare(
            "UPDATE whatsapp_call_followups SET email_status = ?,
             email_sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE email_sent_at END,
             summary = ?, attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?"
        )->execute([$sent ? 'sent' : 'failed', $sent ? 'sent' : 'failed', $summary, $row['id']]);
    }

    if (($row['status'] ?? '') === 'queued' && $enabled && $templateApproved && $templateSid !== '') {
        $pdo->prepare(
            "UPDATE whatsapp_call_followups SET status = 'processing', summary = ?, content_sid = ?,
             attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?"
        )->execute([$summary, $templateSid, $row['id']]);
        $result = WhatsAppNotifier::sendTemplate(
            (string) $row['recipient_number'],
            $templateSid,
            ['1' => mb_substr($name, 0, 80), '2' => $summary]
        );
        $pdo->prepare(
            "UPDATE whatsapp_call_followups SET status = ?, provider_message_sid = ?, error_message = ?,
             processed_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE processed_at END,
             updated_at = datetime('now') WHERE id = ?"
        )->execute([
            $result['ok'] ? 'sent' : 'failed',
            $result['sid'],
            $result['error'],
            $result['ok'] ? 'sent' : 'failed',
            $row['id'],
        ]);
    }
}

echo count($rows) . " post-call email/WhatsApp follow-up(s) processed.\n";
