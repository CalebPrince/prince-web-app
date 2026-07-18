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

// Each enrollment only receives the steps of its OWN automation, and only
// while that automation is switched on (a.is_active) — pausing an automation
// halts every sequence in flight, the master-switch behaviour the admin UI
// promises. drip_sends stays UNIQUE per (enrollment, step), so a lead in
// several automations at once still can't be double-sent the same step.
$due = $pdo->query(
    "SELECT e.id AS enrollment_id, e.email, e.name, e.unsubscribe_token, s.id AS step_id, s.subject, s.body
     FROM drip_enrollments e
     JOIN automations a ON a.id = e.automation_id AND a.is_active = 1
     JOIN drip_steps s ON s.automation_id = e.automation_id AND s.is_active = 1
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

// Close out enrollments that have received every active step — and, for
// leads opted into Nurturer, both of its AI follow-ups too. Completing on
// the fixed steps alone would strand those: send_nurturer_emails.php only
// picks up active enrollments, so anything still due (likely, whenever the
// last active step's day_offset falls before the sequence 3 offset) would
// silently never send.
$completed = $pdo->exec(
    "UPDATE drip_enrollments SET status = 'completed'
     WHERE status = 'active'
       AND (SELECT is_active FROM automations WHERE id = drip_enrollments.automation_id) = 1
       AND (SELECT COUNT(*) FROM drip_steps WHERE is_active = 1 AND automation_id = drip_enrollments.automation_id) > 0
       AND NOT EXISTS (
         SELECT 1 FROM drip_steps s
         WHERE s.is_active = 1 AND s.automation_id = drip_enrollments.automation_id
           AND NOT EXISTS (SELECT 1 FROM drip_sends ds WHERE ds.enrollment_id = drip_enrollments.id AND ds.step_id = s.id)
       )
       AND (
         nurturer_enabled = 0
         OR (
           SELECT COUNT(*) FROM nurturer_sends ns
           WHERE ns.enrollment_id = drip_enrollments.id AND ns.sequence_number IN (2, 3)
         ) = 2
       )"
);

echo "$sent drip email(s) sent, $completed enrollment(s) completed.\n";
