<?php

declare(strict_types=1);

// Sends Nurturer's AI-personalized sequence 2/3 follow-ups for any enrolled
// lead who's opted in (drip_enrollments.nurturer_enabled = 1) and come due.
// Run on a cron (hourly is plenty — offsets are whole days), alongside
// send_drip_emails.php. A sequence is due when `enrolled_at +
// nurturer_sequence_{N}_day_offset days` has passed and hasn't already been
// sent to that enrollment (nurturer_sends is UNIQUE per (enrollment,
// sequence), so retries and overlapping runs can't double-send). One
// failure doesn't stop the run, same as send_drip_emails.php.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\NurturerController;
use App\Support\Database;
use App\Support\Mailer;
use App\Support\Settings;

$pdo = Database::get();

$sequence2Offset = (int) (Settings::get('nurturer_sequence_2_day_offset') ?: 3);
$sequence3Offset = (int) (Settings::get('nurturer_sequence_3_day_offset') ?: 7);

$stmt = $pdo->prepare(
    "SELECT e.id AS enrollment_id, e.email, e.name, e.unsubscribe_token, e.lead_industry, e.last_action
     FROM drip_enrollments e
     WHERE e.status = 'active'
       AND e.nurturer_enabled = 1
       AND datetime(e.enrolled_at, '+' || ? || ' days') <= datetime('now')
       AND NOT EXISTS (SELECT 1 FROM nurturer_sends ns WHERE ns.enrollment_id = e.id AND ns.sequence_number = ?)"
);

$sent = 0;
foreach ([2 => $sequence2Offset, 3 => $sequence3Offset] as $sequenceNumber => $dayOffset) {
    $stmt->execute([$dayOffset, $sequenceNumber]);
    $due = $stmt->fetchAll();

    foreach ($due as $row) {
        $name = trim((string) ($row['name'] ?? '')) ?: 'there';
        $leadIndustry = trim((string) ($row['lead_industry'] ?? '')) ?: 'general business';
        $lastAction = trim((string) ($row['last_action'] ?? '')) ?: 'visited princecaleb.dev and was enrolled for follow-up';

        $result = NurturerController::generateFollowUp($name, $leadIndustry, $lastAction, $sequenceNumber);
        if ($result === null) {
            continue;
        }

        $body = $result['email_body'] . "\n\n—\nNo longer interested? Unsubscribe here and you won't hear from me again:\n"
            . 'https://princecaleb.dev/api/v1/drip/unsubscribe?token=' . $row['unsubscribe_token'];

        if (Mailer::send($row['email'], $result['subject_line'], $body)) {
            $pdo->prepare(
                'INSERT OR IGNORE INTO nurturer_sends (enrollment_id, sequence_number, subject_line, email_body) VALUES (?, ?, ?, ?)'
            )->execute([$row['enrollment_id'], $sequenceNumber, $result['subject_line'], $result['email_body']]);
            $sent++;
        }
    }
}

echo "$sent Nurturer email(s) sent.\n";
