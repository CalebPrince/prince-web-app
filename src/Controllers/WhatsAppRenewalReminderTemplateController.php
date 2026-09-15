<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppRenewalReminderTemplateManager;

/**
 * Admin endpoints for the renewal-reminder WhatsApp template — create it on
 * Twilio, submit it to Meta for approval, and check where that approval
 * got to. Mirrors WhatsAppAssetRequestTemplateController.
 */
final class WhatsAppRenewalReminderTemplateController
{
    /** GET /api/v1/admin/whatsapp-template/renewal-reminder */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppRenewalReminderTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template/renewal-reminder */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppRenewalReminderTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/renewal-reminder/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppRenewalReminderTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
