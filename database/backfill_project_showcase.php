<?php

declare(strict_types=1);

/**
 * Backfills the public showcase columns on `projects` for the Systems pages.
 *
 * Deliberately conservative: it only writes fields that can be derived from
 * what is already in the database — the showcase grouping, the year, a
 * tagline rephrased from the project's own summary, and the stack taken from
 * its tags.
 *
 * It does NOT invent client_name, role, timeline, result_headline or
 * metrics. Those are real commercial facts that only Caleb can supply, so
 * they are left NULL and filled in from the admin Projects page. The Systems
 * pages render without them.
 *
 * Safe to re-run: every write is guarded so a value edited by hand in the
 * admin panel is never overwritten. Pass --force to overwrite anyway.
 */

require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

$force = in_array('--force', $argv, true);

/** Showcase grouping per project — matches the three Systems filter chips. */
const SHOWCASE_CATEGORIES = [
    'fintech-ledger-dashboard' => 'Websites & Apps',
    'headless-wordpress-storefront' => 'Websites & Apps',
    'cross-platform-booking-app' => 'Websites & Apps',
    'video-watch' => 'Automations',
    'ledger-command' => 'AI Agents',
    'church-media-diagnostic-suite' => 'Websites & Apps',
    'church-shape-it' => 'Websites & Apps',
    'lca-accra-church-website' => 'Websites & Apps',
    'simply-my-care' => 'Websites & Apps',
    'benas-hub' => 'Websites & Apps',
    'opskeep' => 'Automations',
];

/** Short descriptor, rephrased from each project's own summary. */
const TAGLINES = [
    'fintech-ledger-dashboard' => 'Real-time accounting dashboard',
    'headless-wordpress-storefront' => 'Headless commerce frontend',
    'cross-platform-booking-app' => 'Cross-platform booking app',
    'video-watch' => 'Video monitoring & scraping',
    'ledger-command' => 'AI accounting command center',
    'church-media-diagnostic-suite' => 'Live audio diagnostics',
    'church-shape-it' => '10-band parametric EQ',
    'lca-accra-church-website' => 'Church management platform',
    'simply-my-care' => 'Care provider portal',
    'benas-hub' => 'Organic products storefront',
    'opskeep' => 'Open-source agent skills',
];

/** Tag name -> react-icons key. Unmapped tags still render, without a glyph. */
const STACK_ICONS = [
    'PHP' => 'SiPhp',
    'React' => 'SiReact',
    'WordPress' => 'SiWordpress',
    'Python' => 'SiPython',
    'FastAPI' => 'SiFastapi',
    'Node.js' => 'SiNodedotjs',
    'SQLite' => 'SiSqlite',
    'JavaScript' => 'SiJavascript',
    'HTML5' => 'SiHtml5',
    'MySQL' => 'SiMysql',
    'Bootstrap 5' => 'SiBootstrap',
    'jQuery' => 'SiJquery',
    'Flask' => 'SiFlask',
    'AI' => 'SiAnthropic',
    'MCP' => 'SiAnthropic',
];

$pdo = Database::get();
$projects = $pdo->query('SELECT id, slug, created_at FROM projects')->fetchAll();

$tagStmt = $pdo->prepare(
    'SELECT t.name FROM project_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.project_id = ?'
);

$updated = 0;
foreach ($projects as $project) {
    $slug = (string) $project['slug'];

    $tagStmt->execute([$project['id']]);
    $stack = [];
    foreach ($tagStmt->fetchAll() as $tag) {
        $name = (string) $tag['name'];
        $stack[] = ['name' => $name, 'icon' => STACK_ICONS[$name] ?? ''];
    }

    $values = [
        'showcase_category' => SHOWCASE_CATEGORIES[$slug] ?? null,
        'tagline' => TAGLINES[$slug] ?? null,
        'project_year' => substr((string) $project['created_at'], 0, 4) ?: null,
        'stack_json' => $stack ? json_encode($stack) : null,
    ];

    $sets = [];
    $params = [];
    foreach ($values as $column => $value) {
        if ($value === null) {
            continue;
        }
        // COALESCE keeps any value already entered by hand, unless --force.
        $sets[] = $force ? "{$column} = ?" : "{$column} = COALESCE({$column}, ?)";
        $params[] = $value;
    }
    if (!$sets) {
        continue;
    }

    $params[] = $project['id'];
    $pdo->prepare('UPDATE projects SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    $updated++;
}

echo "Backfilled showcase fields for {$updated} project(s).\n";
echo "Left for manual entry in the admin panel: client_name, role, timeline, result_headline, metrics, challenge, solution.\n";
