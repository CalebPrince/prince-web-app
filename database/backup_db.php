<?php

declare(strict_types=1);

// Snapshots the SQLite database to storage/backups/ and prunes old copies.
// Run on a daily cron. Uses VACUUM INTO (SQLite 3.27+) rather than copying
// the file, so the snapshot is a transactionally consistent, defragmented
// database even if a request is writing mid-backup — a plain copy() of a
// live SQLite file can capture torn pages and be unrestorable.
//
//   php database/backup_db.php [keep]
//
// `keep` is how many most-recent backups to retain (default 14). Restoring
// is just: stop traffic (maintenance mode), copy the snapshot over
// storage/db/portfolio.sqlite, done.

require_once dirname(__DIR__) . '/src/autoload.php';
require_once dirname(__DIR__) . '/config/config.php';

use App\Support\Database;

const DEFAULT_KEEP = 14;

$keep = max(1, (int) ($argv[1] ?? DEFAULT_KEEP));

$config = appConfig();
$dbPath = $config['db_path'];
if (!is_file($dbPath)) {
    fwrite(STDERR, "Database not found at $dbPath — nothing to back up.\n");
    exit(1);
}

$backupDir = dirname(__DIR__) . '/storage/backups';
if (!is_dir($backupDir) && !mkdir($backupDir, 0755, true)) {
    fwrite(STDERR, "Could not create backup directory $backupDir\n");
    exit(1);
}

// Timestamp to the second, plus a numeric suffix if two runs land in the
// same second (VACUUM INTO refuses to overwrite an existing file).
$stamp = date('Ymd-His');
$target = $backupDir . "/portfolio-$stamp.sqlite";
for ($i = 2; is_file($target); $i++) {
    $target = $backupDir . "/portfolio-$stamp-$i.sqlite";
}

try {
    $pdo = Database::get();
    $pdo->exec('VACUUM INTO ' . $pdo->quote($target));
} catch (Throwable $e) {
    fwrite(STDERR, 'Backup failed: ' . $e->getMessage() . "\n");
    exit(1);
}

$size = filesize($target);
echo 'Backup written: ' . basename($target) . ' (' . number_format($size / 1024, 1) . " KB)\n";

// Prune: keep the newest $keep snapshots, delete the rest.
$snapshots = glob($backupDir . '/portfolio-*.sqlite') ?: [];
usort($snapshots, fn (string $a, string $b) => filemtime($b) <=> filemtime($a));
foreach (array_slice($snapshots, $keep) as $old) {
    if (@unlink($old)) {
        echo 'Pruned old backup: ' . basename($old) . "\n";
    }
}

echo 'Backups on disk: ' . min(count($snapshots), $keep) . " (keeping $keep)\n";
