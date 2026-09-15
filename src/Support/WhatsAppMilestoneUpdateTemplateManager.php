<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Template for telling a client a project milestone is done, when they
 * haven't written in to Lisa's connected number before.
 *
 * Shares its Twilio Content API plumbing with the other template managers
 * via WhatsAppContentTemplateManager.
 */
final class WhatsAppMilestoneUpdateTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'milestone_update';
    protected const LANGUAGE = 'en';

    /** A status update on an existing project, not a promotion, so UTILITY. */
    protected const CATEGORY = 'UTILITY';

    /**
     * {{1}} contact's name, {{2}} the project, {{3}} the milestone — all
     * filled in by LiveChatController::sendMilestoneUpdate().
     */
    protected const BODY = "Hi {{1}}, this is Lisa, Prince Caleb's assistant. "
        . "Quick update on your {{2}} project — {{3}} is now complete. Let us know if you'd like any changes!";

    protected const SAMPLE_VARIABLES = ['1' => 'Ama', '2' => 'website', '3' => 'the homepage design'];
    protected const SID_SETTING = 'twilio_milestone_update_content_sid';
    protected const STATUS_SETTING = 'twilio_milestone_update_template_status';
}
