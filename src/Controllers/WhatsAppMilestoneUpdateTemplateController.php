<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppMilestoneUpdateTemplateManager;

/**
 * Admin endpoints for the milestone-update WhatsApp template — create it on
 * Twilio, submit it to Meta for approval, and check where that approval
 * got to. Mirrors WhatsAppAssetRequestTemplateController.
 */
final class WhatsAppMilestoneUpdateTemplateController
{
    /** GET /api/v1/admin/whatsapp-template/milestone-update */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppMilestoneUpdateTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template/milestone-update */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppMilestoneUpdateTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/milestone-update/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppMilestoneUpdateTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
