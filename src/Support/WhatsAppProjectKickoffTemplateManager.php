<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Generic "ready to start, send me what I need" template for an
 * already-discussed client, when they haven't written in to Lisa's
 * connected number before. Unlike WhatsAppAssetRequestTemplateManager
 * (which is worded specifically for a website project's design work), this
 * one avoids naming any particular service so it covers a website, a
 * WhatsApp agent, an automation build, or anything else the business sells.
 *
 * Shares its Twilio Content API plumbing with the other template managers
 * via WhatsAppContentTemplateManager.
 */
final class WhatsAppProjectKickoffTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'project_kickoff';
    protected const LANGUAGE = 'en';

    /** Following up on a project the client already agreed to, not a promotion, so UTILITY. */
    protected const CATEGORY = 'UTILITY';

    /**
     * {{1}} contact's name, {{2}} what to send to get started — both filled
     * in by LiveChatController::sendProjectKickoff().
     */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "Following up on your project with Caleb — could you send over {{2}} so we can get started?";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama', '2' => 'your business details and a product list'];
    protected const SID_SETTING = 'twilio_project_kickoff_content_sid';
    protected const STATUS_SETTING = 'twilio_project_kickoff_template_status';
}
