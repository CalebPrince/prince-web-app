<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppProjectKickoffTemplateManager;

/**
 * Admin endpoints for the project-kickoff WhatsApp template — create it on
 * Twilio, submit it to Meta for approval, and check where that approval got
 * to. Mirrors WhatsAppAssetRequestTemplateController.
 */
final class WhatsAppProjectKickoffTemplateController
{
    /** GET /api/v1/admin/whatsapp-template/project-kickoff */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppProjectKickoffTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template/project-kickoff */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppProjectKickoffTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/project-kickoff/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppProjectKickoffTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
