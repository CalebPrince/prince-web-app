<?php

declare(strict_types=1);

// One-off reset for the Marketing Leads / Cold Outreach pipeline — clears
// every discovered lead and everything downstream of it, so discovery and
// outreach start clean under the new query-rotation and yield-report code
// instead of carrying forward leads discovered under the old always-index-0
// rotation bug.
//
// Deliberately not run automatically by anything — destructive, one-time,
// operator-triggered only. Take a fresh snapshot first (php database/
// backup_db.php), then run from the app root on the server:
//
//   php database/reset_marketing_pipeline.php            (dry run — counts only)
//   php database/reset_marketing_pipeline.php --confirm   (actually deletes)
//
// account_demos, outreach_sends, and call_log all have lead_id ... ON DELETE
// CASCADE (schema.sql), and this app runs every connection with
// PRAGMA foreign_keys = ON (Database.php), so deleting a marketing_leads row
// cascades to those three automatically — no separate DELETE needed for them.
// drip_enrollments.lead_id and telephony_calls.marketing_lead_id are
// ON DELETE SET NULL instead: that history (nurture replies, call
// recordings) is kept, just detached from the now-deleted lead.
//
// Not touched: lead_discovery_queries, lead_discovery_daily_target,
// lead_discovery_query_offset, lead_discovery_pages, or the Serper API key.
// Discovery keeps its rotation position and per-query pagination exactly as
// they were, so the next run continues forward instead of re-fetching page 1
// of every query and immediately re-discovering what was just deleted.

require_once dirname(__DIR__) . '/src/autoload.php';
require_once dirname(__DIR__) . '/config/config.php';

use App\Support\Database;

$confirm = in_array('--confirm', array_slice($argv, 1), true);

$pdo = Database::get();

$counts = [
    'marketing_leads' => (int) $pdo->query('SELECT COUNT(*) FROM marketing_leads')->fetchColumn(),
    'account_demos'   => (int) $pdo->query('SELECT COUNT(*) FROM account_demos')->fetchColumn(),
    'outreach_sends'  => (int) $pdo->query('SELECT COUNT(*) FROM outreach_sends')->fetchColumn(),
    'call_log'        => (int) $pdo->query('SELECT COUNT(*) FROM call_log')->fetchColumn(),
];

echo "Marketing Leads pipeline reset\n";
echo "-------------------------------\n";
foreach ($counts as $table => $n) {
    echo str_pad($table, 18) . $n . "\n";
}

if ($counts['marketing_leads'] === 0) {
    echo "\nNothing to delete.\n";
    exit(0);
}

if (!$confirm) {
    echo "\nDry run only — nothing deleted.\n";
    echo "account_demos, outreach_sends, and call_log above will cascade-delete automatically with their lead.\n";
    echo "Re-run with --confirm to actually delete. Take a backup first: php database/backup_db.php\n";
    exit(0);
}

$pdo->exec('DELETE FROM marketing_leads');

echo "\nDeleted {$counts['marketing_leads']} lead(s) and everything cascaded from them.\n";
echo "Discovery search settings, rotation offset, and per-query pagination were left untouched —\n";
echo "the next discovery run picks up exactly where it was, against a clean lead table.\n";
