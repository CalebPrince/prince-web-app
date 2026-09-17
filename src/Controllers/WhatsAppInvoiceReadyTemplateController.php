<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppInvoiceReadyTemplateManager;

/**
 * Admin endpoints for the invoice-ready WhatsApp template — create it on
 * Twilio, submit it to Meta for approval, and check where that approval
 * got to. Mirrors WhatsAppAssetRequestTemplateController.
 */
final class WhatsAppInvoiceReadyTemplateController
{
    /** GET /api/v1/admin/whatsapp-template/invoice-ready */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppInvoiceReadyTemplateManager::status());
    }

    /** POST /api/v1/admin/whatsapp-template/invoice-ready */
    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppInvoiceReadyTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-template/invoice-ready/refresh */
    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppInvoiceReadyTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** DELETE /api/v1/admin/whatsapp-template/invoice-ready */
    public static function destroy(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppInvoiceReadyTemplateManager::deleteAndReset());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
