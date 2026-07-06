<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\Database;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Settings;

/**
 * Internal availability model — no external calendar account needed. The
 * admin sets which weekdays/hours are bookable (mirrors the existing Live
 * Chat hours pattern); slots are generated on the fly from that config and
 * checked against existing (non-cancelled) bookings.
 */
class AppointmentController
{
    private const DAY_MAP = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

    private static function config(): array
    {
        $tz = Settings::get('booking_timezone') ?: 'Africa/Accra';
        return [
            'enabled' => Settings::get('booking_enabled') === '1',
            'days' => array_filter(array_map('trim', explode(',', Settings::get('booking_days') ?? ''))),
            'start' => Settings::get('booking_start_time') ?: '09:00',
            'end' => Settings::get('booking_end_time') ?: '17:00',
            'slotMinutes' => max(15, (int) (Settings::get('booking_slot_minutes') ?: 30)),
            'leadDays' => max(1, (int) (Settings::get('booking_lead_days') ?: 14)),
            'minNoticeHours' => max(0, (int) (Settings::get('booking_min_notice_hours') ?: 24)),
            'timezone' => $tz,
        ];
    }

    /** @return array<int,string> "HH:MM" slots for the given date, before removing booked ones */
    private static function possibleSlots(string $date, array $cfg): array
    {
        try {
            $tz = new \DateTimeZone($cfg['timezone']);
            $day = new \DateTime($date, $tz);
        } catch (\Exception) {
            return [];
        }
        if (!in_array(self::DAY_MAP[(int) $day->format('w')], $cfg['days'], true)) {
            return [];
        }

        $slots = [];
        $cursor = \DateTime::createFromFormat('Y-m-d H:i', "{$date} {$cfg['start']}", $tz);
        $end = \DateTime::createFromFormat('Y-m-d H:i', "{$date} {$cfg['end']}", $tz);
        if (!$cursor || !$end) {
            return [];
        }

        $now = new \DateTime('now', $tz);
        $minNotice = (clone $now)->modify("+{$cfg['minNoticeHours']} hours");
        $maxDate = (clone $now)->modify("+{$cfg['leadDays']} days");

        if ($day > $maxDate) {
            return [];
        }

        while ($cursor < $end) {
            if ($cursor >= $minNotice) {
                $slots[] = $cursor->format('H:i');
            }
            $cursor->modify("+{$cfg['slotMinutes']} minutes");
        }

        return $slots;
    }

    /** GET /api/v1/appointments/config — public */
    public static function publicConfig(): void
    {
        Response::json(['enabled' => self::config()['enabled']]);
    }

    /** GET /api/v1/appointments/availability?date=YYYY-MM-DD — public */
    public static function availability(): void
    {
        $cfg = self::config();
        if (!$cfg['enabled']) {
            Response::json(['slots' => []]);
        }

        $date = $_GET['date'] ?? '';
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            Response::error('Invalid date.', 422);
        }

        $slots = self::possibleSlots($date, $cfg);
        if ($slots) {
            $pdo = Database::get();
            $stmt = $pdo->prepare(
                "SELECT appointment_time FROM appointments WHERE appointment_date = ? AND status != 'cancelled'"
            );
            $stmt->execute([$date]);
            $booked = array_column($stmt->fetchAll(), 'appointment_time');
            $slots = array_values(array_diff($slots, $booked));
        }

        Response::json(['slots' => $slots]);
    }

    /** POST /api/v1/appointments/book — public, honeypot + rate-limited */
    public static function book(): void
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        RateLimitMiddleware::enforce('appointment_book', appConfig()['contact_rate_limit']);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        if (!empty($data['website'])) {
            Response::json(['status' => 'booked'], 201);
        }

        $cfg = self::config();
        if (!$cfg['enabled']) {
            Response::error('Booking is not available right now.', 422);
        }

        $name = trim((string) ($data['name'] ?? ''));
        $email = trim((string) ($data['email'] ?? ''));
        $phone = trim((string) ($data['phone'] ?? ''));
        $date = trim((string) ($data['date'] ?? ''));
        $time = trim((string) ($data['time'] ?? ''));
        $topic = trim((string) ($data['topic'] ?? ''));

        $errors = [];
        if ($name === '' || mb_strlen($name) > 255) $errors[] = 'Name is required.';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'A valid email is required.';
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) $errors[] = 'Invalid date.';
        if (!preg_match('/^\d{2}:\d{2}$/', $time)) $errors[] = 'Invalid time.';
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        // Re-check the slot is still genuinely offered, not just well-formed.
        if (!in_array($time, self::possibleSlots($date, $cfg), true)) {
            Response::error('That slot is no longer available.', 422);
        }

        $pdo = Database::get();
        try {
            $pdo->prepare(
                'INSERT INTO appointments (client_name, client_email, client_phone, appointment_date, appointment_time, duration_minutes, topic)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            )->execute([$name, $email, $phone ?: null, $date, $time, $cfg['slotMinutes'], $topic ?: null]);
        } catch (\PDOException $e) {
            // Partial unique index violation — someone else booked it first.
            Response::error('That slot was just booked by someone else — please pick another.', 409);
        }

        $notifyEmail = Settings::get('notification_email') ?: Settings::get('social_email');
        if ($notifyEmail) {
            Mailer::send(
                $notifyEmail,
                "New booking: {$date} {$time}",
                "Name: {$name}\nEmail: {$email}\nPhone: " . ($phone ?: '—') . "\nTopic: " . ($topic ?: '—') . "\n\nDate: {$date}\nTime: {$time}"
            );
        }
        Mailer::send(
            $email,
            "Your call is booked — {$date} at {$time}",
            "Hi {$name},\n\nYou're booked in for {$date} at {$time} ({$cfg['timezone']}).\n\nIf you need to reschedule or cancel, just reply to this email.\n\n— Prince Caleb"
        );

        Response::json(['status' => 'booked'], 201);
    }

    /** GET /api/v1/admin/appointments */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        Response::json(
            $pdo->query('SELECT * FROM appointments ORDER BY appointment_date DESC, appointment_time DESC')->fetchAll()
        );
    }

    /** PATCH /api/v1/admin/appointments/{id} — body: {"status": "cancelled"|"completed"|"confirmed"} */
    public static function updateStatus(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $status = $data['status'] ?? '';
        if (!in_array($status, ['confirmed', 'cancelled', 'completed'], true)) {
            Response::error('Invalid status.', 422);
        }
        Database::get()->prepare('UPDATE appointments SET status = ? WHERE id = ?')
            ->execute([$status, (int) $params['id']]);
        Response::json(['status' => 'updated']);
    }
}
