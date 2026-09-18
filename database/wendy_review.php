<?php

declare(strict_types=1);

// Wendy's autonomous review pass — runs her full chat tool loop with a
// synthetic prompt instead of Caleb actually opening a conversation with
// her. Gated by Admin -> Settings (Site tab): wendy_review_enabled must be
// "1", on the configured cadence since wendy_review_last_run, same shape as
// run_beacon_discovery.php's / allie_discover.php's gating. Run this on a
// cron — the cadence check inside decides whether today is due.
//
// She still only interrupts Caleb via wants_session/notifySessionRequest
// (email + WhatsApp, her name in the message) for something that genuinely
// earns it — this cron just means she actually looks on a schedule instead
// of only when he happens to ask, same restraint either way.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\WendyController;
use App\Support\Settings;

if (Settings::get('wendy_review_enabled') !== '1') {
    echo "Wendy's proactive review is disabled.\n";
    exit;
}

$frequency = Settings::get('wendy_review_frequency') ?: 'daily';
$lastRun = Settings::get('wendy_review_last_run');
if ($lastRun) {
    $hoursSince = (time() - strtotime($lastRun)) / 3600;
    $minHours = $frequency === 'weekly' ? 168 : ($frequency === 'hourly' ? 1 : 24);
    if ($hoursSince < $minHours) {
        echo 'Not due yet — ' . $frequency . ' cadence, last run ' . round($hoursSince, 1) . " hour(s) ago.\n";
        exit;
    }
}

$result = WendyController::runReviewPass();

if ($result['reply'] === null) {
    // Leave wendy_review_last_run unchanged so the next run retries instead
    // of waiting out the cadence on a pass that never actually ran.
    fwrite(STDERR, "Wendy's review: no AI provider produced a reply — check that one is configured and reachable.\n");
    exit(1);
}

Settings::set('wendy_review_last_run', gmdate('Y-m-d H:i:s'));
echo "Wendy's review pass completed (provider: " . ($result['provider'] ?? 'unknown') . ").\n";
echo $result['reply'] . "\n";
