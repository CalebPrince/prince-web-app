<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\Composio;
use App\Support\Database;
use App\Support\EmailTemplate;
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

        // filter_var happily accepts "your@email.com" as a syntactically
        // valid address — it can't tell a real one from a placeholder an AI
        // caller fabricated because it didn't actually have the visitor's
        // real name/email yet but felt pressured to fill a required field
        // rather than asking first. This is a defense in depth alongside
        // the system prompt instruction not to do that, not a replacement
        // for it — it only catches the handful of obvious, common patterns.
        if ($name === '' || mb_strlen($name) > 255 || self::looksLikePlaceholder($name)) {
            return ['success' => false, 'error' => 'A real name is required — this looks like a placeholder. Ask the visitor for their actual name before calling this again.'];
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || self::looksLikePlaceholder($email)) {
            return ['success' => false, 'error' => 'A real email is required — this looks like a placeholder. Ask the visitor for their actual email before calling this again.'];
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return ['success' => false, 'error' => 'Invalid date — use YYYY-MM-DD.'];
        }
        if (!preg_match('/^\d{2}:\d{2}$/', $time)) {
            return ['success' => false, 'error' => 'Invalid time — use HH:MM.'];
        }

        // Re-check the slot is still genuinely offered, not just well-formed.
        if (!in_array($time, self::possibleSlots($date, $cfg), true)) {
            // Handing back the current real slots here (rather than making
            // the caller re-call check_availability, which an LLM caller
            // can't be relied on to reliably remember to do) is what lets
            // Live Chat recover in the same turn instead of guessing at
            // "a bit later" or retrying the same rejected time.
            return [
                'success' => false,
                'error' => 'That slot is no longer available.',
                'available_slots' => self::getAvailableSlots($date)['slots'] ?? [],
            ];
        }

        $pdo = Database::get();
        try {
            $pdo->prepare(
                'INSERT INTO appointments (client_name, client_email, client_phone, appointment_date, appointment_time, duration_minutes, topic)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            )->execute([$name, $email, $phone ?: null, $date, $time, $cfg['slotMinutes'], $topic ?: null]);
            $appointmentId = (int) $pdo->lastInsertId();
        } catch (\PDOException $e) {
            // Partial unique index violation. Confirmed in production: an
            // AI caller can end up re-calling this tool for a slot it
            // already secured (e.g. a plain "thanks" after a confirmed
            // booking, with no real reason to book again) — if the existing
            // row for this exact date/time already belongs to the same
            // email, this is that, not a real conflict with someone else,
            // and telling the visitor "someone else took it" would be
            // actively wrong. Treat it as the success it already is.
            $existing = $pdo->prepare(
                "SELECT client_email FROM appointments WHERE appointment_date = ? AND appointment_time = ? AND status != 'cancelled' LIMIT 1"
            );
            $existing->execute([$date, $time]);
            $existingEmail = $existing->fetchColumn();

            if ($existingEmail !== false && strcasecmp((string) $existingEmail, $email) === 0) {
                return ['success' => true, 'date' => $date, 'time' => $time, 'timezone' => $cfg['timezone']];
            }

            return [
                'success' => false,
                'error' => 'That slot was just booked by someone else — please pick another.',
                'code' => 409,
                'available_slots' => self::getAvailableSlots($date)['slots'] ?? [],
            ];
        }

        $notifyEmail = Settings::get('notification_email') ?: Settings::get('social_email');
        $templateVars = self::bookingTemplateVars([
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'date' => $date,
            'time' => $time,
            'timezone' => $cfg['timezone'],
            'topic' => $topic,
        ]);
        if ($notifyEmail) {
            $message = EmailTemplate::render(
                'booking_internal_notification',
                $templateVars,
                EmailTemplate::defaults()['booking_internal_notification']
            );
            Mailer::sendHtml($notifyEmail, $message['subject'], $message['html'], $message['text'], $email);
            if (false) Mailer::send(
                $notifyEmail,
                "New booking: {$date} {$time}",
                "Name: {$name}\nEmail: {$email}\nPhone: " . ($phone ?: '—') . "\nTopic: " . ($topic ?: '—') . "\n\nDate: {$date}\nTime: {$time}"
            );
        }
        $message = EmailTemplate::render(
            'booking_client_confirmation',
            $templateVars,
            EmailTemplate::defaults()['booking_client_confirmation']
        );
        Mailer::sendHtml($email, $message['subject'], $message['html'], $message['text']);
        if (false) Mailer::send(
            $email,
            "Your call is booked — {$date} at {$time}",
            "Hi {$name},\n\nYou're booked in for {$date} at {$time} ({$cfg['timezone']}).\n\nIf you need to reschedule or cancel, just reply to this email.\n\n— Prince Caleb"
        );

        self::sendComposioBookingActions([
            'id' => $appointmentId,
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'date' => $date,
            'time' => $time,
            'duration_minutes' => $cfg['slotMinutes'],
            'timezone' => $cfg['timezone'],
            'topic' => $topic,
        ]);

        return ['success' => true, 'date' => $date, 'time' => $time, 'timezone' => $cfg['timezone']];
    }

    /**
     * Catches a handful of common literal placeholder values ("Your Name",
     * "your@email.com", "test@example.com", ...) — confirmed in production:
     * Live Chat booked a real slot with exactly these because it needed to
     * fill required name/email fields and never actually had the visitor's
     * real ones. Deliberately just the obvious, common cases — this can't
     * catch every possible fabricated value, it's a backstop alongside the
     * system prompt instruction not to do this, not a substitute for it.
     */
    private static function looksLikePlaceholder(string $value): bool
    {
        $normalized = strtolower(trim($value));
        return in_array($normalized, [
            'your name', 'your email', 'your@email.com', 'name here', 'email here',
            'example@example.com', 'test@example.com', 'test@test.com', 'n/a', 'na',
            'none', 'unknown', 'visitor', 'client name', 'customer name', 'full name',
        ], true);
    }

    /** Best-effort Composio fan-out after a confirmed booking. Booking itself never depends on these calls. */
    private static function sendComposioBookingActions(array $booking): void
    {
        if (empty(Settings::get('composio_api_key'))) {
            return;
        }

        $start = self::bookingDateTime($booking['date'], $booking['time'], $booking['timezone']);
        $end = $start ? (clone $start)->modify('+' . (int) $booking['duration_minutes'] . ' minutes') : null;
        $message = EmailTemplate::render(
            'booking_internal_notification',
            self::bookingTemplateVars($booking),
            EmailTemplate::defaults()['booking_internal_notification']
        );
        $summary = $message['subject'];
        $details = $message['text'];

        $calendarId = Settings::get('composio_google_calendar_id') ?: 'primary';
        $startIso = $start ? $start->format(\DateTimeInterface::ATOM) : "{$booking['date']}T{$booking['time']}:00";
        $endIso = $end ? $end->format(\DateTimeInterface::ATOM) : null;
        self::executeBookingAction('google_calendar', [
            [
                'calendar_id' => $calendarId,
                'summary' => 'Call with ' . $booking['name'],
                'description' => $details,
                'start_datetime' => $startIso,
                'end_datetime' => $endIso,
                'timezone' => $booking['timezone'],
                'attendees' => [['email' => $booking['email']]],
            ],
            [
                'calendar_id' => $calendarId,
                'title' => 'Call with ' . $booking['name'],
                'description' => $details,
                'start' => $startIso,
                'end' => $endIso,
                'timezone' => $booking['timezone'],
                'attendee_emails' => [$booking['email']],
            ],
        ], 'GOOGLECALENDAR_CREATE_EVENT');

        $gmailTo = Settings::get('composio_gmail_booking_to') ?: (Settings::get('notification_email') ?: Settings::get('social_email'));
        if (!empty($gmailTo)) {
            self::executeBookingAction('gmail', [
                [
                    'recipient_email' => $gmailTo,
                    'subject' => $summary,
                    'body' => $details,
                ],
                [
                    'to' => $gmailTo,
                    'subject' => $summary,
                    'message' => $details,
                ],
            ], 'GMAIL_SEND_EMAIL');
        }

        self::executeBookingAction('slack', [
            'channel' => Settings::get('composio_slack_channel') ?: null,
            'text' => $details,
        ], 'SLACK_SEND_MESSAGE');

        $whatsappTo = Settings::get('composio_whatsapp_booking_to') ?: $booking['phone'];
        if (!empty($whatsappTo)) {
            self::executeBookingAction('whatsapp', [
                'to' => $whatsappTo,
                'message' => $details,
            ], 'WHATSAPP_SEND_MESSAGE');
        }
    }

    private static function executeBookingAction(string $toolkit, array $payloads, string $defaultTool): void
    {
        $accountId = Settings::get("composio_{$toolkit}_account_id");
        $tool = Settings::get("composio_{$toolkit}_booking_tool") ?: $defaultTool;
        if (empty($accountId) || empty($tool)) {
            return;
        }

        $variants = self::isList($payloads) ? $payloads : [$payloads];
        foreach ($variants as $payload) {
            $payload = array_filter($payload, fn($value) => $value !== null && $value !== '' && $value !== []);
            $result = Composio::executeTool($tool, $accountId, $payload);
            if ($result !== null) {
                Settings::set("composio_{$toolkit}_last_error", '');
                return;
            }
        }

        $lastError = Composio::lastError() ?: 'No detailed Composio error was returned.';
        Settings::set(
            "composio_{$toolkit}_last_error",
            date('c') . " - {$toolkit} booking action failed using {$tool}: " . $lastError
        );
        error_log("Composio booking action failed for {$toolkit} using {$tool}: {$lastError}");
    }

    private static function isList(array $value): bool
    {
        return $value === [] || array_keys($value) === range(0, count($value) - 1);
    }

    private static function bookingDateTime(string $date, string $time, string $timezone): ?\DateTime
    {
        try {
            return new \DateTime("{$date} {$time}", new \DateTimeZone($timezone));
        } catch (\Throwable) {
            return null;
        }
    }

    private static function bookingMessage(array $booking): string
    {
        return EmailTemplate::render(
            'booking_internal_notification',
            self::bookingTemplateVars($booking),
            EmailTemplate::defaults()['booking_internal_notification']
        )['text'];
    }

    /** @return array<string,string> */
    private static function bookingTemplateVars(array $booking): array
    {
        $topic = trim((string) ($booking['topic'] ?? ''));
        return [
            'client_name' => (string) ($booking['name'] ?? ''),
            'client_email' => (string) ($booking['email'] ?? ''),
            'client_phone' => (string) (($booking['phone'] ?? '') ?: '-'),
            'topic' => $topic !== '' ? $topic : '-',
            'topic_line' => $topic !== '' ? 'Topic: ' . $topic : '',
            'date' => (string) ($booking['date'] ?? ''),
            'time' => (string) ($booking['time'] ?? ''),
            'timezone' => (string) ($booking['timezone'] ?? ''),
        ];
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
