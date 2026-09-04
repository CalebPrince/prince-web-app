<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\LeadAttribution;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\ActivityLog;
use App\Support\Automations;
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

    /**
     * Quarterly project-intake gate. When the current quarter's intake is
     * closed, new discovery calls are refused on every channel — the public
     * /book page, Live Chat, WhatsApp, and the voice agent all route through
     * createBooking(). Reschedules of existing bookings are deliberately not
     * gated (rescheduleBooking does not call createBooking). Kept in lockstep
     * with the web side's resolveQuarterlyIntake(): the trigger is the status
     * being exactly the string "closed".
     */
    private static function intakeClosed(): bool
    {
        return strtolower(trim((string) Settings::get('quarterly_project_status'))) === 'closed';
    }

    private static function intakeClosedMessage(): string
    {
        $nextOpen = trim((string) Settings::get('quarterly_next_open_date'));
        return 'Project intake for this quarter is full, so new calls are paused'
            . ($nextOpen !== '' ? ' until ' . $nextOpen . '.' : ' until the next quarter.')
            . ' Point the visitor to the contact page or WhatsApp so they can register interest for the next intake.';
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

        return [
            'enabled' => true,
            'slots' => $slots,
            'timezone' => $cfg['timezone'],
            'presentation_instruction' => count($slots) > 4
                ? 'Display the date as DD-MM-YYYY, not written-out words. Do not list every slot. Ask whether the client prefers morning or afternoon, then offer at most four exact slots from that period.'
                : 'Display the date as DD-MM-YYYY and offer only these exact slots.',
        ];
    }

    /** @return array{enabled:bool,dates:array<int,array{date:string,day:string,slots:array<int,string>}>,timezone?:string,error?:string} */
    public static function getAvailableDateRange(string $startDate, string $endDate): array
    {
        $cfg = self::config();
        if (!$cfg['enabled']) return ['enabled' => false, 'dates' => []];
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)
            || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate)) {
            return ['enabled' => true, 'dates' => [], 'error' => 'Dates must use YYYY-MM-DD.'];
        }
        try {
            $tz = new \DateTimeZone($cfg['timezone']);
            $start = new \DateTime($startDate, $tz);
            $end = new \DateTime($endDate, $tz);
        } catch (\Throwable) {
            return ['enabled' => true, 'dates' => [], 'error' => 'Invalid date range.'];
        }
        if ($end < $start || (int) $start->diff($end)->format('%a') > 14) {
            return ['enabled' => true, 'dates' => [], 'error' => 'Choose a date range of 14 days or fewer.'];
        }
        $dates = [];
        for ($cursor = clone $start; $cursor <= $end; $cursor->modify('+1 day')) {
            $date = $cursor->format('Y-m-d');
            $availability = self::getAvailableSlots($date);
            if (!empty($availability['slots'])) {
                $dates[] = [
                    'date' => $date,
                    'day' => $cursor->format('l'),
                    'slots' => $availability['slots'],
                ];
            }
        }
        return [
            'enabled' => true,
            'dates' => $dates,
            'timezone' => $cfg['timezone'],
            'presentation_instruction' => count($dates) > 1
                ? 'Display every date as DD-MM-YYYY. First summarize the available dates and ask the client to choose a date. Do not list every time across every day.'
                : 'Display the date as DD-MM-YYYY. If it has more than four slots, ask for a morning or afternoon preference before offering times.',
        ];
    }

    /**
     * Owner-only read for Lisa's `list_bookings` tool: upcoming non-cancelled
     * appointments ordered by date then time, optionally narrowed to a single
     * day. "Upcoming" is measured from today in the booking timezone, so a
     * booking earlier today still shows until the day rolls over.
     *
     * @return array{timezone:string,count:int,from:string,to:?string,bookings:array<int,array<string,mixed>>}
     */
    public static function listUpcomingBookings(int $days = 14, ?string $date = null): array
    {
        $cfg = self::config();
        $tz = $cfg['timezone'];
        try {
            $zone = new \DateTimeZone($tz);
        } catch (\Exception) {
            $zone = new \DateTimeZone('UTC');
            $tz = 'UTC';
        }
        $today = (new \DateTime('now', $zone))->format('Y-m-d');
        $cols = 'client_name, client_email, client_phone, appointment_date, appointment_time, '
            . 'duration_minutes, topic, status';

        $pdo = Database::get();
        if ($date !== null && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            $stmt = $pdo->prepare(
                "SELECT $cols FROM appointments
                 WHERE appointment_date = ? AND status != 'cancelled'
                 ORDER BY appointment_time"
            );
            $stmt->execute([$date]);
            $to = $date;
        } else {
            $days = max(1, min(90, $days));
            $to = (new \DateTime($today, $zone))->modify('+' . $days . ' days')->format('Y-m-d');
            $stmt = $pdo->prepare(
                "SELECT $cols FROM appointments
                 WHERE appointment_date >= ? AND appointment_date <= ? AND status != 'cancelled'
                 ORDER BY appointment_date, appointment_time"
            );
            $stmt->execute([$today, $to]);
        }

        $bookings = $stmt->fetchAll() ?: [];
        return [
            'timezone' => $tz,
            'count' => count($bookings),
            'from' => $date ?? $today,
            'to' => $to,
            'bookings' => $bookings,
        ];
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
        if (self::intakeClosed()) {
            return ['success' => false, 'error' => self::intakeClosedMessage()];
        }

        $name = trim((string) ($data['name'] ?? ''));
        $email = trim((string) ($data['email'] ?? ''));
        $phone = trim((string) ($data['phone'] ?? ''));
        $date = trim((string) ($data['date'] ?? ''));
        $time = trim((string) ($data['time'] ?? ''));
        $topic = trim((string) ($data['topic'] ?? ''));

        $phoneError = self::phoneValidationError($phone);
        if ($phoneError !== null) {
            return ['success' => false, 'error' => $phoneError];
        }
        $phone = self::normalizePhone($phone);

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
            LeadAttribution::capture($pdo, 'booking', $appointmentId, $data['attribution'] ?? null);

            Automations::fire('appointment_booked', (string) $email, [
                'name' => $name ?: null,
                'last_action' => 'Booked a call for ' . $date . ' at ' . $time,
            ], $pdo);
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

        $notifyEmail = Settings::get('notification_email') ?: 'hello@princecaleb.dev';
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

        $calendarEventId = self::sendComposioBookingActions([
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
        if ($calendarEventId !== null) {
            $pdo->prepare('UPDATE appointments SET calendar_event_id = ? WHERE id = ?')
                ->execute([$calendarEventId, $appointmentId]);
        }

        return ['success' => true, 'date' => $date, 'time' => $time, 'timezone' => $cfg['timezone'], 'appointment_id' => $appointmentId];
    }

    /** Update one confirmed booking instead of creating a second appointment. */
    public static function rescheduleBooking(array $data): array
    {
        $cfg = self::config();
        $email = trim((string) ($data['email'] ?? ''));
        $phone = trim((string) ($data['phone'] ?? ''));
        $oldDate = trim((string) ($data['old_date'] ?? ''));
        $oldTime = trim((string) ($data['old_time'] ?? ''));
        $newDate = trim((string) ($data['new_date'] ?? ''));
        $newTime = trim((string) ($data['new_time'] ?? ''));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['success' => false, 'error' => 'A valid booking email is required to identify the existing appointment.'];
        }
        $phoneError = self::phoneValidationError($phone);
        if ($phone === '' || $phoneError !== null) {
            return ['success' => false, 'error' => $phoneError ?: 'The booking phone number is required to verify the existing appointment.'];
        }
        $phone = self::normalizePhone($phone);
        foreach ([$oldDate, $newDate] as $date) {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                return ['success' => false, 'error' => 'Both dates must use YYYY-MM-DD.'];
            }
        }
        foreach ([$oldTime, $newTime] as $time) {
            if (!preg_match('/^\d{2}:\d{2}$/', $time)) {
                return ['success' => false, 'error' => 'Both times must use HH:MM.'];
            }
        }

        $pdo = Database::get();
        $find = $pdo->prepare(
            "SELECT * FROM appointments
             WHERE lower(client_email) = lower(?) AND appointment_date = ? AND appointment_time = ?
               AND status = 'confirmed' LIMIT 1"
        );
        $find->execute([$email, $oldDate, $oldTime]);
        $appointment = $find->fetch(\PDO::FETCH_ASSOC);
        if (!$appointment) {
            return ['success' => false, 'error' => 'No confirmed booking matches that email, original date, and original time. Reconfirm the original details; do not create a new booking.'];
        }
        $storedPhone = self::normalizePhone((string) ($appointment['client_phone'] ?? ''));
        if ($storedPhone !== '' && $storedPhone !== $phone) {
            return ['success' => false, 'error' => 'The phone number does not match the existing booking. Reconfirm it before trying again.'];
        }
        if ($oldDate === $newDate && $oldTime === $newTime) {
            return [
                'success' => true, 'date' => $newDate, 'time' => $newTime,
                'timezone' => $cfg['timezone'], 'appointment_id' => (int) $appointment['id'],
                'calendar_synced' => true,
            ];
        }

        $target = $pdo->prepare(
            "SELECT * FROM appointments
             WHERE appointment_date = ? AND appointment_time = ? AND status != 'cancelled' LIMIT 1"
        );
        $target->execute([$newDate, $newTime]);
        $existingTarget = $target->fetch(\PDO::FETCH_ASSOC);
        if ($existingTarget) {
            if (strcasecmp((string) $existingTarget['client_email'], $email) !== 0) {
                return [
                    'success' => false,
                    'error' => 'The requested replacement slot is no longer available.',
                    'available_slots' => self::getAvailableSlots($newDate)['slots'] ?? [],
                ];
            }

            // Repair a duplicate made by the former booking-only flow: keep
            // the newer target appointment and cancel the old one.
            $pdo->prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?")
                ->execute([(int) $appointment['id']]);
            return [
                'success' => true, 'date' => $newDate, 'time' => $newTime,
                'timezone' => $cfg['timezone'], 'appointment_id' => (int) $existingTarget['id'],
                'calendar_synced' => !empty($existingTarget['calendar_event_id']),
                'duplicate_merged' => true,
            ];
        }

        if (!in_array($newTime, self::possibleSlots($newDate, $cfg), true)) {
            return [
                'success' => false,
                'error' => 'The requested replacement slot is not available.',
                'available_slots' => self::getAvailableSlots($newDate)['slots'] ?? [],
            ];
        }

        try {
            $pdo->prepare(
                "UPDATE appointments
                 SET appointment_date = ?, appointment_time = ?, reminder_sent = 0, admin_seen = 0
                 WHERE id = ?"
            )->execute([$newDate, $newTime, (int) $appointment['id']]);
        } catch (\PDOException) {
            return ['success' => false, 'error' => 'The requested replacement slot was just taken. Please choose another time.'];
        }

        $booking = [
            'id' => (int) $appointment['id'],
            'name' => (string) $appointment['client_name'],
            'email' => (string) $appointment['client_email'],
            'phone' => (string) ($appointment['client_phone'] ?? ''),
            'date' => $newDate,
            'time' => $newTime,
            'duration_minutes' => (int) $appointment['duration_minutes'],
            'timezone' => $cfg['timezone'],
            'topic' => (string) ($appointment['topic'] ?? ''),
        ];
        $calendarSynced = self::rescheduleCalendarEvent($booking, (string) ($appointment['calendar_event_id'] ?? ''));
        self::sendRescheduleNotifications($booking, $oldDate, $oldTime);

        return [
            'success' => true, 'date' => $newDate, 'time' => $newTime,
            'timezone' => $cfg['timezone'], 'appointment_id' => (int) $appointment['id'],
            'calendar_synced' => $calendarSynced,
        ];
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
    /** Validate Ghana local/international numbers and require country codes elsewhere. */
    private static function phoneValidationError(string $phone): ?string
    {
        if ($phone === '') {
            // The public booking form still permits an intentionally omitted
            // phone. Lisa's tool schema requires one before she can submit.
            return null;
        }

        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (str_starts_with(trim($phone), '00')) {
            return strlen($digits) >= 10 && strlen($digits) <= 17
                ? null
                : 'That international phone number has an invalid length. Ask the visitor to repeat the full number including country code.';
        }
        if (str_starts_with($digits, '233')) {
            return strlen($digits) === 12
                ? null
                : 'That Ghana international number is incomplete. It must contain 233 followed by exactly 9 digits. Ask the visitor to repeat the full number.';
        }
        if (str_starts_with($digits, '0')) {
            return strlen($digits) === 10
                ? null
                : 'That Ghana local number is incomplete. It must contain exactly 10 digits beginning with 0. Ask the visitor to repeat the full number.';
        }

        $hasInternationalPrefix = str_starts_with(trim($phone), '+');
        if (!$hasInternationalPrefix) {
            return 'That phone number is ambiguous. Ask the visitor for the full international number including country code.';
        }
        if (strlen($digits) < 8 || strlen($digits) > 15) {
            return 'That international phone number has an invalid length. Ask the visitor to repeat the full number including country code.';
        }

        return null;
    }

    /** Store every supplied number in a consistent international form. */
    private static function normalizePhone(string $phone): string
    {
        if ($phone === '') {
            return '';
        }

        $trimmed = trim($phone);
        $digits = preg_replace('/\D+/', '', $trimmed) ?? '';
        if (str_starts_with($trimmed, '00')) {
            return '+' . substr($digits, 2);
        }
        if (str_starts_with($digits, '233')) {
            return '+' . $digits;
        }
        if (str_starts_with($digits, '0') && strlen($digits) === 10) {
            return '+233' . substr($digits, 1);
        }

        return '+' . $digits;
    }

    private static function looksLikePlaceholder(string $value): bool
    {
        $normalized = strtolower(trim($value));
        if (filter_var($normalized, FILTER_VALIDATE_EMAIL)) {
            $domain = strtolower((string) substr(strrchr($normalized, '@') ?: '', 1));
            if (in_array($domain, ['example.com', 'example.org', 'example.net'], true)) {
                return true;
            }
        }
        return in_array($normalized, [
            'your name', 'your email', 'your@email.com', 'name here', 'email here',
            'example@example.com', 'test@example.com', 'test@test.com', 'n/a', 'na',
            'none', 'unknown', 'visitor', 'client name', 'customer name', 'full name',
        ], true);
    }

    private static function sendRescheduleNotifications(array $booking, string $oldDate, string $oldTime): void
    {
        $vars = self::bookingTemplateVars($booking);
        $clientMessage = EmailTemplate::render(
            'booking_client_confirmation',
            $vars,
            EmailTemplate::defaults()['booking_client_confirmation']
        );
        Mailer::sendHtml(
            (string) $booking['email'],
            'Booking rescheduled: ' . $booking['date'] . ' at ' . $booking['time'],
            $clientMessage['html'],
            $clientMessage['text']
        );

        $notifyEmail = Settings::get('notification_email') ?: 'hello@princecaleb.dev';
        if ($notifyEmail !== '') {
            $ownerMessage = EmailTemplate::render(
                'booking_internal_notification',
                $vars,
                EmailTemplate::defaults()['booking_internal_notification']
            );
            $context = "Rescheduled from {$oldDate} at {$oldTime}.\n\n";
            Mailer::sendHtml(
                $notifyEmail,
                'Booking rescheduled: ' . $booking['name'],
                $ownerMessage['html'],
                $context . $ownerMessage['text'],
                (string) $booking['email']
            );
        }

        self::executeBookingAction('slack', [
            'channel' => Settings::get('composio_slack_channel') ?: null,
            'text' => "Booking rescheduled from {$oldDate} {$oldTime} to {$booking['date']} {$booking['time']}.\n\n"
                . self::bookingMessage($booking),
        ], 'SLACK_SEND_MESSAGE');
    }

    private static function rescheduleCalendarEvent(array $booking, string $eventId): bool
    {
        $accountId = trim((string) Settings::get('composio_google_calendar_account_id'));
        if ($eventId === '' || $accountId === '' || empty(Settings::get('composio_api_key'))) {
            return false;
        }

        $start = self::bookingDateTime($booking['date'], $booking['time'], $booking['timezone']);
        $end = $start ? (clone $start)->modify('+' . (int) $booking['duration_minutes'] . ' minutes') : null;
        $calendarId = Settings::get('composio_google_calendar_id') ?: 'primary';
        $startIso = $start ? $start->format(\DateTimeInterface::ATOM) : "{$booking['date']}T{$booking['time']}:00";
        $endIso = $end ? $end->format(\DateTimeInterface::ATOM) : null;
        $payloads = [
            [
                'calendar_id' => $calendarId, 'event_id' => $eventId,
                'start_datetime' => $startIso, 'end_datetime' => $endIso,
                'timezone' => $booking['timezone'],
            ],
            [
                'calendar_id' => $calendarId, 'event_id' => $eventId,
                'start' => $startIso, 'end' => $endIso, 'timezone' => $booking['timezone'],
            ],
        ];
        foreach ($payloads as $payload) {
            $payload = array_filter($payload, static fn ($value) => $value !== null && $value !== '');
            if (Composio::executeTool('GOOGLECALENDAR_UPDATE_EVENT', $accountId, $payload) !== null) {
                Settings::set('composio_google_calendar_last_error', '');
                return true;
            }
        }

        $error = Composio::lastError() ?: 'Calendar event update was not confirmed.';
        Settings::set('composio_google_calendar_last_error', date('c') . ' - reschedule: ' . $error);
        error_log('Composio calendar reschedule failed: ' . $error);
        return false;
    }

    /** Best-effort Composio fan-out after a confirmed booking. Booking itself never depends on these calls. */
    private static function sendComposioBookingActions(array $booking): ?string
    {
        if (empty(Settings::get('composio_api_key'))) {
            return null;
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
        $calendarResult = self::executeBookingAction('google_calendar', [
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

        // The normal booking notification above already emails notification_email
        // with the client set as Reply-To. Composio used to fall back to that same
        // address and send an indistinguishable second copy without Reply-To.
        // Keep Gmail fan-out only for an explicitly configured, different inbox.
        $gmailTo = trim((string) Settings::get('composio_gmail_booking_to'));
        $notificationEmail = trim((string) (Settings::get('notification_email') ?: 'hello@princecaleb.dev'));
        if ($gmailTo !== '' && strcasecmp($gmailTo, $notificationEmail) !== 0) {
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

        return self::calendarEventId($calendarResult);
    }

    private static function executeBookingAction(string $toolkit, array $payloads, string $defaultTool): ?array
    {
        $accountId = Settings::get("composio_{$toolkit}_account_id");
        $tool = Settings::get("composio_{$toolkit}_booking_tool") ?: $defaultTool;
        if (empty($accountId) || empty($tool)) {
            return null;
        }

        $variants = self::isList($payloads) ? $payloads : [$payloads];
        foreach ($variants as $payload) {
            $payload = array_filter($payload, fn($value) => $value !== null && $value !== '' && $value !== []);
            $result = Composio::executeTool($tool, $accountId, $payload);
            if ($result !== null) {
                Settings::set("composio_{$toolkit}_last_error", '');
                return $result;
            }
        }

        $lastError = Composio::lastError() ?: 'No detailed Composio error was returned.';
        Settings::set(
            "composio_{$toolkit}_last_error",
            date('c') . " - {$toolkit} booking action failed using {$tool}: " . $lastError
        );
        error_log("Composio booking action failed for {$toolkit} using {$tool}: {$lastError}");
        return null;
    }

    private static function calendarEventId(?array $result): ?string
    {
        if ($result === null) {
            return null;
        }
        $candidates = [
            $result['data']['id'] ?? null,
            $result['data']['event']['id'] ?? null,
            $result['response_data']['id'] ?? null,
            $result['event']['id'] ?? null,
            $result['event_id'] ?? null,
        ];
        foreach ($candidates as $candidate) {
            if (is_scalar($candidate) && trim((string) $candidate) !== '') {
                return trim((string) $candidate);
            }
        }
        return null;
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
        $pdo = Database::get();
        $pdo->prepare('UPDATE appointments SET status = ? WHERE id = ?')
            ->execute([$status, (int) $params['id']]);

        // A completed booking is the app's clearest "engagement wrapped" signal
        // for a solo studio — the natural moment to fire a review-request /
        // next-steps sequence. Re-marking completed is harmless: fire() ignores
        // an already-existing enrollment.
        if ($status === 'completed') {
            $appt = $pdo->prepare('SELECT client_email, client_name FROM appointments WHERE id = ?');
            $appt->execute([(int) $params['id']]);
            if ($row = $appt->fetch()) {
                Automations::fire('project_completed', (string) $row['client_email'], [
                    'name' => $row['client_name'] ?: null,
                    'last_action' => 'Completed a booked session',
                ], $pdo);
            }
        }

        Response::json(['status' => 'updated']);
    }

    /** DELETE /api/v1/admin/appointments/{id} */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT client_name FROM appointments WHERE id = ?');
        $stmt->execute([$id]);
        $name = $stmt->fetchColumn();
        if ($name === false) {
            Response::error('Booking not found.', 404);
        }

        $pdo->prepare('DELETE FROM appointments WHERE id = ?')->execute([$id]);
        ActivityLog::log($user, 'deleted', 'appointment', $id, $name ?: null);
        Response::json(['status' => 'deleted']);
    }
}
