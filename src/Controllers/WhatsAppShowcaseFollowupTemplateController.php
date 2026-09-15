<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppShowcaseFollowupTemplateManager;

/**
 * Admin endpoints for the showcase-follow-up WhatsApp template — create it
 * on Twilio, submit it to Meta for approval, and check where that approval
 * got to. Mirrors WhatsAppAssetRequestTemplateController.
 */
final class WhatsAppShowcaseFollowupTemplateController
{
    /** GET /api/v1/admin/whatsapp-template/showcase-followup */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppShowcaseFollowupTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template/showcase-followup */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppShowcaseFollowupTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/showcase-followup/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppShowcaseFollowupTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
