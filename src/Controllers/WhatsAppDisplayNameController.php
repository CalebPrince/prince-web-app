<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\WhatsAppDisplayNameManager;

/**
 * Admin endpoints for the WhatsApp sender's display name: read what clients
 * see plus any change Meta is reviewing, and submit a new name for review.
 */
final class WhatsAppDisplayNameController
{
    /** GET /api/v1/admin/whatsapp-display-name */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppDisplayNameManager::status());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/v1/admin/whatsapp-display-name  {name} */
    public static function submit(): void
    {
        AuthMiddleware::requireAuth();
        $input = json_decode((string) file_get_contents('php://input'), true);
        try {
            Response::json(WhatsAppDisplayNameManager::submit((string) ($input['name'] ?? '')));
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
