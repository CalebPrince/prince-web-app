<?php

declare(strict_types=1);

require dirname(__DIR__, 4) . '/src/autoload.php';

use App\Agents\Arch;
use App\Support\Response;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    Response::error('Method not allowed.', 405);
}

Arch::revise();
