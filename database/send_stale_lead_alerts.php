<?php

declare(strict_types=1);

// Flags quote requests that have sat in New/Reviewing too long by recording a
// 'stale_lead' integration event — a marketing-automation nudge, not a
// client-facing email. One-time per lead, guarded by stale_alert_sent.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\IntegrationEvent;

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
    IntegrationEvent::log('stale_lead', [
        'name' => $row['name'],
        'email' => $row['email'],
        'project_type' => $row['project_type'],
        'pipeline_stage' => $row['pipeline_stage'],
        'created_at' => $row['created_at'],
    ]);

    $pdo->prepare('UPDATE inquiries SET stale_alert_sent = 1 WHERE id = ?')->execute([$row['id']]);
    $sent++;
}

echo "$sent stale lead alert(s) sent.\n";
