<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Template for telling a client something is ready for their review (a
 * design, a build, a draft), when they haven't written in to Lisa's
 * connected number before.
 *
 * Shares its Twilio Content API plumbing with the other template managers
 * via WhatsAppContentTemplateManager.
 */
final class WhatsAppDeliveryReadyTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'delivery_ready';
    protected const LANGUAGE = 'en';

    /** A status update on an existing project, not a promotion, so UTILITY. */
    protected const CATEGORY = 'UTILITY';

    /**
     * {{1}} contact's name, {{2}} what's ready, filled in by
     * LiveChatController::sendDeliveryReady(). No link in the body: Meta
     * rejected the earlier version that ended on a pasted URL variable, so
     * Lisa sends the link once the contact replies (inside the 24h window).
     */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "Your {{2}} is ready for you to review. Reply here and I'll send it over right away.";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama', '2' => 'website draft'];
    protected const SID_SETTING = 'twilio_delivery_ready_content_sid';
    protected const STATUS_SETTING = 'twilio_delivery_ready_template_status';
}
