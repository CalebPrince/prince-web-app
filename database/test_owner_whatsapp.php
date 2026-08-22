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
    fwrite(STDERR,
        "Usage: php database/test_owner_whatsapp.php [all|lisa|chief]"
        . " [--template=NAME] [--lang=CODE] [--params=field,field]\n\n"
        . "  --template  Send this approved template instead of the one in\n"
        . "              Settings. Lets the pipeline be proved against a\n"
        . "              template that is already approved without writing a\n"
        . "              name into the setting real handoffs read.\n"
        . "  --params    Ordered fields filling {{1}}, {{2}}, ... Must match the\n"
        . "              template's placeholder count or Meta rejects the send.\n"
        . "              One of: " . implode(', ', App\Support\ElevenLabsWhatsAppClient::FIELDS) . "\n\n"
        . "  e.g. php database/test_owner_whatsapp.php lisa --template=lisa_intro --params=name\n");
    exit(2);
}

/** @return ?string */
$opt = static function (string $name) use ($argv): ?string {
    foreach ($argv as $arg) {
        if (str_starts_with($arg, "--{$name}=")) {
            return trim(substr($arg, strlen($name) + 3));
        }
    }
    return null;
};
$overrideTemplate = $opt('template');
$overrideLang = $opt('lang');
$overrideParams = $opt('params');

$provider = WhatsAppNotifier::provider();
echo "Provider (whatsapp_provider): {$provider}\n";

// Name the setting that is actually missing. "Not fully configured" on its own
// sends you back to a settings page with twenty fields and no idea which one.
$required = $provider === 'elevenlabs'
    ? ['owner_whatsapp_number', 'elevenlabs_api_key', 'elevenlabs_whatsapp_agent_id',
       'elevenlabs_whatsapp_phone_number_id', 'elevenlabs_whatsapp_alert_template_name']
    : ['owner_whatsapp_number', 'whapi_api_token'];

// --template supplies the one thing the alert setting would have: with it, the
// setting is not required and the run proves everything else.
if ($overrideTemplate !== null && $overrideTemplate !== '') {
    $required = array_values(array_diff($required, ['elevenlabs_whatsapp_alert_template_name']));
}

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

$template = $overrideTemplate !== null && $overrideTemplate !== ''
    ? $overrideTemplate
    : (string) App\Support\Settings::get('elevenlabs_whatsapp_alert_template_name');
$lang = $overrideLang !== null && $overrideLang !== ''
    ? $overrideLang
    : ((string) App\Support\Settings::get('elevenlabs_whatsapp_alert_template_lang') ?: 'en');
$order = $overrideParams !== null && $overrideParams !== ''
    ? array_values(array_filter(
        array_map(static fn(string $f): string => strtolower(trim($f)), explode(',', $overrideParams)),
        static fn(string $f): bool => in_array($f, App\Support\ElevenLabsWhatsAppClient::FIELDS, true)
    ))
    : App\Support\ElevenLabsWhatsAppClient::paramOrder();

if ($provider === 'elevenlabs') {
    // Print the resolved mapping before sending: a count that disagrees with
    // the approved template is the usual rejection, and it is far easier to
    // spot here than in a Meta error code.
    $slots = [];
    foreach ($order as $i => $field) {
        $slots[] = '{{' . ($i + 1) . '}}=' . $field;
    }
    echo "Template: {$template} ({$lang})"
        . ($overrideTemplate !== null && $overrideTemplate !== '' ? ' [from --template, settings untouched]' : '')
        . "\nPlaceholders: " . ($slots === [] ? '(none)' : implode('  ', $slots)) . "\n";
}

$demoFields = [
    'name' => 'Ama Mensah',
    'email' => 'ama.demo@example.com',
    'phone' => '+233 20 000 0000',
    'reason' => 'Asked to speak directly with Prince Caleb about implementation.',
    'summary' => 'Wants an AI receptionist for a clinic to answer calls, book appointments, and hand urgent cases to staff.',
    'message' => 'DEMO — controlled test, no real visitor is waiting.',
];
$demoBody = "🧪 *DEMO — Lisa handoff alert*\n\n"
    . "Name: {$demoFields['name']}\n"
    . "Email: {$demoFields['email']}\n"
    . "Phone: {$demoFields['phone']}\n"
    . "Request: {$demoFields['summary']}\n"
    . "Reason: {$demoFields['reason']}\n\n"
    . "This is a controlled test; no real visitor is waiting.\n"
    . "Admin Inbox: https://princecaleb.dev/admin/inbox.html";

$failed = false;
if ($mode === 'all' || $mode === 'lisa') {
    if ($provider === 'elevenlabs' && $overrideTemplate !== null && $overrideTemplate !== '') {
        // Straight to the client so the override applies without any setting
        // standing in for it.
        $result = App\Support\ElevenLabsWhatsAppClient::sendTemplate(
            (string) App\Support\Settings::get('owner_whatsapp_number'),
            $template,
            $lang,
            $order,
            $demoFields
        );
        $sent = $result['ok'];
        if (!$sent && $result['error']) {
            fwrite(STDERR, 'Provider said: ' . $result['error'] . "\n");
        }
    } else {
        $sent = WhatsAppNotifier::sendOwnerAlert($demoBody, $demoFields);
    }
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
