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

// Each new result costs one AI call (up to ~2 min worst case, if it falls all
// the way through the Gemini -> OpenRouter -> Groq chain), and they run
// serially — so without a cap, runtime and spend scale with however many
// keywords are configured. When the cap bites, last_run is deliberately left
// alone so the next cron picks the sweep straight back up rather than waiting
// out the cadence; beacon_scan_seen means it resumes where this run stopped.
const MAX_RESULTS_PER_RUN = 20;

// Every provider being rate-limited or out of credit is a normal Tuesday on
// free tiers, and when it happens every score fails. Without this, the run
// grinds through the whole cap anyway — each failure paying Gemini's 12s
// timeout, then OpenRouter, then Groq — to achieve nothing. A few in a row
// means the chain is down, not that these particular posts are unscoreable.
const MAX_CONSECUTIVE_SCORE_FAILURES = 3;

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

// Google's tbs time filter, passed straight through by Serper. Without it the
// first real sweep scored Reddit threads from 2015 and a LinkedIn post from
// 2021: for evergreen phrasing like "my website is slow", what ranks is the
// old high-karma thread, not this week's. Beacon judged them correctly and
// they were still worthless — nobody is hiring off a five-year-old post. Also
// cuts spend, since stale results cost a scoring call to reject.
// 'any' disables the filter.
$recency = (string) (Settings::get('beacon_discovery_recency') ?: 'qdr:m');
if ($recency === 'any') {
    $recency = '';
}

$pdo = Database::get();
$seenStmt = $pdo->prepare('SELECT 1 FROM beacon_scan_seen WHERE url = ?');
$markSeenStmt = $pdo->prepare(
    'INSERT OR IGNORE INTO beacon_scan_seen (url, qualified, confidence_score, reasoning) VALUES (?, ?, ?, ?)'
);

function detectPlatform(string $url): string
{
    $host = strtolower((string) (parse_url($url, PHP_URL_HOST) ?? ''));
    if (str_contains($host, 'reddit.com')) return 'Reddit';
    if (str_contains($host, 'x.com') || str_contains($host, 'twitter.com')) return 'X';
    if (str_contains($host, 'linkedin.com')) return 'LinkedIn';
    return 'Web';
}

/**
 * @param string|null $error Set to a short failure summary when this returns null.
 * @return array<int,array<string,mixed>>|null null on a failed search — distinct
 *         from [], which means the search worked and Google had nothing. The
 *         caller has to tell those apart: treating a failure as "no results"
 *         is what let a 403'd key report a clean, empty sweep.
 */
function searchWeb(string $apiKey, string $query, string $recency = '', ?string &$error = null): ?array
{
    $payload = ['q' => $query];
    if ($recency !== '') {
        $payload['tbs'] = $recency;
    }

    $ch = curl_init('https://google.serper.dev/search');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-KEY: ' . $apiKey],
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_TIMEOUT => 15,
    ]);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false || $status !== 200) {
        $error = sprintf(
            'status=%s curl_error=%s body=%s',
            $status,
            $curlError !== '' ? $curlError : 'none',
            is_string($response) ? substr($response, 0, 200) : 'n/a'
        );
        error_log('Beacon discovery: Serper search failed: ' . $error);
        return null;
    }

    $decoded = json_decode($response, true);
    return is_array($decoded['organic'] ?? null) ? $decoded['organic'] : [];
}

$scanned = 0;
$qualified = [];

$cappedOut = false;
$searchesRun = 0;
$searchesFailed = 0;
$firstSearchError = null;
$consecutiveScoreFailures = 0;
$scoreFailuresTotal = 0;   // consecutive resets on success; this doesn't — it's the spend figure
$scoringGaveUp = false;

foreach ($keywords as $keyword) {
    // Checked on $scanned, not on $cappedOut: an inner loop that happens to end
    // exactly on the cap leaves $cappedOut false, and searching the next keyword
    // would spend a Serper call on results this run can't reach anyway.
    if ($scanned >= MAX_RESULTS_PER_RUN) {
        $cappedOut = true;
        break;
    }

    $searchError = null;
    $results = searchWeb($apiKey, $keyword, $recency, $searchError);
    $searchesRun++;
    if ($results === null) {
        $searchesFailed++;
        $firstSearchError ??= $searchError;
        continue;
    }

    foreach ($results as $result) {
        if ($scanned >= MAX_RESULTS_PER_RUN) {
            $cappedOut = true;
            break;
        }

        $url = trim((string) ($result['link'] ?? ''));
        $snippet = trim((string) ($result['snippet'] ?? ''));
        if ($url === '' || $snippet === '') {
            continue;
        }

        $seenStmt->execute([$url]);
        if ($seenStmt->fetch()) {
            continue;
        }

        $title = trim((string) ($result['title'] ?? ''));
        $postContent = $title !== '' ? "{$title}\n\n{$snippet}" : $snippet;
        // Serper reports age as human text ("3 years ago"), and not on every
        // result — Google only dates some.
        $postAge = trim((string) ($result['date'] ?? '')) ?: null;

        $draft = BeaconController::generateForPost(detectPlatform($url), 'unknown', $postContent, $url, 'cron', $postAge);

        // A failed score is not a decision — don't mark it seen. Marking on null
        // cost real leads: an afternoon of testing exhausted every provider's
        // free tier, and 14 posts (including small-business owners asking why
        // their site was slow) were written off as "evaluated" when all that
        // happened was a 429. Leaving them unmarked means the next run retries
        // them; the cap and the circuit breaker below bound what that can cost.
        if ($draft === null) {
            $consecutiveScoreFailures++;
            $scoreFailuresTotal++;
            if ($consecutiveScoreFailures >= MAX_CONSECUTIVE_SCORE_FAILURES) {
                $scoringGaveUp = true;
                break 2;
            }
            continue;
        }
        $consecutiveScoreFailures = 0;

        // Mark seen only once scoring has actually returned. Marking before the
        // call meant a killed run (Ctrl+C, cron timeout, OOM) permanently
        // skipped every URL it had reached but not yet scored — silently, since
        // a seen URL is never reconsidered.
        //
        // Record the decision too, not just the URL: rejections never reach
        // beacon_social_leads, so this is the only trace of why Beacon passed
        // on something.
        $markSeenStmt->execute([
            $url,
            (int) $draft['qualified'],
            (int) $draft['confidence_score'],
            $draft['reasoning'],
        ]);
        $scanned++;

        if ($draft['qualified']) {
            $qualified[] = ['url' => $url] + $draft;
        }
    }
}

// Log every run that got as far as searching, failures included — a run that
// burned 6 Serper credits and 3 AI calls before the provider chain gave way
// still cost money, and that's exactly the run you'd want to see when the bill
// looks wrong.
$recordRun = function (string $outcome) use ($pdo, &$searchesRun, &$searchesFailed, &$scanned, &$qualified, &$scoreFailuresTotal): void {
    $pdo->prepare(
        'INSERT INTO beacon_runs (searches_run, searches_failed, results_scanned, qualified, score_failures, outcome)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$searchesRun, $searchesFailed, $scanned, count($qualified), $scoreFailuresTotal, $outcome]);
};

// A sweep where every search failed is not an empty sweep, and must not read
// like one. Previously a rejected API key logged to error_log (a file, not
// stdout) and then reported "0 new result(s) scanned, 0 qualified.", stamped
// last_run and exited 0 — so cron stayed silent and Beacon looked like it was
// running fine and finding nobody. Leave the cadence alone and exit non-zero
// so the next run retries and cron actually mails about it.
if ($searchesRun > 0 && $searchesFailed === $searchesRun) {
    $recordRun('search_failed');
    fwrite(STDERR, "Beacon discovery: all {$searchesRun} Serper search(es) failed — {$firstSearchError}\n");
    fwrite(STDERR, "Check serper_api_key in Admin -> Settings (a 403 means the key is rejected — note serper.dev and serpapi.com are different services with incompatible keys) and the account's remaining credits.\n");
    fwrite(STDERR, "Leaving beacon_discovery_last_run unchanged so the next run retries instead of waiting out the cadence.\n");
    exit(1);
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

echo "$scanned new result(s) scanned, " . count($qualified) . " qualified.\n";

// Partial failure still sweeps and still stamps — but say so, rather than
// letting a quietly broken keyword look like one that found nothing.
if ($searchesFailed > 0) {
    fwrite(STDERR, "Warning: {$searchesFailed} of {$searchesRun} Serper search(es) failed — {$firstSearchError}\n");
}

// Same principle as the all-searches-failed case above: a run that couldn't
// score isn't a run that found nothing, and must not stamp the cadence or
// exit 0. The digest above still went out for anything scored before the
// chain gave way.
if ($scoringGaveUp) {
    $recordRun('scoring_gave_up');
    fwrite(STDERR, 'Beacon discovery: gave up after ' . MAX_CONSECUTIVE_SCORE_FAILURES . " consecutive scoring failures — the AI provider chain is down or out of quota.\n");
    fwrite(STDERR, "The per-provider reason is in the PHP error log (Gemini/OpenRouter/Groq each log their own status). Typically: Gemini 503 high demand, OpenRouter 402 out of credits, Groq 429 daily token limit.\n");
    fwrite(STDERR, "Unscored URLs were left unmarked and beacon_discovery_last_run unchanged, so the next run retries them once quota returns.\n");
    exit(1);
}

$recordRun($cappedOut ? 'capped' : 'ok');

// Only stamp last_run on a sweep that got through everything — see the
// MAX_RESULTS_PER_RUN note above.
if (!$cappedOut) {
    Settings::set('beacon_discovery_last_run', gmdate('Y-m-d H:i:s'));
}
if ($cappedOut) {
    echo 'Stopped at the ' . MAX_RESULTS_PER_RUN . "-result cap — more left to scan, so the next run continues instead of waiting for the cadence.\n";
}
