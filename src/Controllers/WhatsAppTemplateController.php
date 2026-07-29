<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\WhatsAppNotifier;
use App\Support\WhatsAppTemplateManager;

final class WhatsAppTemplateController
{
    public static function status(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(WhatsAppTemplateManager::status());
    }

    public static function create(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppTemplateManager::createAndSubmit(), 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public static function refresh(): void
    {
        AuthMiddleware::requireAuth();
        try {
            Response::json(WhatsAppTemplateManager::refresh());
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public static function test(): void
    {
        AuthMiddleware::requireAuth();
        if (strtolower((string) Settings::get('twilio_whatsapp_post_call_template_status')) !== 'approved') {
            Response::error('The WhatsApp template must be approved before testing.', 422);
        }
        $result = WhatsAppNotifier::sendTemplate(
            (string) Settings::get('owner_whatsapp_number'),
            (string) Settings::get('twilio_whatsapp_post_call_content_sid'),
            ['1' => 'Prince Caleb', '2' => 'This is a test of Lisa’s consent-based post-call summary workflow.']
        );
        if (!$result['ok']) Response::error($result['error'] ?: 'Test message failed.', 502);
        Response::json($result);
    }

    public static function deliveryStatus(): void
    {
        if (!self::verifyTwilio()) {
            http_response_code(403);
            exit;
        }
        $sid = mb_substr(trim((string) ($_POST['MessageSid'] ?? '')), 0, 80);
        $status = mb_substr(strtolower(trim((string) ($_POST['MessageStatus'] ?? 'unknown'))), 0, 40);
        if (in_array($status, ['accepted', 'queued', 'sending', 'sent'], true)) $status = 'sent';
        if ($sid !== '') {
            Database::get()->prepare(
                "UPDATE whatsapp_call_followups SET status = ?, updated_at = datetime('now') WHERE provider_message_sid = ?"
            )->execute([$status, $sid]);
        }
        Response::json(['status' => 'ok']);
    }

    private static function verifyTwilio(): bool
    {
        $token = (string) Settings::get('twilio_auth_token');
        $signature = (string) ($_SERVER['HTTP_X_TWILIO_SIGNATURE'] ?? '');
        if ($token === '' || $signature === '') return false;
        $scheme = ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') ? 'https' : 'http';
        $url = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? '') . ($_SERVER['REQUEST_URI'] ?? '');
        $params = $_POST;
        ksort($params);
        $data = $url;
        foreach ($params as $key => $value) $data .= $key . $value;
        return hash_equals($signature, base64_encode(hash_hmac('sha1', $data, $token, true)));
    }
}
