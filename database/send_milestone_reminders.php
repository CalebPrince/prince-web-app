<?php

declare(strict_types=1);

// Emails a one-time nudge for proposal milestones that are still unpaid a
// few days after the client accepted. Mirrors send_appointment_reminders.php:
// reminder_sent guards against sending the same nudge twice, and this is
// intentionally a single reminder (not a repeating dunning sequence) to
// match how the rest of this app keeps automated outreach light-touch.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\Mailer;

const REMINDER_DELAY_DAYS = 3;

$pdo = Database::get();

$candidates = $pdo->query(
    "SELECT pm.id AS milestone_id, pm.title AS milestone_title, pm.amount, pm.currency,
            p.title AS proposal_title, p.client_name, p.client_email, p.accepted_at,
            pl.token AS payment_token
     FROM proposal_milestones pm
     JOIN proposals p ON p.id = pm.proposal_id
     JOIN payment_links pl ON pl.id = pm.payment_link_id
     WHERE pm.reminder_sent = 0
       AND p.status = 'accepted'
       AND pl.status = 'pending'
       AND p.accepted_at <= datetime('now', '-" . REMINDER_DELAY_DAYS . " days')"
)->fetchAll();

$sent = 0;
foreach ($candidates as $row) {
    $amount = number_format(((int) $row['amount']) / 100, 2);
    $payUrl = 'https://princecaleb.dev/pay.html?token=' . $row['payment_token'];

    $ok = Mailer::send(
        $row['client_email'],
        "Reminder: {$row['milestone_title']} payment is still pending",
        "Hi {$row['client_name']},\n\nJust a reminder that the \"{$row['milestone_title']}\" milestone "
            . "({$row['currency']} {$amount}) on your \"{$row['proposal_title']}\" project is still unpaid:\n\n{$payUrl}\n\n"
            . "If you've already sent this another way or have questions, just reply to this email.\n\n— Prince Caleb"
    );

    if ($ok) {
        $pdo->prepare('UPDATE proposal_milestones SET reminder_sent = 1 WHERE id = ?')->execute([$row['milestone_id']]);
        $sent++;
    }
}

echo "$sent milestone payment reminder(s) sent.\n";
