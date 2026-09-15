<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Template for reminding a client their plan/subscription is renewing soon,
 * when they haven't written in to Lisa's connected number before.
 *
 * Shares its Twilio Content API plumbing with the other template managers
 * via WhatsAppContentTemplateManager.
 */
final class WhatsAppRenewalReminderTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'renewal_reminder';
    protected const LANGUAGE = 'en';

    /** A notice about an existing subscription, not a promotion, so UTILITY. */
    protected const CATEGORY = 'UTILITY';

    /**
     * {{1}} contact's name, {{2}} the plan, {{3}} the renewal date — all
     * filled in by LiveChatController::sendRenewalReminder().
     */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "Your {{2}} plan renews on {{3}}. Let us know if you have any questions.";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama', '2' => 'website hosting', '3' => 'October 1st'];
    protected const SID_SETTING = 'twilio_renewal_reminder_content_sid';
    protected const STATUS_SETTING = 'twilio_renewal_reminder_template_status';
}
