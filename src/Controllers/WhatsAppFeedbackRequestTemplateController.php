<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppFeedbackRequestTemplateManager;

/**
 * Admin endpoints for the feedback-request WhatsApp template — create it on
 * Twilio, submit it to Meta for approval, and check where that approval got
 * to. Mirrors WhatsAppAssetRequestTemplateController.
 */
final class WhatsAppFeedbackRequestTemplateController
{
    /** GET /api/v1/admin/whatsapp-template/feedback-request */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppFeedbackRequestTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template/feedback-request */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppFeedbackRequestTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/feedback-request/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppFeedbackRequestTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** DELETE /api/v1/admin/whatsapp-template/feedback-request */
    public static function destroy(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppFeedbackRequestTemplateManager::deleteAndReset());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
