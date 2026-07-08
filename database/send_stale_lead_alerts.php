<?php

declare(strict_types=1);

// Flags quote requests that have sat in New/Reviewing too long by pushing a
// 'stale_lead' event to Make.com (if configured) — a marketing-automation
// nudge, not a client-facing email, so this mirrors send_milestone_reminders.php:
// a one-time push guarded by stale_alert_sent, only marked sent on a
// successful delivery so a transient failure gets retried next run.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\MakeWebhook;

const STALE_AFTER_DAYS = 5;

$pdo = Database::get();

$candidates = $pdo->query(
    "SELECT * FROM inquiries
     WHERE type = 'project_request'
       AND pipeline_stage IN ('new', 'reviewing')
       AND stale_alert_sent = 0
       AND created_at <= datetime('now', '-" . STALE_AFTER_DAYS . " days')"
)->fetchAll();

$sent = 0;
foreach ($candidates as $row) {
    $ok = MakeWebhook::send('stale_lead', [
        'name' => $row['name'],
        'email' => $row['email'],
        'project_type' => $row['project_type'],
        'pipeline_stage' => $row['pipeline_stage'],
        'created_at' => $row['created_at'],
    ]);

    if ($ok) {
        $pdo->prepare('UPDATE inquiries SET stale_alert_sent = 1 WHERE id = ?')->execute([$row['id']]);
        $sent++;
    }
}

echo "$sent stale lead alert(s) sent.\n";
