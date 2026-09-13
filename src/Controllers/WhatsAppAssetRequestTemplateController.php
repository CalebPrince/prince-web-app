<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppAssetRequestTemplateManager;

/**
 * Admin endpoints for the client asset-request WhatsApp template — create it
 * on Twilio, submit it to Meta for approval, and check where that approval
 * got to. Mirrors WhatsAppTemplateController for Lisa's intro template.
 */
final class WhatsAppAssetRequestTemplateController
{
    /** GET /api/v1/admin/whatsapp-template/asset-request */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppAssetRequestTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template/asset-request */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppAssetRequestTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/asset-request/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppAssetRequestTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
