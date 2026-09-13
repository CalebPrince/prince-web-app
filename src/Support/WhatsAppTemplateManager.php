<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Lisa's WhatsApp intro template, built on Twilio's Content API and tracked
 * through to Meta's approval, so the template never has to be hand-built in
 * the Console. This is a narrowed revival of the manager deleted in the
 * 2026-08-10 Twilio removal — that one owned the post-call summary template,
 * which has no equivalent any more; this one owns the intro template that
 * LiveChatController::sendIntro() sends.
 *
 * The Twilio Content API plumbing (create, submit, poll) lives in
 * WhatsAppContentTemplateManager, shared with
 * WhatsAppAssetRequestTemplateManager.
 */
final class WhatsAppTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'lisa_intro';
    protected const LANGUAGE = 'en';

    /**
     * Meta classifies first-contact outreach like this as MARKETING. Declaring
     * UTILITY to dodge that gets the template rejected or reclassified, so it
     * is declared honestly.
     */
    protected const CATEGORY = 'MARKETING';

    /** {{1}} is the contact's name — the one parameter sendIntro() fills in. */
    protected const BODY = "Hi {{1}}, this is Lisa — Prince Caleb's assistant. "
        . "You got in touch with Caleb recently, so I'm picking things up here on WhatsApp.\n\n"
        . "Reply to this message and I can answer questions about your project, "
        . "walk you through pricing, or get a call booked in.";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama'];
    protected const SID_SETTING = 'twilio_intro_content_sid';
    protected const STATUS_SETTING = 'twilio_intro_template_status';
}
