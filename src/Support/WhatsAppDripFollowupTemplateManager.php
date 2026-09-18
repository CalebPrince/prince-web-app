<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Template for cold-lead outreach, sent by hand from Marketing Leads →
 * Templates (LiveChatController::sendDripFollowup()). Unlike the other
 * templates, this one is aimed at people who have never spoken to Lisa or
 * Caleb, so it states who's writing and why in the first line and gives an
 * easy way out.
 *
 * Shares its Twilio Content API plumbing with the other template managers
 * via WhatsAppContentTemplateManager. Deliberately not wired to the drip
 * cron: cold WhatsApp goes out one contact at a time, by a person.
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
     * {{1}} is the contact's name, filled in by
     * LiveChatController::sendDripFollowup(). Only the name is a variable on
     * purpose: free text (industry, research summary) reads badly dropped
     * into a fixed sentence.
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
