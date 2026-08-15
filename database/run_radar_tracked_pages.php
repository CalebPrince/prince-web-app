<?php

declare(strict_types=1);

// Radar's tracked-page cache refresh. Unlike Beacon's Apify discovery
// (run_beacon_apify_discovery.php), this does no AI qualification and no
// engager-scraping stage — it just fetches each tracked LinkedIn page's
// recent posts and caches the raw result in radar_tracked_page_findings, so
// Radar's chat (get_tracked_pages_findings tool) can reason over real,
// current content without a URL ever being re-pasted into a chat session.
// No LLM call happens here on purpose: the model reads the cached raw JSON
// on demand later, exactly like RadarController::analyzeLinkedInUrl() already
// does for a live-pasted URL — this keeps the unattended cron cheap and fast.
//
// Reuses Beacon's Apify actor setting (beacon_apify_actor_posts /
// beacon_apify_actor_posts_input) deliberately — same actor, same purpose
// (a profile/company's recent posts), no reason to configure it twice.
// Posts-per-profile is its own setting (radar_tracked_pages_posts_per_profile),
// deliberately NOT shared with Beacon's — Beacon and Radar tune this for
// different purposes (engager-scraping breadth vs. content-idea grounding
// depth) and tuning one shouldn't silently move the other.
//
// Gated by Admin -> Talk to Agents -> Radar -> Tracked Pages: tracked URL
// list (radar_tracked_pages), enabled flag, cadence. Run this on a cron —
// the cadence check inside decides whether today is due.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\ApifyClient;
use App\Support\Database;
use App\Support\Settings;

// Safety cap on how many tracked pages one run walks, independent of
// radar_tracked_pages' length — protects against an accidentally huge list.
const MAX_TRACKED_PAGES_PER_RUN = 25;

if (Settings::get('radar_tracked_pages_enabled') !== '1') {
    echo "Radar tracked-page refresh is disabled.\n";
    exit;
}

if (trim((string) Settings::get('apify_api_key')) === '') {
    echo "Radar tracked-page refresh is enabled but no apify_api_key is configured.\n";
    exit;
}

$actorPosts = trim((string) Settings::get('beacon_apify_actor_posts'));
if ($actorPosts === '') {
    echo "Radar tracked-page refresh is enabled but the profile-posts Apify actor ID "
        . "is not configured (Admin -> Talk to Agents -> Beacon -> LinkedIn Engagement Scraper).\n";
    exit;
}

// Same default template as Beacon's posts actor (harvestapi/linkedin-profile-posts) —
// deliberately shared setting, see docblock above.
$postsInputTemplate = (string) (Settings::get('beacon_apify_actor_posts_input')
    ?: '{"targetUrls": ["{{PROFILE_URL}}"], "maxPosts": {{POSTS_LIMIT}}}');

$frequency = Settings::get('radar_tracked_pages_frequency') ?: 'daily';
$lastRun = Settings::get('radar_tracked_pages_last_run');
if ($lastRun) {
    $hoursSince = (time() - strtotime($lastRun)) / 3600;
    $minHours = $frequency === 'weekly' ? 168 : 24;
    if ($hoursSince < $minHours) {
        echo 'Not due yet — ' . $frequency . ' cadence, last run ' . round($hoursSince, 1) . " hour(s) ago.\n";
        exit;
    }
}

$pages = array_values(array_unique(array_filter(
    array_map('trim', preg_split('/\R/', (string) Settings::get('radar_tracked_pages')) ?: [])
)));
$pages = array_slice($pages, 0, MAX_TRACKED_PAGES_PER_RUN);
if (!$pages) {
    echo "Radar tracked-page refresh is enabled but no pages are tracked "
        . "(Admin -> Talk to Agents -> Radar -> Tracked Pages).\n";
    exit;
}

$postsLimit = max(1, min(10, (int) (Settings::get('radar_tracked_pages_posts_per_profile') ?: 5)));

$pdo = Database::get();
$upsert = $pdo->prepare(
    'INSERT INTO radar_tracked_page_findings (page_url, findings_json, fetched_at)
     VALUES (?, ?, datetime(\'now\'))
     ON CONFLICT(page_url) DO UPDATE SET findings_json = excluded.findings_json, fetched_at = excluded.fetched_at'
);

$refreshed = 0;
$failures = 0;
foreach ($pages as $pageUrl) {
    $input = ApifyClient::fillTemplate($postsInputTemplate, [
        'PROFILE_URL' => $pageUrl,
        'POSTS_LIMIT' => (string) $postsLimit,
    ]);
    if ($input === null) {
        error_log("Radar tracked-page refresh: invalid posts input template for {$pageUrl}, skipping.");
        $failures++;
        continue;
    }

    $error = null;
    $items = ApifyClient::runActor($actorPosts, $input, $error);
    if ($items === null || !$items) {
        error_log("Radar tracked-page refresh: Apify call failed for {$pageUrl}: " . ($error ?: 'no items returned'));
        $failures++;
        continue;
    }

    $upsert->execute([$pageUrl, json_encode(array_slice($items, 0, $postsLimit), JSON_UNESCAPED_UNICODE)]);
    $refreshed++;
}

$status = sprintf('%d page(s) refreshed, %d failure(s), out of %d tracked.', $refreshed, $failures, count($pages));
Settings::set('radar_tracked_pages_last_status', $status);
// Only stamp last_run if at least one page actually refreshed — an all-failure
// run (e.g. Apify itself down) should retry on the very next cron tick rather
// than wait out the full cadence window with nothing cached.
if ($refreshed > 0) {
    Settings::set('radar_tracked_pages_last_run', gmdate('Y-m-d H:i:s'));
}

echo $status . "\n";
