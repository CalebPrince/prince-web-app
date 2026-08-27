<?php

declare(strict_types=1);

// One-time (not a cron): the Sites system (see check_uptime.php, SiteController)
// links a monitor to its portfolio project via uptime_monitors.project_id — but
// that column didn't exist before this feature, so any monitor created through
// the old /admin/uptime page has project_id still NULL. Those monitors keep
// pinging fine (check_uptime.php doesn't care about the link), they just don't
// show up as "monitored" on the new /admin/sites page. This matches each
// unlinked monitor to its project by normalized URL (scheme/www/trailing-slash
// stripped, since e.g. lcamedia.duckdns.org hosts two different projects at two
// different paths — matching on host alone would collide) and links it.
// Safe to re-run: only ever touches monitors that are still unlinked.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

function normalizeUrl(?string $url): ?string
{
    if ($url === null || trim($url) === '') {
        return null;
    }
    $url = strtolower(trim($url));
    $url = preg_replace('#^https?://#', '', $url) ?? $url;
    $url = preg_replace('#^www\.#', '', $url) ?? $url;
    return rtrim($url, '/');
}

$pdo = Database::get();

$monitors = $pdo->query('SELECT id, name, url FROM uptime_monitors WHERE project_id IS NULL')->fetchAll();
$projects = $pdo->query("SELECT id, title, live_url FROM projects WHERE live_url IS NOT NULL AND live_url != ''")->fetchAll();

$projectsByUrl = [];
foreach ($projects as $project) {
    $key = normalizeUrl($project['live_url']);
    if ($key === null) {
        continue;
    }
    // An ambiguous normalized URL (two projects resolving to the same key)
    // can't be safely auto-linked — mark it so a match against it is skipped.
    $projectsByUrl[$key] = array_key_exists($key, $projectsByUrl) ? false : $project;
}

$linked = 0;
$skipped = [];
$update = $pdo->prepare('UPDATE uptime_monitors SET project_id = ? WHERE id = ?');

foreach ($monitors as $monitor) {
    $key = normalizeUrl($monitor['url']);
    $match = $key !== null ? ($projectsByUrl[$key] ?? null) : null;

    if ($match === false) {
        $skipped[] = "{$monitor['name']} ({$monitor['url']}) — ambiguous, multiple projects share that URL";
        continue;
    }
    if ($match === null) {
        $skipped[] = "{$monitor['name']} ({$monitor['url']}) — no project with a matching live_url";
        continue;
    }

    $update->execute([$match['id'], $monitor['id']]);
    echo "Linked \"{$monitor['name']}\" -> project #{$match['id']} \"{$match['title']}\"\n";
    $linked++;
}

echo "\n{$linked} monitor(s) linked.\n";
if ($skipped) {
    echo count($skipped) . " monitor(s) skipped — no admin UI to link these yet, set it directly if needed:\n"
        . "  UPDATE uptime_monitors SET project_id = <id> WHERE id = <monitor id>;\n";
    foreach ($skipped as $line) {
        echo "  - {$line}\n";
    }
}
