<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppOwnerAlertTemplateManager;

/**
 * Admin endpoints for the owner-alert WhatsApp template: create it on
 * Twilio, submit it to Meta, and check where approval got to. Mirrors
 * WhatsAppDripFollowupTemplateController.
 */
final class WhatsAppOwnerAlertTemplateController
{
    /** GET /api/v1/admin/whatsapp-template/owner-alert */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppOwnerAlertTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template/owner-alert */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppOwnerAlertTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/owner-alert/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppOwnerAlertTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
