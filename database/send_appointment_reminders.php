<?php

declare(strict_types=1);

// Emails a "your call is tomorrow" reminder ~24h before each confirmed
// booking. Run this on a schedule (e.g. every 30 minutes) — the window is
// wider than the run interval so a slow/late cron never skips a booking,
// and reminder_sent guards against sending the same reminder twice.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\Mailer;
use App\Support\Settings;

$pdo = Database::get();
$timezone = Settings::get('booking_timezone') ?: 'Africa/Accra';

try {
    $tz = new DateTimeZone($timezone);
} catch (Exception) {
    $tz = new DateTimeZone('UTC');
}

$now = new DateTime('now', $tz);
$windowStart = (clone $now)->modify('+23 hours');
$windowEnd = (clone $now)->modify('+25 hours');

$candidates = $pdo->query(
    "SELECT * FROM appointments WHERE status = 'confirmed' AND reminder_sent = 0"
)->fetchAll();

$sent = 0;
foreach ($candidates as $appt) {
    $when = DateTime::createFromFormat('Y-m-d H:i', "{$appt['appointment_date']} {$appt['appointment_time']}", $tz);
    if (!$when || $when < $windowStart || $when > $windowEnd) {
        continue;
    }

    $ok = Mailer::send(
        $appt['client_email'],
        "Reminder: your call is tomorrow at {$appt['appointment_time']}",
        "Hi {$appt['client_name']},\n\nJust a reminder that your call is scheduled for tomorrow, "
            . "{$appt['appointment_date']} at {$appt['appointment_time']} ({$timezone}).\n\n"
            . ($appt['topic'] ? "Topic: {$appt['topic']}\n\n" : '')
            . "If you need to reschedule or cancel, just reply to this email.\n\n— Prince Caleb"
    );
    if ($ok) {
        $pdo->prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ?')->execute([$appt['id']]);
        $sent++;
    }
}

echo "$sent appointment reminder(s) sent.\n";
