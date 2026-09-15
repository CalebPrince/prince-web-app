<?php

declare(strict_types=1);

// Nudges a contact who was sent the WhatsApp asset-request template but
// hasn't sent what was asked for: once ~4 hours after the request, then
// again at ~24 hours if still nothing. fulfilled_at stays null until an
// admin marks the request received (Admin -> Marketing Leads -> Templates
// sent -> Mark received) — see LiveChatController::markIntroFulfilled()'s
// docblock for why that can't be automatic (inbound WhatsApp media isn't
// captured anywhere in this app, and a text reply could say anything).
//
// A nudge inside WhatsApp's 24h customer-service session window (the
// contact wrote to Lisa's number within the last 24h) goes out as free
// text; outside it, WhatsApp requires a pre-approved template to reach them
// at all, so this resends the same already-approved asset-request template
// rather than needing a second one approved just for nudging.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\Settings;
use App\Support\TwilioClient;

const NUDGE_TIERS = [
    ['column' => 'nudge_4h_sent_at', 'hours' => 4],
    ['column' => 'nudge_24h_sent_at', 'hours' => 24],
];

$pdo = Database::get();

if (Settings::get('whatsapp_provider') !== 'twilio') {
    echo "Skipped — whatsapp_provider is not twilio.\n";
    exit;
}

$contentSid = trim((string) Settings::get('twilio_asset_request_content_sid'));
$templateStatus = strtolower((string) Settings::get('twilio_asset_request_template_status'));
if ($contentSid === '' || $templateStatus !== 'approved' || !TwilioClient::isConfigured()) {
    echo "Skipped — asset-request template not configured/approved yet.\n";
    exit;
}

$sent = 0;
foreach (NUDGE_TIERS as $tier) {
    $column = $tier['column'];
    $hours = $tier['hours'];

    // in_session is computed in SQL (rather than compared against a PHP
    // DateTime) so it lines up exactly with how last_inbound_at itself was
    // written — both sides of the comparison are SQLite's own datetime('now').
    $candidates = $pdo->prepare(
        "SELECT wi.id, wi.contact_name, wi.phone_number, wi.request_text,
                (cs.last_inbound_at IS NOT NULL AND cs.last_inbound_at >= datetime('now', '-24 hours')) AS in_session
         FROM whatsapp_intros wi
         LEFT JOIN chat_sessions cs ON cs.token = 'whatsapp:' || wi.phone_number
         WHERE wi.template_name = :sid
           AND wi.status = 'sent'
           AND wi.fulfilled_at IS NULL
           AND wi.{$column} IS NULL
           AND wi.created_at <= datetime('now', :window)"
    );
    $candidates->execute(['sid' => $contentSid, 'window' => "-{$hours} hours"]);

    foreach ($candidates->fetchAll() as $row) {
        $digits = preg_replace('/\D+/', '', (string) $row['phone_number']) ?? '';
        if ($digits === '') {
            continue;
        }
        $ask = trim((string) $row['request_text']) !== '' ? $row['request_text'] : 'that';

        $result = $row['in_session']
            ? TwilioClient::sendText(
                $digits,
                "Hi {$row['contact_name']}, just following up — still need {$ask} for your website "
                    . "project when you get a chance. Let me know if you have any questions! — Lisa"
            )
            : TwilioClient::sendTemplate($digits, $contentSid, [
                '1' => (string) $row['contact_name'],
                '2' => (string) $ask,
            ]);

        if ($result['ok']) {
            $pdo->prepare("UPDATE whatsapp_intros SET {$column} = datetime('now') WHERE id = ?")
                ->execute([$row['id']]);
            $sent++;
        } else {
            error_log('Asset-request nudge failed for intro #' . $row['id'] . ': ' . (string) $result['error']);
        }
    }
}

echo "$sent asset-request nudge(s) sent.\n";
