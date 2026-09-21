<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Template for asking a client for a review/testimonial after delivering
 * their project, when they haven't written in to Lisa's connected number
 * before.
 *
 * Shares its Twilio Content API plumbing with the other template managers
 * via WhatsAppContentTemplateManager.
 */
final class WhatsAppFeedbackRequestTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'feedback_request';
    protected const LANGUAGE = 'en';

    /** Following up on delivered work, not a promotion, so UTILITY. */
    protected const CATEGORY = 'UTILITY';

    /**
     * {{1}} contact's name, {{2}} what was delivered, filled in by
     * LiveChatController::sendFeedbackRequest(). No link in the body: Meta
     * rejected the earlier version that ended on a pasted URL variable, so
     * Lisa sends the review link once the contact replies (inside the 24h window).
     */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "Hope you're enjoying your new {{2}}! Would you mind leaving a quick review? Reply here and I'll send you the link.";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama', '2' => 'website'];
    protected const SID_SETTING = 'twilio_feedback_request_content_sid';
    protected const STATUS_SETTING = 'twilio_feedback_request_template_status';
}
