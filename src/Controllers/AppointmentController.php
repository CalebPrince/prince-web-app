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
        $result = self::getAvailableSlots((string) ($_GET['date'] ?? ''));
        if (isset($result['error'])) {
            Response::error($result['error'], 422);
        }
        Response::json(['slots' => $result['slots']]);
    }

    /**
     * Pure availability lookup, reused by the public HTTP endpoint above and
     * by the Live Chat check_availability tool (which can't use Response::json
     * since that exits mid-conversation).
     *
     * @return array{enabled:bool, slots:array<int,string>, timezone?:string, error?:string}
     */
    public static function getAvailableSlots(string $date): array
    {
        $cfg = self::config();
        if (!$cfg['enabled']) {
            return ['enabled' => false, 'slots' => []];
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return ['enabled' => true, 'slots' => [], 'error' => 'Invalid date — expected YYYY-MM-DD.'];
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

        return ['enabled' => true, 'slots' => $slots, 'timezone' => $cfg['timezone']];
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

        $result = self::createBooking($data);
        if (!$result['success']) {
            Response::error($result['error'], $result['code'] ?? 422);
        }
        Response::json(['status' => 'booked'], 201);
    }

    /**
     * Pure booking logic, reused by the public HTTP endpoint above and by the
     * Live Chat book_appointment tool.
     *
     * @param array{name?:string,email?:string,phone?:string,date?:string,time?:string,topic?:string} $data
     * @return array{success:bool, error?:string, code?:int, date?:string, time?:string, timezone?:string}
     */
    public static function createBooking(array $data): array
    {
        $cfg = self::config();
        if (!$cfg['enabled']) {
            return ['success' => false, 'error' => 'Booking is not available right now.'];
        }

        $name = trim((string) ($data['name'] ?? ''));
        $email = trim((string) ($data['email'] ?? ''));
        $phone = trim((string) ($data['phone'] ?? ''));
        $date = trim((string) ($data['date'] ?? ''));
        $time = trim((string) ($data['time'] ?? ''));
        $topic = trim((string) ($data['topic'] ?? ''));

        if ($name === '' || mb_strlen($name) > 255) {
            return ['success' => false, 'error' => 'A valid name is required.'];
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'error' => 'A valid email is required.'];
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return ['success' => false, 'error' => 'Invalid date — use YYYY-MM-DD.'];
        }
        if (!preg_match('/^\d{2}:\d{2}$/', $time)) {
            return ['success' => false, 'error' => 'Invalid time — use HH:MM.'];
        }

        // Re-check the slot is still genuinely offered, not just well-formed.
        if (!in_array($time, self::possibleSlots($date, $cfg), true)) {
            return ['success' => false, 'error' => 'That slot is no longer available.'];
        }

        $pdo = Database::get();
        try {
            $pdo->prepare(
                'INSERT INTO appointments (client_name, client_email, client_phone, appointment_date, appointment_time, duration_minutes, topic)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            )->execute([$name, $email, $phone ?: null, $date, $time, $cfg['slotMinutes'], $topic ?: null]);
        } catch (\PDOException $e) {
            // Partial unique index violation — someone else booked it first.
            return ['success' => false, 'error' => 'That slot was just booked by someone else — please pick another.', 'code' => 409];
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

        return ['success' => true, 'date' => $date, 'time' => $time, 'timezone' => $cfg['timezone']];
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
