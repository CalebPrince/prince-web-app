<?php

declare(strict_types=1);

// Checks the Twilio account balance and alerts once when it drops below the
// configured threshold, mirroring check_uptime.php's alert_sent/recovery
// pattern so a persistently low balance doesn't re-alert every run. Calls
// (inbound and outbound) and WhatsApp sending all draw from this one
// balance, so a drain from any of them can silently take all three down —
// catching it here matters more than for most other crons. Run hourly.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\Mailer;
use App\Support\Settings;
use App\Support\WhatsAppNotifier;

const DEFAULT_THRESHOLD = 10.0;
const TIMEOUT_SECONDS = 15;

$accountSid = trim((string) Settings::get('twilio_account_sid'));
$authToken = trim((string) Settings::get('twilio_auth_token'));
if ($accountSid === '' || $authToken === '') {
    echo "Twilio not configured, skipping.\n";
    exit;
}

$ch = curl_init("https://api.twilio.com/2010-04-01/Accounts/{$accountSid}/Balance.json");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_USERPWD => "{$accountSid}:{$authToken}",
    CURLOPT_TIMEOUT => TIMEOUT_SECONDS,
]);
$raw = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

$data = is_string($raw) ? json_decode($raw, true) : null;
if ($raw === false || $httpCode < 200 || $httpCode >= 300 || !is_array($data) || !isset($data['balance'])) {
    echo 'Twilio balance check failed: ' . ($curlError ?: (string) $raw) . "\n";
    exit(1);
}

$balance = (float) $data['balance'];
$currency = strtoupper((string) ($data['currency'] ?? 'USD'));
$threshold = (float) (Settings::get('twilio_balance_alert_threshold') ?: DEFAULT_THRESHOLD);

Settings::set('twilio_last_balance', number_format($balance, 2, '.', ''));
Settings::set('twilio_last_balance_currency', $currency);
Settings::set('twilio_balance_checked_at', gmdate('c'));

$alertSent = Settings::get('twilio_balance_alert_sent') === '1';
$notifyEmail = Settings::get('notification_email') ?: Settings::get('social_email');

if ($balance < $threshold && !$alertSent) {
    Settings::set('twilio_balance_alert_sent', '1');
    // Clear any earlier dismissal of the Attention-panel item so a fresh
    // low-balance event resurfaces it, same as PipelineController does for
    // follow_up_at and LiveChatController does for chat activity. Guarded
    // like DashboardController's own read — older deployments may not have
    // migrated this table in yet.
    $pdo = Database::get();
    if ($pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='notification_reads'")->fetchColumn()) {
        $pdo->exec("DELETE FROM notification_reads WHERE notification_key = 'twilio_balance:1'");
    }
    if ($notifyEmail) {
        Mailer::send(
            $notifyEmail,
            "\u{1F534} Twilio balance is low ({$currency} " . number_format($balance, 2) . ')',
            "Your Twilio account balance has dropped to {$currency} " . number_format($balance, 2)
                . ", below your alert threshold of {$currency} " . number_format($threshold, 2) . ".\n\n"
                . "Calls (inbound and outbound) and WhatsApp sending all draw from this same balance — "
                . "if it hits zero, all three stop and the account may be suspended.\n\n"
                . "Top up at: https://console.twilio.com/us1/billing/manage-billing/billing-overview\n\n"
                . "You'll get another email when the balance recovers above the threshold."
        );
    }
    $whatsAppSent = false;
    if (WhatsAppNotifier::isOwnerConfigured()) {
        // Best-effort: this reuses the same low Twilio balance to send itself,
        // which still works because the alert fires above zero (below the
        // threshold, not out of funds) — it just stops being reliable the
        // closer the balance gets to zero between cron runs.
        $whatsAppSent = WhatsAppNotifier::sendOwnerAlert(
            "\u{1F534} Twilio balance is low: {$currency} " . number_format($balance, 2)
                . " (below your {$currency} " . number_format($threshold, 2) . ' threshold). '
                . 'Calls and WhatsApp sending will both stop if it hits zero.'
        );
    }
    echo "Balance low ({$currency} {$balance}), email " . ($notifyEmail ? 'sent' : 'skipped')
        . ', WhatsApp ' . ($whatsAppSent ? 'sent' : 'skipped') . ".\n";
} elseif ($balance >= $threshold && $alertSent) {
    Settings::set('twilio_balance_alert_sent', '0');
    if ($notifyEmail) {
        Mailer::send(
            $notifyEmail,
            "\u{2705} Twilio balance recovered ({$currency} " . number_format($balance, 2) . ')',
            "Your Twilio account balance is back above the alert threshold: {$currency} " . number_format($balance, 2) . "."
        );
    }
    if (WhatsAppNotifier::isOwnerConfigured()) {
        WhatsAppNotifier::sendOwnerAlert(
            "\u{2705} Twilio balance recovered: {$currency} " . number_format($balance, 2)
        );
    }
    echo "Balance recovered ({$currency} {$balance}).\n";
} else {
    echo "Balance OK: {$currency} {$balance}.\n";
}
