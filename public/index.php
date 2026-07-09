<?php

declare(strict_types=1);

// Maintenance mode: mirrors the .htaccess-level enforcement (which is what
// actually protects static pages in production, since those bypass PHP
// entirely) so the same behavior can be tested under `php -S` locally.
$__requestPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$__maintenanceExempt = ['/admin', '/api', '/uploads', '/css', '/js', '/icons', '/manifest.json', '/sw.js', '/maintenance.html'];
$__isExempt = false;
foreach ($__maintenanceExempt as $__prefix) {
    if (str_starts_with($__requestPath, $__prefix)) {
        $__isExempt = true;
        break;
    }
}
if (!$__isExempt && is_file(__DIR__ . '/.maintenance')) {
    http_response_code(503);
    header('Retry-After: 3600');
    readfile(__DIR__ . '/maintenance.html');
    exit;
}

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

use App\Controllers\ActivityLogController;
use App\Controllers\AiChatController;
use App\Controllers\AnalyticsController;
use App\Controllers\AppointmentController;
use App\Controllers\AuthController;
use App\Controllers\BlogController;
use App\Controllers\ClientAuthController;
use App\Controllers\ClientController;
use App\Controllers\ClientPortalController;
use App\Controllers\ComposioController;
use App\Controllers\DashboardController;
use App\Controllers\ErrorLogController;
use App\Controllers\InquiryController;
use App\Controllers\IntegrationController;
use App\Controllers\LiveChatController;
use App\Controllers\MarketingLeadController;
use App\Controllers\NewsletterController;
use App\Controllers\PaymentController;
use App\Controllers\ProposalController;
use App\Controllers\ProjectController;
use App\Controllers\ProjectRequestController;
use App\Controllers\SearchController;
use App\Controllers\SettingsController;
use App\Controllers\ShortLinkController;
use App\Controllers\SocialDraftController;
use App\Controllers\TagController;
use App\Controllers\TestimonialController;
use App\Controllers\UploadController;
use App\Router;

$router = new Router();

// Public
$router->get('/s/{code}', [ShortLinkController::class, 'redirect']);
$router->get('/api/v1/projects', [ProjectController::class, 'index']);
$router->get('/api/v1/projects/{slug}', [ProjectController::class, 'show']);
$router->get('/api/v1/tags', [TagController::class, 'index']);
$router->get('/api/v1/content', [SettingsController::class, 'publicContent']);
$router->get('/api/v1/blog', [BlogController::class, 'index']);
$router->get('/api/v1/blog/{slug}', [BlogController::class, 'show']);
$router->post('/api/v1/inquiries', [InquiryController::class, 'create']);
$router->post('/api/v1/project-requests', [ProjectRequestController::class, 'create']);
$router->get('/api/v1/payments/config', [PaymentController::class, 'config']);
$router->get('/api/v1/payments/link/{token}', [PaymentController::class, 'showLink']);
$router->post('/api/v1/payments/prepare', [PaymentController::class, 'prepare']);
$router->post('/api/v1/payments/verify', [PaymentController::class, 'verify']);
$router->post('/api/v1/payments/webhook', [PaymentController::class, 'webhook']);
$router->get('/api/v1/proposals/{token}', [ProposalController::class, 'show']);
$router->post('/api/v1/proposals/{token}/accept', [ProposalController::class, 'accept']);
$router->post('/api/v1/client/auth/login', [ClientAuthController::class, 'login']);
$router->post('/api/v1/client/auth/refresh', [ClientAuthController::class, 'refresh']);
$router->post('/api/v1/client/auth/logout', [ClientAuthController::class, 'logout']);
$router->post('/api/v1/client/auth/setup-password', [ClientAuthController::class, 'setupPassword']);
$router->post('/api/v1/client/auth/forgot-password', [ClientAuthController::class, 'forgotPassword']);
$router->post('/api/v1/client/auth/reset-password', [ClientAuthController::class, 'resetPassword']);
$router->get('/api/v1/client/me', [ClientAuthController::class, 'me']);
$router->get('/api/v1/client/dashboard', [ClientPortalController::class, 'dashboard']);
$router->get('/api/v1/client/files', [ClientPortalController::class, 'listFiles']);
$router->post('/api/v1/client/files', [ClientPortalController::class, 'uploadFile']);
$router->get('/api/v1/client/messages', [ClientPortalController::class, 'listMessages']);
$router->post('/api/v1/client/messages', [ClientPortalController::class, 'sendMessage']);
$router->post('/api/v1/newsletter/subscribe', [NewsletterController::class, 'subscribe']);
$router->get('/api/v1/newsletter/unsubscribe', [NewsletterController::class, 'unsubscribe']);
$router->post('/api/v1/analytics/track', [AnalyticsController::class, 'track']);
$router->get('/api/v1/appointments/config', [AppointmentController::class, 'publicConfig']);
$router->get('/api/v1/appointments/availability', [AppointmentController::class, 'availability']);
$router->post('/api/v1/appointments/book', [AppointmentController::class, 'book']);
$router->post('/api/v1/ai/chat', [AiChatController::class, 'chat']);
$router->get('/api/v1/chat/status', [LiveChatController::class, 'status']);
$router->get('/api/v1/chat/session/{token}', [LiveChatController::class, 'session']);
$router->post('/api/v1/chat/message', [LiveChatController::class, 'message']);
$router->post('/api/v1/chat/prototype', [LiveChatController::class, 'generatePrototype']);
$router->get('/api/v1/chat/prototype/{token}', [LiveChatController::class, 'viewPrototype']);
$router->post('/api/v1/chat/feedback', [LiveChatController::class, 'feedback']);
$router->post('/api/v1/chat/inquiry', [LiveChatController::class, 'inquiry']);
$router->get('/api/v1/testimonials', [TestimonialController::class, 'publicList']);
$router->get('/api/v1/testimonials/{token}', [TestimonialController::class, 'getByToken']);
$router->post('/api/v1/testimonials/{token}', [TestimonialController::class, 'submit']);
$router->get('/api/v1/search', [SearchController::class, 'search']);
$router->get('/api/v1/integrations/events', [IntegrationController::class, 'events']);

// Auth
$router->post('/api/v1/auth/login', [AuthController::class, 'login']);
$router->post('/api/v1/auth/verify-2fa', [AuthController::class, 'verifyTwoFactor']);
$router->post('/api/v1/auth/refresh', [AuthController::class, 'refresh']);
$router->post('/api/v1/auth/logout', [AuthController::class, 'logout']);
$router->get('/api/v1/auth/me', [AuthController::class, 'me']);

// Admin
$router->get('/api/v1/admin/dashboard', [DashboardController::class, 'overview']);
$router->get('/api/v1/admin/notifications', [DashboardController::class, 'notifications']);
$router->get('/api/v1/admin/projects', [ProjectController::class, 'adminIndex']);
$router->post('/api/v1/admin/projects', [ProjectController::class, 'store']);
$router->patch('/api/v1/admin/projects/reorder', [ProjectController::class, 'reorder']);
$router->put('/api/v1/admin/projects/{id}', [ProjectController::class, 'update']);
$router->delete('/api/v1/admin/projects/{id}', [ProjectController::class, 'destroy']);
$router->get('/api/v1/admin/inquiries', [InquiryController::class, 'adminIndex']);
$router->get('/api/v1/admin/inquiries/export', [InquiryController::class, 'exportCsv']);
$router->patch('/api/v1/admin/inquiries/{id}', [InquiryController::class, 'updateStatus']);
$router->get('/api/v1/admin/tags', [TagController::class, 'adminIndex']);
$router->post('/api/v1/admin/tags', [TagController::class, 'store']);
$router->put('/api/v1/admin/tags/{id}', [TagController::class, 'update']);
$router->delete('/api/v1/admin/tags/{id}', [TagController::class, 'destroy']);
$router->get('/api/v1/admin/chats', [LiveChatController::class, 'adminIndex']);
$router->get('/api/v1/admin/ai-test', [LiveChatController::class, 'aiTest']);
$router->patch('/api/v1/admin/chats/{id}', [LiveChatController::class, 'markSeen']);
$router->get('/api/v1/admin/settings', [SettingsController::class, 'adminGet']);
$router->put('/api/v1/admin/settings', [SettingsController::class, 'adminUpdate']);
$router->patch('/api/v1/admin/account', [AuthController::class, 'updateAccount']);
$router->post('/api/v1/admin/account/password', [AuthController::class, 'changePassword']);
$router->post('/api/v1/admin/2fa/setup', [AuthController::class, 'setupTwoFactor']);
$router->post('/api/v1/admin/2fa/confirm', [AuthController::class, 'confirmTwoFactor']);
$router->post('/api/v1/admin/2fa/disable', [AuthController::class, 'disableTwoFactor']);
$router->post('/api/v1/admin/uploads', [UploadController::class, 'upload']);
$router->get('/api/v1/admin/blog', [BlogController::class, 'adminIndex']);
$router->post('/api/v1/admin/blog', [BlogController::class, 'store']);
$router->put('/api/v1/admin/blog/{id}', [BlogController::class, 'update']);
$router->delete('/api/v1/admin/blog/{id}', [BlogController::class, 'destroy']);
$router->get('/api/v1/admin/payments', [PaymentController::class, 'adminIndex']);
$router->patch('/api/v1/admin/payments/{reference}', [PaymentController::class, 'update']);
$router->delete('/api/v1/admin/payments/{reference}', [PaymentController::class, 'destroy']);
$router->get('/api/v1/admin/payment-links', [PaymentController::class, 'adminIndexLinks']);
$router->post('/api/v1/admin/payment-links', [PaymentController::class, 'createLink']);
$router->get('/api/v1/admin/proposals', [ProposalController::class, 'adminIndex']);
$router->post('/api/v1/admin/proposals', [ProposalController::class, 'store']);
$router->post('/api/v1/admin/proposals/{id}/send', [ProposalController::class, 'send']);
$router->get('/api/v1/admin/proposals/quote-requests', [ProposalController::class, 'quoteRequests']);
$router->get('/api/v1/admin/proposals/{id}', [ProposalController::class, 'adminShow']);
$router->put('/api/v1/admin/proposals/{id}', [ProposalController::class, 'update']);
$router->get('/api/v1/admin/clients', [ClientController::class, 'index']);
$router->post('/api/v1/admin/clients/invite', [ClientController::class, 'invite']);
$router->get('/api/v1/admin/clients/{id}', [ClientController::class, 'show']);
$router->patch('/api/v1/admin/clients/{id}', [ClientController::class, 'update']);
$router->post('/api/v1/admin/clients/{id}/files', [ClientController::class, 'uploadFile']);
$router->delete('/api/v1/admin/clients/{id}/files/{fileId}', [ClientController::class, 'deleteFile']);
$router->get('/api/v1/admin/clients/{id}/messages', [ClientController::class, 'listMessages']);
$router->post('/api/v1/admin/clients/{id}/messages', [ClientController::class, 'sendMessage']);
$router->get('/api/v1/admin/analytics/summary', [AnalyticsController::class, 'summary']);
$router->get('/api/v1/admin/appointments', [AppointmentController::class, 'adminIndex']);
$router->patch('/api/v1/admin/appointments/{id}', [AppointmentController::class, 'updateStatus']);
$router->get('/api/v1/admin/newsletter', [NewsletterController::class, 'adminIndex']);
$router->get('/api/v1/admin/newsletter/export', [NewsletterController::class, 'exportCsv']);
$router->delete('/api/v1/admin/newsletter/{id}', [NewsletterController::class, 'destroy']);
$router->get('/api/v1/admin/testimonials', [TestimonialController::class, 'adminIndex']);
$router->post('/api/v1/admin/testimonials', [TestimonialController::class, 'request']);
$router->patch('/api/v1/admin/testimonials/{id}', [TestimonialController::class, 'update']);
$router->delete('/api/v1/admin/testimonials/{id}', [TestimonialController::class, 'destroy']);
$router->get('/api/v1/admin/marketing-leads', [MarketingLeadController::class, 'adminIndex']);
$router->post('/api/v1/admin/marketing-leads', [MarketingLeadController::class, 'store']);
$router->patch('/api/v1/admin/marketing-leads/{id}', [MarketingLeadController::class, 'update']);
$router->delete('/api/v1/admin/marketing-leads/{id}', [MarketingLeadController::class, 'destroy']);
$router->post('/api/v1/admin/marketing-leads/{id}/audit', [MarketingLeadController::class, 'runAudit']);
$router->post('/api/v1/admin/marketing-leads/{id}/generate-pitch', [MarketingLeadController::class, 'generatePitch']);
$router->post('/api/v1/admin/marketing-leads/{id}/send', [MarketingLeadController::class, 'markSent']);
$router->get('/api/v1/admin/social-drafts', [SocialDraftController::class, 'index']);
$router->post('/api/v1/admin/social-drafts/generate', [SocialDraftController::class, 'generate']);
$router->patch('/api/v1/admin/social-drafts/{id}', [SocialDraftController::class, 'update']);
$router->delete('/api/v1/admin/social-drafts/{id}', [SocialDraftController::class, 'destroy']);
$router->get('/api/v1/admin/activity-log', [ActivityLogController::class, 'index']);
$router->get('/api/v1/admin/activity-log/entity-types', [ActivityLogController::class, 'entityTypes']);
$router->get('/api/v1/admin/error-logs', [ErrorLogController::class, 'index']);
$router->post('/api/v1/admin/error-logs/delete-entry', [ErrorLogController::class, 'deleteEntry']);
$router->post('/api/v1/admin/error-logs/clear', [ErrorLogController::class, 'clear']);
$router->get('/api/v1/admin/composio/status', [ComposioController::class, 'status']);
$router->post('/api/v1/admin/composio/connect', [ComposioController::class, 'connect']);
$router->post('/api/v1/admin/composio/disconnect', [ComposioController::class, 'disconnect']);

$router->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI']);
