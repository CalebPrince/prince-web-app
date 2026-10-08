<?php

declare(strict_types=1);

// One-off: changes the WhatsApp display name of Lisa's Twilio sender through
// Twilio's Senders API (v2), which hands the change to Meta for display name
// review. Exists because neither Twilio's console nor Meta's WhatsApp Manager
// lets the name be edited for this sender (the Save button stays disabled
// while Twilio manages the number), and support ticket #29881246 is the only
// other route.
//
// Run it on the server, from the app root:
//   php database/update_whatsapp_display_name.php
//       Read-only. Finds the sender matching twilio_whatsapp_number and
//       prints its current display name and status. Run this first, and
//       again afterwards to watch the review.
//   php database/update_whatsapp_display_name.php --apply
//       Submits "Lisa - Prince Caleb Support" as the new display name.
//   php database/update_whatsapp_display_name.php --apply "Another Name"
//       Submits a different name instead.
//
// The old name stays live until Meta approves the new one; messaging is not
// interrupted while the review runs.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Settings;
use App\Support\TwilioClient;

const SENDERS_API = 'https://messaging.twilio.com/v2/Channels/Senders';
const DEFAULT_NAME = 'Lisa - Prince Caleb Support';

/** @return array{status:int,body:?array,raw:string,error:string} */
function twilioRequest(string $method, string $url, ?array $json = null): array
{
    $ch = curl_init($url);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_USERPWD => trim((string) Settings::get('twilio_account_sid')) . ':' . trim((string) Settings::get('twilio_auth_token')),
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ];
    if ($json !== null) {
        $options[CURLOPT_POSTFIELDS] = json_encode($json, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $options[CURLOPT_HTTPHEADER][] = 'Content-Type: application/json';
    }
    curl_setopt_array($ch, $options);

    $raw = curl_exec($ch);
    $result = [
        'status' => (int) curl_getinfo($ch, CURLINFO_HTTP_CODE),
        'body' => null,
        'raw' => is_string($raw) ? $raw : '',
        'error' => curl_error($ch),
    ];
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        $result['body'] = is_array($decoded) ? $decoded : null;
    }
    return $result;
}

function describe(array $sender): void
{
    $profile = is_array($sender['profile'] ?? null) ? $sender['profile'] : [];
    echo "  sender:       " . ($sender['sender_id'] ?? '?') . "\n";
    echo "  sid:          " . ($sender['sid'] ?? '?') . "\n";
    echo "  status:       " . ($sender['status'] ?? '?') . "\n";
    echo "  display name: " . ($profile['name'] ?? '(none)') . "\n";
    // The three pending_display_name* fields are present or absent together:
    // PENDING_REVIEW / APPROVED / DECLINED come from Meta, COMPLETED means the
    // name is applied, PIN_MISMATCH / REGISTRATION_FAILED / EXPIRED mean an
    // approved name wasn't applied and re-running --apply retries it.
    if (!empty($profile['pending_display_name'])) {
        echo "  pending name: " . $profile['pending_display_name']
            . " [" . ($profile['pending_display_name_status'] ?? '?') . ", "
            . ($profile['pending_display_name_status_date'] ?? '?') . "]\n";
    }
    if (!empty($profile['display_name_status'])) {
        echo "  submission:   " . $profile['display_name_status'] . "\n";
    }
    // quality_rating and messaging_limit.
    if (!empty($sender['properties']) && is_array($sender['properties'])) {
        foreach ($sender['properties'] as $key => $value) {
            if (is_scalar($value) && $value !== '') {
                echo "  {$key}: {$value}\n";
            }
        }
    }
    if (!empty($sender['offline_reasons'])) {
        echo "  offline reasons: " . json_encode($sender['offline_reasons'], JSON_UNESCAPED_SLASHES) . "\n";
    }
}

/** @return array<string,mixed>|null */
function findSender(string $digits): ?array
{
    $url = SENDERS_API . '?Channel=whatsapp&PageSize=50';
    while ($url !== '') {
        $res = twilioRequest('GET', $url);
        if ($res['status'] !== 200 || $res['body'] === null) {
            fwrite(STDERR, "Could not list senders: HTTP {$res['status']} {$res['error']}\n" . mb_substr($res['raw'], 0, 1000) . "\n");
            exit(1);
        }
        foreach ($res['body']['senders'] ?? [] as $sender) {
            $senderDigits = preg_replace('/\D+/', '', (string) ($sender['sender_id'] ?? '')) ?? '';
            if ($senderDigits === $digits) {
                return $sender;
            }
        }
        $url = (string) ($res['body']['meta']['next_page_url'] ?? '');
    }
    return null;
}

if (!TwilioClient::isConfigured()) {
    fwrite(STDERR, "twilio_account_sid / twilio_auth_token are not set in Admin -> Settings.\n");
    exit(1);
}
$digits = TwilioClient::senderDigits();
if ($digits === '') {
    fwrite(STDERR, "twilio_whatsapp_number is not set in Admin -> Settings.\n");
    exit(1);
}

$apply = in_array('--apply', $argv, true);
$nameArgs = array_values(array_filter(array_slice($argv, 1), static fn ($a) => $a !== '--apply'));
$newName = trim($nameArgs[0] ?? DEFAULT_NAME);

$sender = findSender($digits);
if ($sender === null) {
    fwrite(STDERR, "No Twilio WhatsApp sender matches +{$digits}. Check twilio_whatsapp_number.\n");
    exit(1);
}

echo "Current sender:\n";
describe($sender);

if (!$apply) {
    echo "\nRead-only run. To submit \"{$newName}\" for Meta review, re-run with --apply.\n";
    exit(0);
}

// Meta allows only a few name changes per 30 days, so don't spend one on a
// name that is already live or already in review. A failed application
// (PIN_MISMATCH etc.) is the exception: resubmitting retries it for free.
$profile = is_array($sender['profile'] ?? null) ? $sender['profile'] : [];
$pendingStatus = (string) ($profile['pending_display_name_status'] ?? '');
if ((string) ($profile['name'] ?? '') === $newName && $pendingStatus !== 'PENDING_REVIEW') {
    echo "\nThe display name is already \"{$newName}\". Nothing to do.\n";
    exit(0);
}
if ((string) ($profile['pending_display_name'] ?? '') === $newName && in_array($pendingStatus, ['PENDING_REVIEW', 'APPROVED'], true)) {
    echo "\n\"{$newName}\" is already {$pendingStatus}. Nothing to submit; re-run without --apply to watch it.\n";
    exit(0);
}

echo "\nSubmitting display name \"{$newName}\"...\n";
$res = twilioRequest('POST', SENDERS_API . '/' . rawurlencode((string) $sender['sid']), [
    'profile' => ['name' => $newName],
]);

if ($res['status'] < 200 || $res['status'] >= 300) {
    $hints = [
        63124 => 'Meta rejected the name. Change it to meet the display name guidelines and retry.',
        63121 => 'A name change is already in review for this sender. Wait for it to finish.',
        63100 => 'Validation error (empty or over-long name).',
        20404 => 'Sender not found, or not a WhatsApp Cloud API sender (then only Twilio support can change it).',
        63117 => 'Twilio could not reach Meta. Retry in a few minutes.',
    ];
    $code = (int) ($res['body']['code'] ?? 0);
    fwrite(STDERR, "Twilio rejected the update: HTTP {$res['status']} {$res['error']}\n"
        . (isset($hints[$code]) ? $hints[$code] . "\n" : '')
        . mb_substr($res['raw'], 0, 2000) . "\n");
    exit(1);
}

// A 202 carries profile.display_name_status: updating (sent to Meta),
// no_change, pending_review (that name is already in review) or error
// (the name failed even though the request itself succeeded).
$submission = (string) ($res['body']['profile']['display_name_status'] ?? '');
echo "Twilio answered HTTP {$res['status']}, display_name_status: " . ($submission !== '' ? $submission : '(not reported)') . "\n";
if ($submission === 'error') {
    fwrite(STDERR, "The name change failed on Twilio's side. Full response:\n" . mb_substr($res['raw'], 0, 2000) . "\n");
    exit(1);
}
echo "\nMeta reviews the new name next; the old one stays live until it is approved,\n"
    . "then Twilio applies it automatically. Re-run without --apply to check progress.\n";
