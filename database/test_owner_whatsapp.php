<?php

declare(strict_types=1);

// Controlled production smoke test for the two owner-WhatsApp notification
// paths. CLI-only so it cannot be triggered from the public website.

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Agents\Chief;
use App\Support\Database;
use App\Support\WhatsAppNotifier;

$mode = strtolower(trim((string) ($argv[1] ?? 'all')));
if (!in_array($mode, ['all', 'lisa', 'chief'], true)) {
    fwrite(STDERR, "Usage: php database/test_owner_whatsapp.php [all|lisa|chief]\n");
    exit(2);
}

$provider = WhatsAppNotifier::provider();
echo "Provider (whatsapp_provider): {$provider}\n";

// Name the setting that is actually missing. "Not fully configured" on its own
// sends you back to a settings page with twenty fields and no idea which one.
$required = $provider === 'elevenlabs'
    ? ['owner_whatsapp_number', 'elevenlabs_api_key', 'elevenlabs_whatsapp_agent_id',
       'elevenlabs_whatsapp_phone_number_id', 'elevenlabs_whatsapp_alert_template_name']
    : ['owner_whatsapp_number', 'whapi_api_token'];

$missing = [];
foreach ($required as $key) {
    if (trim((string) App\Support\Settings::get($key)) === '') {
        $missing[] = $key;
    }
}
if (WhatsAppNotifier::address((string) App\Support\Settings::get('owner_whatsapp_number')) === null
    && !in_array('owner_whatsapp_number', $missing, true)) {
    $missing[] = 'owner_whatsapp_number (must be + followed by digits, e.g. +233208049962)';
}

if ($missing !== []) {
    fwrite(STDERR, "Owner WhatsApp is not fully configured. Missing in Admin Settings:\n  - "
        . implode("\n  - ", $missing) . "\n");
    exit(1);
}

if ($provider === 'elevenlabs') {
    echo 'Alert template: ' . App\Support\Settings::get('elevenlabs_whatsapp_alert_template_name')
        . ' (' . (App\Support\Settings::get('elevenlabs_whatsapp_alert_template_lang') ?: 'en') . ')'
        . ', placeholders: {{' . implode('}}, {{', array_map(
            static fn(int $i): string => (string) ($i + 1),
            array_keys(App\Support\ElevenLabsWhatsAppClient::paramOrder())
        )) . "}} = "
        . implode(', ', App\Support\ElevenLabsWhatsAppClient::paramOrder()) . "\n";
}

$failed = false;
if ($mode === 'all' || $mode === 'lisa') {
    $sent = WhatsAppNotifier::sendOwnerAlert(
        "🧪 *DEMO — Lisa handoff alert*\n\n"
        . "Name: Ama Mensah\n"
        . "Email: ama.demo@example.com\n"
        . "Phone: +233 20 000 0000\n"
        . "Request: Wants an AI receptionist for a clinic to answer calls, book appointments, and hand urgent cases to staff.\n"
        . "Reason: Asked to speak directly with Prince Caleb about implementation.\n\n"
        . "This is a controlled test; no real visitor is waiting.\n"
        . "Admin Inbox: https://princecaleb.dev/admin/inbox.html",
        [
            'name' => 'Ama Mensah',
            'email' => 'ama.demo@example.com',
            'phone' => '+233 20 000 0000',
            'reason' => 'Asked to speak directly with Prince Caleb about implementation.',
            'summary' => 'Wants an AI receptionist for a clinic to answer calls, book appointments, and hand urgent cases to staff.',
            'message' => 'DEMO — controlled test, no real visitor is waiting.',
        ]
    );
    echo $sent
        ? "Lisa demo WhatsApp accepted by {$provider}.\n"
        : "Lisa demo WhatsApp failed; check the PHP error log for the provider's response.\n";
    $failed = $failed || !$sent;
}

if ($mode === 'all' || $mode === 'chief') {
    $pdo = Database::get();
    $today = (string) $pdo->query("SELECT date('now')")->fetchColumn();
    $brief = Chief::generateBrief($pdo, 24, $today);
    if (!$brief) {
        echo "Chief demo failed: the daily brief could not be generated.\n";
        $failed = true;
    } else {
        // Re-open only the WhatsApp channel for this deliberate smoke test.
        // The email timestamp is preserved, so testing WhatsApp cannot resend
        // today's email.
        $pdo->prepare('UPDATE agent_daily_briefs SET whatsapp_sent_at = NULL WHERE id = ?')
            ->execute([$brief['id']]);
        $brief['whatsapp_sent_at'] = null;
        // This smoke test targets WhatsApp only, even if today's scheduled
        // email has not run yet.
        $brief['emailed_at'] = $brief['emailed_at'] ?: 'test-email-suppressed';
        $sent = Chief::emailBrief($pdo, $brief);
        echo $sent
            ? "Chief demo WhatsApp accepted by Whapi.\n"
            : "Chief demo has a failed notification channel; check the PHP error log and Whapi delivery logs.\n";
        $failed = $failed || !$sent;
    }
}

exit($failed ? 1 : 0);
