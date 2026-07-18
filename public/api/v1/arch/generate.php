<?php

declare(strict_types=1);

/**
 * POST /api/v1/arch/generate.php
 *
 * Takes the completed brief gathered in the chat and builds the client's site on
 * disk under public/generated-sites/{slug}/, returning the preview and download
 * URLs (plus one-time CMS credentials when requested). Served directly by Apache;
 * see the note in chat.php. All logic lives in App\Agents\Arch::generate().
 */

require dirname(__DIR__, 4) . '/src/autoload.php';

use App\Agents\Arch;
use App\Support\Response;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    Response::error('Method not allowed.', 405);
}

Arch::generate();
