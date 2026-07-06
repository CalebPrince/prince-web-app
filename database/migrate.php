<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

$pdo = Database::get();
$schema = file_get_contents(__DIR__ . '/schema.sql');
$pdo->exec($schema);

// SQLite has no "ADD COLUMN IF NOT EXISTS" — guard new columns on tables that
// may already exist from before this migration was written.
$chatSessionColumns = array_column($pdo->query('PRAGMA table_info(chat_sessions)')->fetchAll(), 'name');
if (!in_array('client_phone', $chatSessionColumns, true)) {
    $pdo->exec('ALTER TABLE chat_sessions ADD COLUMN client_phone TEXT');
}

$projectColumns = array_column($pdo->query('PRAGMA table_info(projects)')->fetchAll(), 'name');
if (!in_array('is_embeddable', $projectColumns, true)) {
    $pdo->exec('ALTER TABLE projects ADD COLUMN is_embeddable INTEGER NOT NULL DEFAULT 0');
}

echo "Schema applied.\n";
