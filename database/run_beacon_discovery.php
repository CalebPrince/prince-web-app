<?php

declare(strict_types=1);

// Searches for candidate social posts (via Serper's general web-search
// endpoint, admin-configured keywords) and runs new ones through Beacon.
// Gated by Admin -> Site Content (Beacon tab): beacon_discovery_enabled
// must be "1", on the configured cadence since beacon_discovery_last_run,
// same shape as generate_social_drafts.php's social_draft_* gating. Run
// this on a cron — the cadence check inside decides whether today is due.
//
// Beacon can't post back to Reddit/X/LinkedIn itself (each platform needs
// its own developer API + OAuth app, deliberately not built here — see
// BeaconController's docblock) and Serper only returns a short snippet per
// result, not the full post text, so its assessment has less context than
// a real scrape would give it. This is a real accuracy tradeoff of "no
// platform API," not a bug — qualified results are a digest for Caleb to
// act on himself, not an auto-reply.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\BeaconController;
use App\Support\Database;
use App\Support\Mailer;
use App\Support\Settings;
use App\Support\SlackNotifier;

if (Settings::get('beacon_discovery_enabled') !== '1') {
    echo "Beacon discovery is disabled.\n";
    exit;
}

$apiKey = Settings::get('serper_api_key');
if (empty($apiKey)) {
    echo "Beacon discovery is enabled but no serper_api_key is configured.\n";
    exit;
}

$frequency = Settings::get('beacon_discovery_frequency') ?: 'daily';
$lastRun = Settings::get('beacon_discovery_last_run');
if ($lastRun) {
    $hoursSince = (time() - strtotime($lastRun)) / 3600;
    $minHours = $frequency === 'weekly' ? 168 : ($frequency === 'hourly' ? 1 : 24);
    if ($hoursSince < $minHours) {
        echo 'Not due yet — ' . $frequency . ' cadence, last run ' . round($hoursSince, 1) . " hour(s) ago.\n";
        exit;
    }
}

$keywords = array_filter(array_map('trim', explode("\n", (string) Settings::get('beacon_discovery_keywords'))));
if (!$keywords) {
    echo "Beacon discovery is enabled but no keywords are configured.\n";
    exit;
}

$pdo = Database::get();
$seenStmt = $pdo->prepare('SELECT 1 FROM beacon_scan_seen WHERE url = ?');
$markSeenStmt = $pdo->prepare('INSERT OR IGNORE INTO beacon_scan_seen (url) VALUES (?)');

function detectPlatform(string $url): string
{
    $host = strtolower((string) (parse_url($url, PHP_URL_HOST) ?? ''));
    if (str_contains($host, 'reddit.com')) return 'Reddit';
    if (str_contains($host, 'x.com') || str_contains($host, 'twitter.com')) return 'X';
    if (str_contains($host, 'linkedin.com')) return 'LinkedIn';
    return 'Web';
}

function searchWeb(string $apiKey, string $query): array
{
    $ch = curl_init('https://google.serper.dev/search');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-KEY: ' . $apiKey],
        CURLOPT_POSTFIELDS => json_encode(['q' => $query]),
        CURLOPT_TIMEOUT => 15,
    ]);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false || $status !== 200) {
        error_log(sprintf(
            'Beacon discovery: Serper search failed: status=%s curl_error=%s body=%s',
            $status,
            $curlError !== '' ? $curlError : 'none',
            is_string($response) ? substr($response, 0, 500) : 'n/a'
        ));
        return [];
    }

    $decoded = json_decode($response, true);
    return is_array($decoded['organic'] ?? null) ? $decoded['organic'] : [];
}

$scanned = 0;
$qualified = [];

foreach ($keywords as $keyword) {
    foreach (searchWeb($apiKey, $keyword) as $result) {
        $url = trim((string) ($result['link'] ?? ''));
        $snippet = trim((string) ($result['snippet'] ?? ''));
        if ($url === '' || $snippet === '') {
            continue;
        }

        $seenStmt->execute([$url]);
        if ($seenStmt->fetch()) {
            continue;
        }
        $markSeenStmt->execute([$url]);
        $scanned++;

        $title = trim((string) ($result['title'] ?? ''));
        $postContent = $title !== '' ? "{$title}\n\n{$snippet}" : $snippet;

        $draft = BeaconController::generateForPost(detectPlatform($url), 'unknown', $postContent, $url, 'cron');
        if ($draft !== null && $draft['qualified']) {
            $qualified[] = ['url' => $url] + $draft;
        }
    }
}

if ($qualified) {
    $lines = array_map(
        fn($q) => "*{$q['confidence_score']}%* — <{$q['url']}|view post>\n>{$q['reasoning']}\n\nDraft reply:\n>" . str_replace("\n", "\n>", $q['drafted_reply']),
        $qualified
    );
    $digestText = 'Beacon found ' . count($qualified) . " qualified lead(s):\n\n" . implode("\n\n", $lines);
    SlackNotifier::send($digestText);

    $notifyEmail = Settings::get('notification_email');
    if (!empty($notifyEmail)) {
        $htmlLines = array_map(
            fn($q) => '<p><strong>' . htmlspecialchars((string) $q['confidence_score']) . '%</strong> — '
                . '<a href="' . htmlspecialchars($q['url']) . '">view post</a><br>'
                . nl2br(htmlspecialchars($q['reasoning'])) . '<br><br>'
                . '<em>Draft reply:</em><br>' . nl2br(htmlspecialchars($q['drafted_reply'])) . '</p>',
            $qualified
        );
        Mailer::sendHtml(
            $notifyEmail,
            'Beacon found ' . count($qualified) . ' qualified lead(s)',
            implode('<hr>', $htmlLines),
            $digestText
        );
    }
}

Settings::set('beacon_discovery_last_run', gmdate('Y-m-d H:i:s'));
echo "$scanned new result(s) scanned, " . count($qualified) . " qualified.\n";
