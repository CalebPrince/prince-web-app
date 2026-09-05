<?php

declare(strict_types=1);

/**
 * Unpublishes the three illustrative projects database/seed.php creates.
 *
 * They carry no screenshot and are not verified client work, but they were
 * seeded published, so they appeared in the homepage gallery under "See what
 * has already shipped" as empty browser frames. seed.php now inserts them
 * unpublished; this fixes the databases where they already exist.
 *
 * Only these three slugs, and only ever is_published: nothing else about the
 * rows is touched, and a project that has since been given a real screenshot
 * and republished by hand is left alone.
 *
 *   php database/unpublish_sample_projects.php          # dry run
 *   php database/unpublish_sample_projects.php --apply
 */

require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

const SAMPLE_SLUGS = [
    'fintech-ledger-dashboard',
    'headless-wordpress-storefront',
    'cross-platform-booking-app',
];

$apply = in_array('--apply', $argv, true);
$pdo = Database::get();

$placeholders = implode(', ', array_fill(0, count(SAMPLE_SLUGS), '?'));
$stmt = $pdo->prepare(
    "SELECT id, slug, title, cover_image_path FROM projects
     WHERE slug IN ({$placeholders}) AND is_published = 1"
);
$stmt->execute(SAMPLE_SLUGS);
$rows = $stmt->fetchAll();

if (!$rows) {
    echo "Nothing to do: none of the sample projects are published.\n";
    exit;
}

foreach ($rows as $row) {
    $cover = trim((string) ($row['cover_image_path'] ?? ''));
    $hasShot = $cover !== '' && !str_contains($cover, '/placeholder-');
    echo "{$row['slug']}: {$row['title']}"
        . ($hasShot ? " (has a cover image: {$cover})" : ' (no screenshot)')
        . "\n";

    if (!$apply) {
        continue;
    }
    $pdo->prepare("UPDATE projects SET is_published = 0, updated_at = datetime('now') WHERE id = ?")
        ->execute([(int) $row['id']]);
}

echo $apply
    ? 'Unpublished ' . count($rows) . " project(s). Publish any of them again from Admin -> Projects.\n"
    : count($rows) . " project(s) would be unpublished. Re-run with --apply.\n";
