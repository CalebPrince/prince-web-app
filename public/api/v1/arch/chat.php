<?php

declare(strict_types=1);

/**
 * POST /api/v1/arch/chat.php
 *
 * Chat endpoint for the "Arch" website-builder agent. Kept as a standalone file
 * (served directly by Apache — see public/.htaccess, which only rewrites /api/*
 * to index.php for paths that don't exist on disk) so Arch's two endpoints live
 * under the exact /api/v1/arch/ path the feature was scoped to, while all the
 * actual logic stays in App\Agents\Arch.
 */

require dirname(__DIR__, 4) . '/src/autoload.php';

use App\Agents\Arch;
use App\Support\Response;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    Response::error('Method not allowed.', 405);
}

Arch::chat();
