<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppAppointmentReminderTemplateManager;

/**
 * Admin endpoints for the appointment-reminder WhatsApp template — create it
 * on Twilio, submit it to Meta for approval, and check where that approval
 * got to. Mirrors WhatsAppAssetRequestTemplateController.
 */
final class WhatsAppAppointmentReminderTemplateController
{
    /** GET /api/v1/admin/whatsapp-template/appointment-reminder */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppAppointmentReminderTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template/appointment-reminder */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppAppointmentReminderTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/appointment-reminder/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppAppointmentReminderTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** DELETE /api/v1/admin/whatsapp-template/appointment-reminder */
    public static function destroy(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppAppointmentReminderTemplateManager::deleteAndReset());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
