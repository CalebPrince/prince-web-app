<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/vendor/autoload.php';
require_once dirname(__DIR__) . '/config/config.php';

use App\Support\Database;
use App\Support\Settings;
use App\Support\WhatsAppNotifier;

$pdo = Database::get();
$templateSid = trim((string) Settings::get('twilio_whatsapp_post_call_content_sid'));
$templateApproved = strtolower((string) Settings::get('twilio_whatsapp_post_call_template_status')) === 'approved';
$enabled = Settings::get('twilio_whatsapp_post_call_enabled') === '1';
if (!$enabled || !$templateApproved || $templateSid === '') {
    echo "Post-call WhatsApp is waiting for an enabled, approved template.\n";
    exit(0);
}

$rows = $pdo->query(
    "SELECT f.*, v.transcript_json
     FROM whatsapp_call_followups f
     JOIN telephony_calls tc ON tc.id = f.telephony_call_id
     LEFT JOIN voice_demo_sessions v ON v.id = f.session_id
     WHERE f.status = 'queued' AND f.attempts < 3
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

echo count($rows) . " post-call WhatsApp follow-up(s) processed.\n";
