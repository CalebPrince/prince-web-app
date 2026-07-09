<?php

declare(strict_types=1);

// Sends any drip-sequence steps that have come due. Run on a cron (hourly
// is plenty — offsets are whole days). For each active enrollment, a step
// is due when `enrolled_at + day_offset days` has passed and that step
// hasn't been sent to that enrollment yet (drip_sends is UNIQUE per pair,
// so retries and overlapping runs can't double-send). Enrollments with no
// remaining active steps are marked completed. {{name}} personalizes the
// copy, and every email carries the enrollment's unsubscribe link.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\Mailer;

$pdo = Database::get();

$due = $pdo->query(
    "SELECT e.id AS enrollment_id, e.email, e.name, e.unsubscribe_token, s.id AS step_id, s.subject, s.body
     FROM drip_enrollments e
     JOIN drip_steps s ON s.is_active = 1
     WHERE e.status = 'active'
       AND datetime(e.enrolled_at, '+' || s.day_offset || ' days') <= datetime('now')
       AND NOT EXISTS (SELECT 1 FROM drip_sends ds WHERE ds.enrollment_id = e.id AND ds.step_id = s.id)
     ORDER BY e.id, s.day_offset"
)->fetchAll();

$sent = 0;
foreach ($due as $row) {
    $name = trim((string) ($row['name'] ?? '')) ?: 'there';
    $subject = str_replace('{{name}}', $name, $row['subject']);
    $body = str_replace('{{name}}', $name, $row['body']);
    $body .= "\n\n—\nNo longer interested? Unsubscribe here and you won't hear from me again:\n"
        . 'https://princecaleb.dev/api/v1/drip/unsubscribe?token=' . $row['unsubscribe_token'];

    if (Mailer::send($row['email'], $subject, $body)) {
        $pdo->prepare('INSERT OR IGNORE INTO drip_sends (enrollment_id, step_id) VALUES (?, ?)')
            ->execute([$row['enrollment_id'], $row['step_id']]);
        $sent++;
    }
}

// Close out enrollments that have received every active step.
$completed = $pdo->exec(
    "UPDATE drip_enrollments SET status = 'completed'
     WHERE status = 'active'
       AND (SELECT COUNT(*) FROM drip_steps WHERE is_active = 1) > 0
       AND NOT EXISTS (
         SELECT 1 FROM drip_steps s
         WHERE s.is_active = 1
           AND NOT EXISTS (SELECT 1 FROM drip_sends ds WHERE ds.enrollment_id = drip_enrollments.id AND ds.step_id = s.id)
       )"
);

echo "$sent drip email(s) sent, $completed enrollment(s) completed.\n";
