<?php

declare(strict_types=1);

// Beacon's second lead source: instead of searching the web for posts that
// *express* buying intent (run_beacon_discovery.php), this scrapes who
// engaged (reacted or commented) with the newest posts from a curated list
// of LinkedIn creators/companies whose audience skews toward Caleb's target
// customers — a hand-raise signal, not a keyword guess. Two chained Apify
// actor calls per tracked profile: one to pull its newest posts, one to pull
// each new post's reactions/comments. Every engager gets scored by
// BeaconController::generateForEngagement() (ICP fit on their own profile,
// not the post) and, if qualified, lands in the same beacon_social_leads
// pipeline, confidence gate, and admin review queue as any other Beacon lead.
//
// FIELD MAPPING IS BEST-EFFORT. Different Apify actors from different
// authors use different field names for the same data, and this script has
// no way to know in advance which actor(s) Caleb ends up using. The
// extraction helpers below (findLinkedInPostUrls, extractEngagers) search a
// list of plausible field-name candidates rather than one fixed schema. If a
// run logs "0 engagers extracted from N raw item(s)" on stderr, the actor's
// real output doesn't match any of the candidate names — inspect one raw
// item (temporarily var_export it) and add the real key to the relevant
// $hints array below.
//
// Gated by Admin -> Joan/Beacon (Site Content -> Agent chat): tracked
// profile list (beacon_apify_profiles), enabled flag, cadence, and the two
// actor IDs + input templates. Run this on a cron — the cadence check inside
// decides whether today is due.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\BeaconController;
use App\Support\ApifyClient;
use App\Support\Database;
use App\Support\Mailer;
use App\Support\Settings;
use App\Support\SlackNotifier;

// Hard ceiling on new qualification calls in one run, independent of how
// many profiles/posts are configured — each one costs an AI call, and this
// runs unattended. Configurable so Caleb can raise it once he trusts the cost.
$maxNewEngagers = max(1, min(100, (int) (Settings::get('beacon_apify_max_engagers_per_run') ?: 20)));

// Same circuit breaker as run_beacon_discovery.php: a string of scoring
// failures means the AI provider chain is down, not that these particular
// profiles are unscoreable.
const MAX_CONSECUTIVE_SCORE_FAILURES = 3;
// Safety cap on how many tracked profiles one run walks, independent of
// beacon_apify_profiles' length — protects against an accidentally huge list.
const MAX_PROFILES_PER_RUN = 25;

if (Settings::get('beacon_apify_enabled') !== '1') {
    echo "Beacon LinkedIn engagement discovery is disabled.\n";
    exit;
}

if (trim((string) Settings::get('apify_api_key')) === '') {
    echo "Beacon LinkedIn engagement discovery is enabled but no apify_api_key is configured.\n";
    exit;
}

$actorPosts = trim((string) Settings::get('beacon_apify_actor_posts'));
$actorEngagers = trim((string) Settings::get('beacon_apify_actor_engagers'));
if ($actorPosts === '' || $actorEngagers === '') {
    echo "Beacon LinkedIn engagement discovery is enabled but the profile-posts and/or "
        . "post-engagers Apify actor IDs are not configured.\n";
    exit;
}

// Defaults match harvestapi/linkedin-profile-posts and apimaestro's combined
// comments+reactions actor (both verified against their real Apify Store
// input schemas 2026-08-07 — see beacon-nurturer-agents.md memory) — a real
// working starting point, not a guess, though still worth re-checking if
// either actor's own schema changes.
$postsInputTemplate = (string) (Settings::get('beacon_apify_actor_posts_input')
    ?: '{"targetUrls": ["{{PROFILE_URL}}"], "maxPosts": {{POSTS_LIMIT}}}');
$engagersInputTemplate = (string) (Settings::get('beacon_apify_actor_engagers_input')
    ?: '{"postIds": ["{{POST_URL}}"], "limit": {{ENGAGERS_LIMIT}}}');

$frequency = Settings::get('beacon_apify_frequency') ?: 'daily';
$lastRun = Settings::get('beacon_apify_last_run');
if ($lastRun) {
    $hoursSince = (time() - strtotime($lastRun)) / 3600;
    $minHours = $frequency === 'weekly' ? 168 : ($frequency === 'hourly' ? 1 : 24);
    if ($hoursSince < $minHours) {
        echo 'Not due yet — ' . $frequency . ' cadence, last run ' . round($hoursSince, 1) . " hour(s) ago.\n";
        exit;
    }
}

$profiles = array_values(array_unique(array_filter(
    array_map('trim', preg_split('/\R/', (string) Settings::get('beacon_apify_profiles')) ?: [])
)));
$profiles = array_slice($profiles, 0, MAX_PROFILES_PER_RUN);
if (!$profiles) {
    echo "Beacon LinkedIn engagement discovery is enabled but no profiles are tracked "
        . "(Admin -> Joan/Beacon -> LinkedIn Engagement Scraper).\n";
    exit;
}

$postsLimit = max(1, min(10, (int) (Settings::get('beacon_apify_posts_per_profile') ?: 2)));
$engagersLimit = max(1, min(200, (int) (Settings::get('beacon_apify_engagers_per_post') ?: 50)));

/**
 * Best-effort human label for a source post's author, derived from their
 * profile URL slug (e.g. "in/jane-doe-9f3a2b1" -> "Jane Doe"). Only used to
 * give the qualification prompt and the digest something readable — never
 * stored as ground truth about the person.
 */
function labelFromProfileUrl(string $profileUrl): string
{
    $path = trim((string) parse_url($profileUrl, PHP_URL_PATH), '/');
    $segments = explode('/', $path);
    $slug = end($segments) ?: '';
    if ($slug === '') {
        return $profileUrl;
    }
    // LinkedIn slugs often end in a random ID suffix once a profile has been
    // renamed/claimed (e.g. "-9f3a2b1c") — strip it if it looks like one.
    $slug = preg_replace('/-[a-z0-9]{6,}$/i', '', $slug) ?? $slug;
    $words = array_filter(explode('-', $slug));
    return $words ? ucwords(implode(' ', $words)) : $profileUrl;
}

/**
 * Recursively searches $node (Apify dataset item) for the first string value
 * matching $pattern, bounded to $maxDepth levels — how post/profile URLs get
 * found regardless of which key an unknown actor's schema put them under.
 */
function deepFindUrlByPattern(mixed $node, string $pattern, int $maxDepth = 3): ?string
{
    if (is_string($node)) {
        return preg_match($pattern, $node) === 1 ? $node : null;
    }
    if (is_array($node) && $maxDepth > 0) {
        foreach ($node as $value) {
            $found = deepFindUrlByPattern($value, $pattern, $maxDepth - 1);
            if ($found !== null) {
                return $found;
            }
        }
    }
    return null;
}

/**
 * Recursively searches $node for the first string value whose KEY contains
 * one of $hints (case-insensitive substring match), optionally also
 * requiring the value itself to match $valuePattern. Same rationale as
 * deepFindUrlByPattern: an unknown actor's schema, matched by plausible
 * field-name guesses rather than one fixed shape.
 *
 * @param string[] $hints
 */
function deepFindStringByKeyHints(mixed $node, array $hints, ?string $valuePattern = null, int $maxDepth = 3): ?string
{
    if (!is_array($node)) {
        return null;
    }
    foreach ($node as $key => $value) {
        if (is_string($key) && is_string($value) && trim($value) !== '') {
            $keyLower = strtolower($key);
            foreach ($hints as $hint) {
                if (str_contains($keyLower, $hint) && ($valuePattern === null || preg_match($valuePattern, $value) === 1)) {
                    return $value;
                }
            }
        }
    }
    if ($maxDepth > 0) {
        foreach ($node as $value) {
            if (is_array($value)) {
                $found = deepFindStringByKeyHints($value, $hints, $valuePattern, $maxDepth - 1);
                if ($found !== null) {
                    return $found;
                }
            }
        }
    }
    return null;
}

/**
 * @param array<int,mixed> $items Raw dataset items from the profile-posts actor.
 * @return array<int,array{url:string,topic:string}>
 */
function findLinkedInPostUrls(array $items): array
{
    $posts = [];
    $seen = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $url = deepFindUrlByPattern($item, '#linkedin\.com/(posts|feed/update|pulse)/#i')
            ?? deepFindStringByKeyHints($item, ['posturl', 'post_url', 'url', 'link', 'permalink'], '#linkedin\.com#i');
        if ($url === null || isset($seen[$url])) {
            continue;
        }
        $seen[$url] = true;
        $topic = deepFindStringByKeyHints($item, ['text', 'commentary', 'description', 'content', 'posttext', 'body'])
            ?? '(no post text available)';
        $posts[] = ['url' => $url, 'topic' => mb_substr(trim($topic), 0, 600)];
    }
    return $posts;
}

/**
 * @param array<int,mixed> $items Raw dataset items from the post-engagers actor.
 * @return array<int,array{name:string,headline:?string,profileUrl:?string,commentText:?string,engagementType:string}>
 */
function extractEngagers(array $items): array
{
    $engagers = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $name = deepFindStringByKeyHints($item, ['name', 'fullname', 'full_name', 'reactorname', 'commentername', 'authorname', 'actorname']);
        if ($name === null || trim($name) === '') {
            continue; // nothing to judge without at least a name
        }
        $headline = deepFindStringByKeyHints($item, ['headline', 'occupation', 'jobtitle', 'position', 'subtitle', 'title']);
        $profileUrl = deepFindUrlByPattern($item, '#linkedin\.com/in/#i')
            ?? deepFindStringByKeyHints($item, ['profileurl', 'linkedinurl', 'authorprofileurl', 'url', 'link'], '#linkedin\.com#i');
        $commentText = deepFindStringByKeyHints($item, ['commenttext', 'comment', 'text', 'message', 'body']);
        $engagementType = ($commentText !== null && trim($commentText) !== '') ? 'comment' : 'reaction';
        $engagers[] = [
            'name' => trim($name),
            'headline' => $headline !== null ? trim($headline) : null,
            'profileUrl' => $profileUrl,
            'commentText' => $commentText !== null ? trim($commentText) : null,
            'engagementType' => $engagementType,
        ];
    }
    return $engagers;
}

$pdo = Database::get();
$scrapedStmt = $pdo->prepare('SELECT 1 FROM beacon_scraped_posts WHERE post_url = ?');
$markScrapedStmt = $pdo->prepare('INSERT OR IGNORE INTO beacon_scraped_posts (post_url) VALUES (?)');
$seenEngagerStmt = $pdo->prepare('SELECT 1 FROM beacon_engagement_seen WHERE post_url = ? AND engager_key = ?');
$markEngagerSeenStmt = $pdo->prepare('INSERT OR IGNORE INTO beacon_engagement_seen (post_url, engager_key) VALUES (?, ?)');

$profilesScanned = 0;
$postsFound = 0;
$engagersScanned = 0;
$newEngagersProcessed = 0;
$qualified = [];

$apifyCallsAttempted = 0;
$apifyCallsFailed = 0;
$firstApifyError = null;
$consecutiveScoreFailures = 0;
$scoreFailuresTotal = 0;
$scoringGaveUp = false;
$capped = false;

foreach ($profiles as $profileUrl) {
    if ($newEngagersProcessed >= $maxNewEngagers) {
        $capped = true;
        break;
    }
    $profilesScanned++;

    $postsInput = ApifyClient::fillTemplate($postsInputTemplate, [
        'PROFILE_URL' => $profileUrl,
        'POSTS_LIMIT' => (string) $postsLimit,
    ]);
    if ($postsInput === null) {
        fwrite(STDERR, "Beacon Apify discovery: beacon_apify_actor_posts_input is not valid JSON after substitution — skipping {$profileUrl}.\n");
        continue;
    }

    $error = null;
    $apifyCallsAttempted++;
    $postItems = ApifyClient::runActor($actorPosts, $postsInput, $error);
    if ($postItems === null) {
        $apifyCallsFailed++;
        $firstApifyError ??= $error;
        continue;
    }

    $posts = array_slice(findLinkedInPostUrls($postItems), 0, $postsLimit);
    if (!$posts && $postItems) {
        fwrite(STDERR, "Beacon Apify discovery: 0 post URLs extracted from " . count($postItems)
            . " raw item(s) for {$profileUrl} — the posts actor's output field names may not match "
            . "the candidates in findLinkedInPostUrls(). See the field-mapping note at the top of this file.\n");
    }

    foreach ($posts as $post) {
        $postUrl = $post['url'];
        $postsFound++;

        $scrapedStmt->execute([$postUrl]);
        if ($scrapedStmt->fetch()) {
            continue; // already scraped on a previous run
        }
        if ($newEngagersProcessed >= $maxNewEngagers) {
            $capped = true;
            break 2;
        }

        $engagersInput = ApifyClient::fillTemplate($engagersInputTemplate, [
            'POST_URL' => $postUrl,
            'ENGAGERS_LIMIT' => (string) $engagersLimit,
        ]);
        if ($engagersInput === null) {
            fwrite(STDERR, "Beacon Apify discovery: beacon_apify_actor_engagers_input is not valid JSON after substitution — skipping {$postUrl}.\n");
            continue;
        }

        $error = null;
        $apifyCallsAttempted++;
        $engagerItems = ApifyClient::runActor($actorEngagers, $engagersInput, $error);
        if ($engagerItems === null) {
            $apifyCallsFailed++;
            $firstApifyError ??= $error;
            continue; // not marked scraped — retried next run
        }

        // Only mark a post scraped once its engagers were actually fetched —
        // a config/template bug or a transient Apify failure should retry,
        // not get silently written off as "done."
        $markScrapedStmt->execute([$postUrl]);

        $engagers = array_slice(extractEngagers($engagerItems), 0, $engagersLimit);
        if (!$engagers && $engagerItems) {
            fwrite(STDERR, "Beacon Apify discovery: 0 engagers extracted from " . count($engagerItems)
                . " raw item(s) for {$postUrl} — the engagers actor's output field names may not match "
                . "the candidates in extractEngagers(). See the field-mapping note at the top of this file.\n");
        }

        $sourcePostAuthor = labelFromProfileUrl($profileUrl);

        foreach ($engagers as $engager) {
            if ($newEngagersProcessed >= $maxNewEngagers) {
                $capped = true;
                break 3;
            }

            $engagerKey = $engager['profileUrl'] ?: sha1(mb_strtolower($engager['name'] . '|' . ($engager['headline'] ?? '')));
            $seenEngagerStmt->execute([$postUrl, $engagerKey]);
            if ($seenEngagerStmt->fetch()) {
                continue;
            }

            $engagersScanned++;
            $draft = BeaconController::generateForEngagement(
                $engager['name'],
                $engager['headline'],
                $engager['profileUrl'],
                $engager['engagementType'],
                $engager['commentText'],
                $postUrl,
                $sourcePostAuthor,
                $post['topic']
            );

            if ($draft === null) {
                $consecutiveScoreFailures++;
                $scoreFailuresTotal++;
                if ($consecutiveScoreFailures >= MAX_CONSECUTIVE_SCORE_FAILURES) {
                    $scoringGaveUp = true;
                    break 3;
                }
                continue; // not marked seen — retried next run
            }
            $consecutiveScoreFailures = 0;
            $markEngagerSeenStmt->execute([$postUrl, $engagerKey]);
            $newEngagersProcessed++;

            if ($draft['qualified']) {
                $qualified[] = ['post_url' => $postUrl, 'engager_name' => $engager['name']] + $draft;
            }
        }
    }
}

$recordRun = function (string $outcome) use (
    $pdo, &$profilesScanned, &$postsFound, &$engagersScanned, &$qualified, &$apifyCallsFailed, &$scoreFailuresTotal
): void {
    $pdo->prepare(
        'INSERT INTO beacon_apify_runs (profiles_scanned, posts_found, engagers_scanned, qualified, api_call_failures, score_failures, outcome)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([$profilesScanned, $postsFound, $engagersScanned, count($qualified), $apifyCallsFailed, $scoreFailuresTotal, $outcome]);
};

if ($apifyCallsAttempted > 0 && $apifyCallsFailed === $apifyCallsAttempted) {
    Settings::set('beacon_apify_last_status', 'All Apify calls failed: ' . $firstApifyError);
    $recordRun('apify_failed');
    fwrite(STDERR, "Beacon Apify discovery: all {$apifyCallsAttempted} Apify call(s) failed — {$firstApifyError}\n");
    fwrite(STDERR, "Check apify_api_key and the two actor IDs in Admin -> Joan/Beacon -> LinkedIn Engagement Scraper.\n");
    exit(1);
}

if ($qualified) {
    $lines = array_map(
        fn($q) => "*{$q['confidence_score']}%* — {$q['engager_name']} (engaged on <{$q['post_url']}|this post>)\n>{$q['reasoning']}\n\nSuggested note:\n>" . str_replace("\n", "\n>", $q['drafted_reply']),
        $qualified
    );
    $digestText = 'Beacon found ' . count($qualified) . " qualified LinkedIn engagement lead(s):\n\n" . implode("\n\n", $lines);
    SlackNotifier::send($digestText);

    $notifyEmail = Settings::get('notification_email');
    if (!empty($notifyEmail)) {
        $htmlLines = array_map(
            fn($q) => '<p><strong>' . htmlspecialchars((string) $q['confidence_score']) . '%</strong> — '
                . htmlspecialchars($q['engager_name']) . ' (engaged on <a href="' . htmlspecialchars($q['post_url']) . '">this post</a>)<br>'
                . nl2br(htmlspecialchars($q['reasoning'])) . '<br><br>'
                . '<em>Suggested note:</em><br>' . nl2br(htmlspecialchars($q['drafted_reply'])) . '</p>',
            $qualified
        );
        Mailer::sendHtml(
            $notifyEmail,
            'Beacon found ' . count($qualified) . ' qualified LinkedIn engagement lead(s)',
            implode('<hr>', $htmlLines),
            $digestText
        );
    }
}

$statusText = "Scanned {$profilesScanned} profile(s), found {$postsFound} post(s), evaluated {$engagersScanned} engager(s), "
    . count($qualified) . ' qualified.';
echo $statusText . "\n";

if ($apifyCallsFailed > 0) {
    fwrite(STDERR, "Warning: {$apifyCallsFailed} of {$apifyCallsAttempted} Apify call(s) failed — {$firstApifyError}\n");
}

if ($scoringGaveUp) {
    Settings::set('beacon_apify_last_status', $statusText . ' Gave up after repeated scoring failures.');
    $recordRun('scoring_gave_up');
    fwrite(STDERR, 'Beacon Apify discovery: gave up after ' . MAX_CONSECUTIVE_SCORE_FAILURES . " consecutive scoring failures — the AI provider chain is down or out of quota.\n");
    exit(1);
}

Settings::set('beacon_apify_last_status', $statusText);
$recordRun($capped ? 'capped' : 'ok');

// Only stamp last_run on a sweep that got through everything — same
// reasoning as run_beacon_discovery.php: a capped run should resume on the
// very next cron tick rather than waiting out the full cadence.
if (!$capped) {
    Settings::set('beacon_apify_last_run', gmdate('Y-m-d H:i:s'));
} else {
    echo "Stopped at the {$maxNewEngagers}-new-engager cap — more left to scan, so the next run continues instead of waiting for the cadence.\n";
}
