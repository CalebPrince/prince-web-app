<?php

declare(strict_types=1);

// Rocco's scheduled review of the TypeSafe gate: runs his full tool loop with a
// synthetic prompt, so he writes a report and, if the numbers support it,
// saves recommendations for /admin/rocco. Gated by Admin -> Settings (Site
// tab): rocco_review_enabled must be "1", on the configured cadence since
// rocco_review_last_run, same shape as wendy_review.php. Run this on a cron;
// the cadence check inside decides whether today is due. A weekly cadence
// suits the shadow-mode trial (it needs days of data to say anything).

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\RoccoController;
use App\Support\Settings;

if (Settings::get('rocco_review_enabled') !== '1') {
    echo "Rocco's scheduled review is disabled.\n";
    exit;
}

$frequency = Settings::get('rocco_review_frequency') ?: 'weekly';
$lastRun = Settings::get('rocco_review_last_run');
if ($lastRun) {
    $hoursSince = (time() - strtotime($lastRun . ' UTC')) / 3600;
    $minHours = $frequency === 'weekly' ? 168 : ($frequency === 'hourly' ? 1 : 24);
    if ($hoursSince < $minHours) {
        echo 'Not due yet: ' . $frequency . ' cadence, last run ' . round($hoursSince, 1) . " hour(s) ago.\n";
        exit;
    }
}

$result = RoccoController::runReviewPass();

if ($result['reply'] === null) {
    // Leave rocco_review_last_run unchanged so the next run retries instead
    // of waiting out the cadence on a pass that never actually ran.
    fwrite(STDERR, "Rocco's review: no AI provider produced a reply. Check that one is configured and reachable.\n");
    exit(1);
}

Settings::set('rocco_review_last_run', gmdate('Y-m-d H:i:s'));
echo "Rocco's review completed (provider: " . ($result['provider'] ?? 'unknown') . ").\n";
echo $result['reply'] . "\n";
