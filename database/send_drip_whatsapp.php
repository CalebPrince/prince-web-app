<?php

declare(strict_types=1);

// Sends any drip-sequence WhatsApp steps that have come due — the WhatsApp
// counterpart to send_drip_emails.php. Same day_offset/drip_sends dedup
// logic, but delivering through Twilio's Content API (business-initiated,
// works outside any open WhatsApp session) instead of Mailer. Gated by the
// whatsapp_drip_enabled setting: this sends real WhatsApp messages to real
// leads, so — like every other autonomous send path here — it ships off
// until an admin switches it on in Settings.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\Settings;
use App\Support\TwilioClient;

if (Settings::get('whatsapp_drip_enabled') !== '1') {
    echo "whatsapp_drip_enabled is off — nothing sent.\n";
    exit;
}

if (!TwilioClient::isConfigured()) {
    echo "Twilio is not configured — nothing sent.\n";
    exit;
}

$pdo = Database::get();

// Only enrollments with a phone on file can ever match — one enrolled purely
// by email (no phone captured at the trigger site) simply never appears
// here, the same way an enrollment with no active whatsapp steps never does.
$due = $pdo->query(
    "SELECT e.id AS enrollment_id, e.phone, e.name, e.lead_industry, e.last_action,
            s.id AS step_id, s.whatsapp_template_sid, s.whatsapp_variables
     FROM drip_enrollments e
     JOIN automations a ON a.id = e.automation_id AND a.is_active = 1
     JOIN drip_steps s ON s.automation_id = e.automation_id AND s.is_active = 1 AND s.channel = 'whatsapp'
     WHERE e.status = 'active'
       AND e.phone IS NOT NULL AND trim(e.phone) <> ''
       AND datetime(e.enrolled_at, '+' || s.day_offset || ' days') <= datetime('now')
       AND NOT EXISTS (SELECT 1 FROM drip_sends ds WHERE ds.enrollment_id = e.id AND ds.step_id = s.id)
     ORDER BY e.id, s.day_offset"
)->fetchAll();

$sent = 0;
foreach ($due as $row) {
    $tokens = [
        '{{name}}' => trim((string) ($row['name'] ?? '')) ?: 'there',
        '{{lead_industry}}' => trim((string) ($row['lead_industry'] ?? '')) ?: 'your business',
        '{{last_action}}' => trim((string) ($row['last_action'] ?? '')),
    ];

    $variables = [];
    if (!empty($row['whatsapp_variables'])) {
        $decoded = json_decode((string) $row['whatsapp_variables'], true);
        if (is_array($decoded)) {
            foreach ($decoded as $placeholder => $value) {
                $variables[$placeholder] = strtr((string) $value, $tokens);
            }
        }
    }

    $result = TwilioClient::sendTemplate($row['phone'], (string) $row['whatsapp_template_sid'], $variables);
    if ($result['ok']) {
        $pdo->prepare('INSERT OR IGNORE INTO drip_sends (enrollment_id, step_id) VALUES (?, ?)')
            ->execute([$row['enrollment_id'], $row['step_id']]);
        $sent++;
    } else {
        error_log('send_drip_whatsapp: step ' . $row['step_id'] . ' to enrollment ' . $row['enrollment_id'] . ' failed: ' . $result['error']);
    }
}

// Same completion sweep send_drip_emails.php runs — it isn't channel-scoped
// (an enrollment completes once EVERY active step of its automation, email
// or whatsapp, has a drip_sends row), so running it here too just lets
// whichever cron happens to send the last outstanding step also close the
// enrollment out, instead of waiting for the other one's next run.
$completed = $pdo->exec(
    "UPDATE drip_enrollments SET status = 'completed'
     WHERE status = 'active'
       AND (SELECT is_active FROM automations WHERE id = drip_enrollments.automation_id) = 1
       AND (SELECT COUNT(*) FROM drip_steps WHERE is_active = 1 AND automation_id = drip_enrollments.automation_id) > 0
       AND NOT EXISTS (
         SELECT 1 FROM drip_steps s
         WHERE s.is_active = 1 AND s.automation_id = drip_enrollments.automation_id
           AND NOT EXISTS (SELECT 1 FROM drip_sends ds WHERE ds.enrollment_id = drip_enrollments.id AND ds.step_id = s.id)
       )
       AND (
         nurturer_enabled = 0
         OR (
           SELECT COUNT(*) FROM nurturer_sends ns
           WHERE ns.enrollment_id = drip_enrollments.id AND ns.sequence_number IN (2, 3)
         ) = 2
       )"
);

echo "$sent drip WhatsApp message(s) sent, $completed enrollment(s) completed.\n";
