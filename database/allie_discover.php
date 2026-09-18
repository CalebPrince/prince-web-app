<?php

declare(strict_types=1);

// Allie's autonomous discovery pass — runs her full chat tool loop with a
// synthetic prompt instead of Caleb actually asking her to look into
// something. Gated by Admin -> Settings (Site tab): allie_discovery_enabled
// must be "1", on the configured cadence since allie_discovery_last_run,
// same shape as run_beacon_discovery.php's gating. Run this on a cron — the
// cadence check inside decides whether today is due.
//
// Unlike Beacon's per-keyword search-and-score loop, this is a single
// AiAgentEngine::run() turn — Allie already has search_web/get_site_info/
// search_content/inspect_github_repository as real tools, so one turn with a
// generous tool-round budget (see AllieController::runDiscoveryPass) lets
// her research, evaluate, compare, and flag a recommendation in one pass.
// Notification (email + WhatsApp, her name in the message) happens inside
// flag_for_wendy_review via AllieController::notifyFinding() — not here —
// so a manual chat session that reaches the same tool call notifies exactly
// the same way this cron does.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\AllieController;
use App\Support\Settings;

if (Settings::get('allie_discovery_enabled') !== '1') {
    echo "Allie discovery is disabled.\n";
    exit;
}

$frequency = Settings::get('allie_discovery_frequency') ?: 'daily';
$lastRun = Settings::get('allie_discovery_last_run');
if ($lastRun) {
    $hoursSince = (time() - strtotime($lastRun)) / 3600;
    $minHours = $frequency === 'weekly' ? 168 : ($frequency === 'hourly' ? 1 : 24);
    if ($hoursSince < $minHours) {
        echo 'Not due yet — ' . $frequency . ' cadence, last run ' . round($hoursSince, 1) . " hour(s) ago.\n";
        exit;
    }
}

$result = AllieController::runDiscoveryPass();

if ($result['reply'] === null) {
    // Leave allie_discovery_last_run unchanged so the next run retries
    // instead of waiting out the cadence on a pass that never actually ran —
    // same principle as run_beacon_discovery.php's all-searches-failed case.
    fwrite(STDERR, "Allie discovery: no AI provider produced a reply — check that one is configured and reachable.\n");
    exit(1);
}

Settings::set('allie_discovery_last_run', gmdate('Y-m-d H:i:s'));
echo "Allie's discovery pass completed (provider: " . ($result['provider'] ?? 'unknown') . ").\n";
echo $result['reply'] . "\n";
