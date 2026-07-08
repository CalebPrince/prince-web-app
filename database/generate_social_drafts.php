<?php

declare(strict_types=1);

// Generates one AI social post draft per run, gated by Admin -> Settings:
// social_draft_enabled must be "1", and on a weekly cadence this only fires
// once 7+ days have passed since social_draft_last_run. Run this daily via
// cron — the cadence check inside decides whether today is actually due.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\SocialDraftController;
use App\Support\Settings;

if (Settings::get('social_draft_enabled') !== '1') {
    echo "Social post draft generation is disabled.\n";
    exit;
}

$frequency = Settings::get('social_draft_frequency') ?: 'daily';
$lastRun = Settings::get('social_draft_last_run');

if ($frequency === 'weekly' && $lastRun) {
    $daysSince = (time() - strtotime($lastRun)) / 86400;
    if ($daysSince < 7) {
        echo "Not due yet — weekly cadence, last run " . round($daysSince, 1) . " day(s) ago.\n";
        exit;
    }
}

$result = SocialDraftController::generateDraft();
if ($result) {
    Settings::set('social_draft_last_run', gmdate('Y-m-d H:i:s'));
    echo "1 social post draft generated (id {$result['id']}).\n";
} else {
    echo "Draft generation failed — check that an AI provider is configured and reachable.\n";
}
