<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Template for checking in with a client who was already sent a demo
 * showcase link (their new website plus social pages) but hasn't replied,
 * when they haven't written in to Lisa's connected number before. Just a
 * "did you get a chance to look, any questions?" nudge — no per-send text,
 * so the only placeholder is the contact's name.
 *
 * Shares its Twilio Content API plumbing with WhatsAppTemplateManager /
 * WhatsAppAssetRequestTemplateManager via WhatsAppContentTemplateManager.
 */
final class WhatsAppShowcaseFollowupTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'showcase_followup';
    protected const LANGUAGE = 'en';

    /**
     * Checking in on work already discussed, not promoting anything, so this
     * is UTILITY rather than MARKETING — same reasoning as the asset-request
     * template.
     */
    protected const CATEGORY = 'UTILITY';

    /** {{1}} is the contact's name, filled in by LiveChatController::sendShowcaseFollowup(). */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "Just checking in — have you had a chance to look over the website and "
        . "social media pages Caleb sent you? Happy to answer any questions you have!";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama'];
    protected const SID_SETTING = 'twilio_showcase_followup_content_sid';
    protected const STATUS_SETTING = 'twilio_showcase_followup_template_status';
}
