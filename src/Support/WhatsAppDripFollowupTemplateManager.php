<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Template for the WhatsApp steps of a drip automation (database/
 * send_drip_whatsapp.php). Unlike the other templates, this one is aimed at
 * people who have never spoken to Lisa or Caleb — cold leads — so it states
 * who's writing and why in the first line and gives an easy way out.
 *
 * Shares its Twilio Content API plumbing with the other template managers
 * via WhatsAppContentTemplateManager. There is no dedicated send endpoint:
 * the drip cron sends it, using the SID pasted into a step.
 */
final class WhatsAppDripFollowupTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'drip_followup';
    protected const LANGUAGE = 'en';

    /**
     * First contact with someone who hasn't asked to hear from us, offering a
     * service — promotional, so MARKETING (stricter Meta review than the
     * UTILITY templates, which all follow up on something already discussed).
     */
    protected const CATEGORY = 'MARKETING';

    /**
     * {{1}} is the contact's name, mapped from a step's whatsapp_variables
     * (e.g. {"1": "{{name}}"}). Only the name is a variable on purpose: the
     * other merge tokens (industry, research summary) are free text and read
     * badly dropped into a fixed sentence.
     *
     * Inbound WhatsApp replies aren't auto-parsed for STOP, so the opt-out is
     * worded as "just say so" — Lisa reads every reply.
     */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "Caleb builds websites and AI automations for local businesses, and he spotted "
        . "a couple of quick improvements for yours. Would you like me to send them over? "
        . "If it's not relevant, just say so and we won't follow up.";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama'];
    protected const SID_SETTING = 'twilio_drip_followup_content_sid';
    protected const STATUS_SETTING = 'twilio_drip_followup_template_status';
}
