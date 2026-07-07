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
if (!in_array('ready_for_prototype', $chatSessionColumns, true)) {
    $pdo->exec('ALTER TABLE chat_sessions ADD COLUMN ready_for_prototype INTEGER NOT NULL DEFAULT 0');
}

$projectColumns = array_column($pdo->query('PRAGMA table_info(projects)')->fetchAll(), 'name');
if (!in_array('is_embeddable', $projectColumns, true)) {
    $pdo->exec('ALTER TABLE projects ADD COLUMN is_embeddable INTEGER NOT NULL DEFAULT 0');
}

$webhookColumns = array_column($pdo->query('PRAGMA table_info(webhook_queue)')->fetchAll(), 'name');
if (!in_array('slack_sent', $webhookColumns, true)) {
    $pdo->exec('ALTER TABLE webhook_queue ADD COLUMN slack_sent INTEGER NOT NULL DEFAULT 0');
}
if (!in_array('email_sent', $webhookColumns, true)) {
    $pdo->exec('ALTER TABLE webhook_queue ADD COLUMN email_sent INTEGER NOT NULL DEFAULT 0');
}

$inquiryColumns = array_column($pdo->query('PRAGMA table_info(inquiries)')->fetchAll(), 'name');
if (!in_array('type', $inquiryColumns, true)) {
    $pdo->exec("ALTER TABLE inquiries ADD COLUMN type TEXT NOT NULL DEFAULT 'contact'");
}
foreach (['project_type', 'budget', 'timeline', 'features', 'attachments'] as $col) {
    if (!in_array($col, $inquiryColumns, true)) {
        $pdo->exec("ALTER TABLE inquiries ADD COLUMN {$col} TEXT");
    }
}
$pdo->exec('CREATE INDEX IF NOT EXISTS idx_inquiries_type ON inquiries (type)');

$appointmentColumns = array_column($pdo->query('PRAGMA table_info(appointments)')->fetchAll(), 'name');
if (!in_array('reminder_sent', $appointmentColumns, true)) {
    $pdo->exec('ALTER TABLE appointments ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0');
}

echo "Schema applied.\n";
