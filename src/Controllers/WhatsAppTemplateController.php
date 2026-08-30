<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppTemplateManager;

/**
 * Admin endpoints for Lisa's WhatsApp intro template — create it on Twilio,
 * submit it to Meta for approval, and check where that approval got to. The
 * manager throws on every failure path, so each action shares the same
 * translate-to-422 shape.
 */
final class WhatsAppTemplateController
{
    /** GET /api/v1/admin/whatsapp-template */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
