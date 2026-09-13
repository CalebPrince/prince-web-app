<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Template for asking an already-discussed client to send over project
 * assets (their logo, an Instagram link, etc.) over WhatsApp when they
 * haven't written in to Lisa's connected number before. Reusable across
 * clients: {{2}} is filled in per-send with whatever is actually being
 * asked for, so the same approved template covers any project's ask.
 *
 * Shares its Twilio Content API plumbing with WhatsAppTemplateManager via
 * WhatsAppContentTemplateManager.
 */
final class WhatsAppAssetRequestTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'asset_request';
    protected const LANGUAGE = 'en';

    /**
     * This follows up on a project the client already agreed to, asking for
     * something needed to do the work, not promoting anything, so it is
     * declared UTILITY rather than MARKETING.
     */
    protected const CATEGORY = 'UTILITY';

    /**
     * {{1}} is the contact's name, {{2}} is what to send (e.g. "your logo and
     * Instagram profile link") — both filled in by
     * LiveChatController::sendAssetRequest().
     */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "Following up on your website project with Caleb, could you send over "
        . "{{2}} so we can get started on the design?";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama', '2' => 'your logo and Instagram profile link'];
    protected const SID_SETTING = 'twilio_asset_request_content_sid';
    protected const STATUS_SETTING = 'twilio_asset_request_template_status';
}
