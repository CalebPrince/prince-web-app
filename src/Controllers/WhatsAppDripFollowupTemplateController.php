<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppDripFollowupTemplateManager;

/**
 * Admin endpoints for the drip follow-up WhatsApp template — create it on
 * Twilio, submit it to Meta for approval, and check where that approval got
 * to. Mirrors WhatsAppFeedbackRequestTemplateController.
 */
final class WhatsAppDripFollowupTemplateController
{
    /** GET /api/v1/admin/whatsapp-template/drip-followup */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppDripFollowupTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template/drip-followup */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppDripFollowupTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/drip-followup/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppDripFollowupTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
