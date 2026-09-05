<?php

declare(strict_types=1);

/**
 * Replaces em dashes in the site's own published copy with ordinary
 * punctuation. The pages themselves no longer contain any, but blog posts,
 * project case studies and Site Content live in the database, so their text
 * can only be fixed here.
 *
 * Client words are left alone: testimonials, Google reviews, inquiries and
 * anything else someone else wrote are never touched.
 *
 *   php database/strip_em_dashes.php          # dry run, prints what would change
 *   php database/strip_em_dashes.php --apply  # writes the changes
 */

require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

$apply = in_array('--apply', $argv, true);

/** Columns of the site's own copy, table => [primary key, columns]. */
const TARGETS = [
    'blog_posts' => ['id', ['title', 'excerpt', 'body']],
    'projects' => ['id', [
        'title', 'summary', 'case_study_body', 'tagline', 'result_headline',
        'challenge', 'solution', 'outcome_metrics', 'role', 'timeline',
    ]],
];

/**
 * An em dash between spaces reads as a comma; one opening a line is a bullet
 * and becomes a hyphen. Anything else is left as it is rather than guessed at.
 */
function stripEmDashes(string $text): string
{
    $out = preg_replace('/^\x{2014}\x{20}/u', '- ', $text) ?? $text;
    $out = preg_replace('/\R\x{2014}\x{20}/u', "\n- ", $out) ?? $out;
    $out = preg_replace('/\x{20}*\x{2014}\x{20}*/u', ', ', $out) ?? $out;
    // ", ," and ",." are what a dash next to existing punctuation leaves behind.
    $out = preg_replace('/,\s*([,.;:!?])/u', '$1', $out) ?? $out;
    return $out;
}

$pdo = Database::get();
$changed = 0;

foreach (TARGETS as $table => [$key, $columns]) {
    $rows = $pdo->query('SELECT ' . $key . ', ' . implode(', ', $columns) . ' FROM ' . $table)->fetchAll();
    foreach ($rows as $row) {
        $updates = [];
        foreach ($columns as $column) {
            $value = (string) ($row[$column] ?? '');
            if ($value === '' || !str_contains($value, "\u{2014}")) continue;
            $updates[$column] = stripEmDashes($value);
        }
        if (!$updates) continue;
        $changed++;
        echo "{$table}#{$row[$key]}: " . implode(', ', array_keys($updates)) . "\n";
        if (!$apply) continue;
        $set = implode(', ', array_map(static fn(string $c): string => "{$c} = ?", array_keys($updates)));
        $pdo->prepare("UPDATE {$table} SET {$set} WHERE {$key} = ?")
            ->execute([...array_values($updates), $row[$key]]);
    }
}

// Site Content and the other editable copy. Keys holding credentials or JSON
// are skipped: nothing there is prose, and a stray comma would corrupt them.
$skip = static fn(string $name): bool => (bool) preg_match(
    '/(key|secret|token|password|webhook|_json|placements|url|_id)$/i',
    $name
);
foreach ($pdo->query('SELECT name, value FROM settings')->fetchAll() as $row) {
    $value = (string) ($row['value'] ?? '');
    if ($value === '' || !str_contains($value, "\u{2014}") || $skip((string) $row['name'])) continue;
    $changed++;
    echo "settings/{$row['name']}\n";
    if (!$apply) continue;
    $pdo->prepare('UPDATE settings SET value = ? WHERE name = ?')
        ->execute([stripEmDashes($value), $row['name']]);
}

echo $changed === 0
    ? "No em dashes found in the site's own copy.\n"
    : ($apply ? "Updated {$changed} record(s).\n" : "{$changed} record(s) would change. Re-run with --apply.\n");
