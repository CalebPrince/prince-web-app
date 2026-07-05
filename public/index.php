<?php

declare(strict_types=1);

// When running under `php -S` (dev server), let it serve real static files
// directly and only route through here for /api/* requests.
if (php_sapi_name() === 'cli-server') {
    $path = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

    if ($path === '/') {
        readfile(__DIR__ . '/index.html');
        return true;
    }
    if (file_exists(__DIR__ . $path) && !is_dir(__DIR__ . $path)) {
        return false;
    }
}

require dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\AiChatController;
use App\Controllers\AuthController;
use App\Controllers\DashboardController;
use App\Controllers\InquiryController;
use App\Controllers\ProjectController;
use App\Controllers\TagController;
use App\Router;

$router = new Router();

// Public
$router->get('/api/v1/projects', [ProjectController::class, 'index']);
$router->get('/api/v1/projects/{slug}', [ProjectController::class, 'show']);
$router->get('/api/v1/tags', [TagController::class, 'index']);
$router->post('/api/v1/inquiries', [InquiryController::class, 'create']);
$router->post('/api/v1/ai/chat', [AiChatController::class, 'chat']);

// Auth
$router->post('/api/v1/auth/login', [AuthController::class, 'login']);
$router->post('/api/v1/auth/refresh', [AuthController::class, 'refresh']);
$router->post('/api/v1/auth/logout', [AuthController::class, 'logout']);
$router->get('/api/v1/auth/me', [AuthController::class, 'me']);

// Admin
$router->get('/api/v1/admin/dashboard', [DashboardController::class, 'overview']);
$router->get('/api/v1/admin/projects', [ProjectController::class, 'adminIndex']);
$router->post('/api/v1/admin/projects', [ProjectController::class, 'store']);
$router->put('/api/v1/admin/projects/{id}', [ProjectController::class, 'update']);
$router->delete('/api/v1/admin/projects/{id}', [ProjectController::class, 'destroy']);
$router->get('/api/v1/admin/inquiries', [InquiryController::class, 'adminIndex']);
$router->patch('/api/v1/admin/inquiries/{id}', [InquiryController::class, 'updateStatus']);
$router->get('/api/v1/admin/tags', [TagController::class, 'adminIndex']);
$router->post('/api/v1/admin/tags', [TagController::class, 'store']);
$router->put('/api/v1/admin/tags/{id}', [TagController::class, 'update']);
$router->delete('/api/v1/admin/tags/{id}', [TagController::class, 'destroy']);
$router->patch('/api/v1/admin/account', [AuthController::class, 'updateAccount']);
$router->post('/api/v1/admin/account/password', [AuthController::class, 'changePassword']);

$router->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI']);
