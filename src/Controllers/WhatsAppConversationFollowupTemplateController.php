<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppConversationFollowupTemplateManager;

/**
 * Admin endpoints for the conversation follow-up WhatsApp template: create it
 * on Twilio, submit it to Meta for approval, and check where that approval got
 * to. Mirrors WhatsAppDripFollowupTemplateController.
 */
final class WhatsAppConversationFollowupTemplateController
{
    /** GET /api/v1/admin/whatsapp-template/conversation-followup */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppConversationFollowupTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template/conversation-followup */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppConversationFollowupTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/conversation-followup/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppConversationFollowupTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
