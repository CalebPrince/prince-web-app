<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Template for picking a conversation back up after the WhatsApp 24 hour
 * customer-service window has closed. Unlike the other follow-up templates it
 * is not tied to a showcase, an asset request or cold outreach: it is for
 * someone who wrote to Lisa, went quiet, and can now only be reached with an
 * approved template. Sent by LisaFollowups (the cold-conversation engine) or by
 * hand (LiveChatController::sendConversationFollowup()).
 *
 * MARKETING rather than UTILITY: a general "still need help?" nudge is not
 * about a specific transaction, so Meta is likely to classify it that way
 * whatever is submitted, and stating it honestly avoids a reclassification.
 * It costs more per message than UTILITY, which is one reason the engine caps
 * how many of these a contact can receive.
 *
 * Shares its Twilio Content API plumbing with the other template managers via
 * WhatsAppContentTemplateManager.
 */
final class WhatsAppConversationFollowupTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'conversation_followup';
    protected const LANGUAGE = 'en';
    protected const CATEGORY = 'MARKETING';

    /**
     * {{1}} is the contact's name. Only the name is a variable on purpose: any
     * free text would read badly dropped into a fixed sentence. The opt-out is
     * worded as "just say so" because inbound replies are read by Lisa, and
     * LisaJudgment records an opt-out from any reply that says it.
     */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "We were chatting a little while ago and I wanted to check whether you still need any help. "
        . "Just reply here whenever you're ready and I'll pick up where we left off. "
        . "If you'd rather not hear from us, just say so and we won't message you again.";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama'];
    protected const SID_SETTING = 'twilio_conversation_followup_content_sid';
    protected const STATUS_SETTING = 'twilio_conversation_followup_template_status';
}
