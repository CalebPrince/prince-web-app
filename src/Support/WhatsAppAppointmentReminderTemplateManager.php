<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Template for reminding a client about an upcoming call/meeting, when they
 * haven't written in to Lisa's connected number before.
 *
 * Shares its Twilio Content API plumbing with the other template managers
 * via WhatsAppContentTemplateManager.
 */
final class WhatsAppAppointmentReminderTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'appointment_reminder';
    protected const LANGUAGE = 'en';

    /** A reminder about an already-booked appointment, not a promotion, so UTILITY. */
    protected const CATEGORY = 'UTILITY';

    /**
     * {{1}} contact's name, {{2}} the date, {{3}} the time — all filled in
     * by LiveChatController::sendAppointmentReminder().
     */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "Just a reminder — your call with Caleb is on {{2}} at {{3}}.";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama', '2' => 'Thursday', '3' => '3pm'];
    protected const SID_SETTING = 'twilio_appointment_reminder_content_sid';
    protected const STATUS_SETTING = 'twilio_appointment_reminder_template_status';
}
