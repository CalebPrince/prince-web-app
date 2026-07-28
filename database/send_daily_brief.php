<?php

declare(strict_types=1);

// Chief's daily brief: counts what every other agent did in the last 24 hours,
// writes it up, stores it, and emails it to the studio's notification address.
//
// Run once a day (see README). Running it more often is harmless: the brief is
// keyed on the date, so a second run refreshes that day's row rather than
// stacking duplicates, and emailed_at means it is only ever sent once a day.
// Pass --force to rewrite and re-send today's brief anyway, and --no-email to
// write it without sending.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Agents\Chief;
use App\Support\Database;

$force = in_array('--force', $argv ?? [], true);
$noEmail = in_array('--no-email', $argv ?? [], true);

$pdo = Database::get();
$today = (string) $pdo->query("SELECT date('now')")->fetchColumn();

$existing = Chief::briefFor($pdo, $today);
if ($existing !== null && !$force) {
    if ($noEmail) {
        echo "Today's brief is already written; not sending notifications (--no-email).\n";
        exit;
    }
    // Written but unsent — a brief raised by the admin "run now" button, or by
    // a run where SMTP was briefly down, should still reach the inbox rather
    // than being skipped because the writing half already succeeded.
    $sent = Chief::emailBrief($pdo, $existing);
    echo $sent ? "Today's brief notifications delivered.\n" : "Today's brief has a pending notification channel.\n";
    exit;
}

$brief = Chief::generateBrief($pdo, 24, $today);
if (!$brief) {
    echo "The brief could not be written.\n";
    exit(1);
}

echo "Brief written: {$brief['headline']}\n";

if ($noEmail) {
    exit;
}

if ($force) {
    $pdo->prepare('UPDATE agent_daily_briefs SET emailed_at = NULL, whatsapp_sent_at = NULL WHERE id = ?')
        ->execute([$brief['id']]);
    $brief['emailed_at'] = null;
    $brief['whatsapp_sent_at'] = null;
}

echo Chief::emailBrief($pdo, $brief)
    ? "Brief notifications delivered.\n"
    : "Brief written, but one notification channel could not be delivered.\n";
