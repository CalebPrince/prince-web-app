<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppPaymentReceivedTemplateManager;

/**
 * Admin endpoints for the payment-received WhatsApp template — create it on
 * Twilio, submit it to Meta for approval, and check where that approval
 * got to. Mirrors WhatsAppAssetRequestTemplateController.
 */
final class WhatsAppPaymentReceivedTemplateController
{
    /** GET /api/v1/admin/whatsapp-template/payment-received */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppPaymentReceivedTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template/payment-received */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppPaymentReceivedTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/payment-received/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppPaymentReceivedTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
