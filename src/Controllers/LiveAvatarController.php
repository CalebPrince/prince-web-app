<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\RateLimitMiddleware;
use App\Support\Response;
use App\Support\Settings;

class LiveAvatarController
{
    public static function sdkStart(): void { self::proxySdkRequest('/v1/sessions/start'); }
    public static function sdkStop(): void { self::proxySdkRequest('/v1/sessions/stop'); }
    public static function sdkKeepAlive(): void { self::proxySdkRequest('/v1/sessions/keep-alive'); }

    /** POST /api/v1/liveavatar/session-token — issues a short-lived SDK token. */
    public static function createSessionToken(): void
    {
        RateLimitMiddleware::enforce('liveavatar_session_token', 60);
        if (Settings::get('liveavatar_enabled') !== '1') Response::error('Lisa video is not available at the moment.', 503);

        $apiKey = Settings::get('liveavatar_api_key');
        $avatarId = Settings::get('liveavatar_avatar_id');
        $contextId = Settings::get('liveavatar_context_id');
        $voiceId = Settings::get('liveavatar_voice_id') ?: '62bbb4b2-bb26-4727-bc87-cfb2bd4e0cc8';
        if (!$apiKey || !$avatarId || !$contextId) Response::error('Lisa video is not fully configured.', 503);

        $result = self::request('https://api.liveavatar.com/v1/sessions/token', $apiKey, [
            'mode' => 'FULL',
            'avatar_id' => $avatarId,
            'avatar_persona' => [
                'voice_id' => $voiceId,
                'context_id' => $contextId,
                'language' => 'en',
            ],
            'is_sandbox' => true,
        ]);

        $token = (string) ($result['data']['session_token'] ?? '');
        if ($token === '') Response::error('LiveAvatar returned no session token.', 502);
        Response::json(['session_token' => $token, 'sandbox' => true]);
    }

    public static function createEmbed(): void
    {
        // Embed URLs are short-lived, so page reloads and failed connection retries
        // legitimately create more sessions than a normal form submission.
        RateLimitMiddleware::enforce('liveavatar_embed', 60);
        if (Settings::get('liveavatar_enabled') !== '1') Response::error('Lisa video is not available at the moment.', 503);

        $apiKey = Settings::get('liveavatar_api_key');
        $avatarId = Settings::get('liveavatar_avatar_id');
        $contextId = Settings::get('liveavatar_context_id');
        if (!$apiKey || !$avatarId || !$contextId) Response::error('Lisa video is not fully configured.', 503);

        $payload = json_encode(['avatar_id' => $avatarId, 'context_id' => $contextId, 'is_sandbox' => true]);
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "X-API-KEY: {$apiKey}\r\nContent-Type: application/json\r\nAccept: application/json\r\n",
            'content' => $payload,
            'ignore_errors' => true,
            'timeout' => 25,
        ]]);

        $body = @file_get_contents('https://api.liveavatar.com/v2/embeddings', false, $context);
        $statusLine = $http_response_header[0] ?? '';
        $status = preg_match('/\s(\d{3})\s/', $statusLine, $match) ? (int) $match[1] : 0;
        $decoded = is_string($body) ? json_decode($body, true) : null;
        if ($status < 200 || $status >= 300 || !is_array($decoded)) {
            error_log('LiveAvatar embed request failed with HTTP ' . $status);
            Response::error('Lisa could not start the video call. Please try again shortly.', 502);
        }

        $url = (string) ($decoded['data']['url'] ?? '');
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($url === '' || $host !== 'embed.liveavatar.com' || !str_starts_with($url, 'https://')) {
            error_log('LiveAvatar returned an invalid embed URL.');
            Response::error('Lisa returned an invalid video session.', 502);
        }
        Response::json(['url' => $url, 'sandbox' => true]);
    }

    private static function request(string $url, string $apiKey, array $payload): array
    {
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "X-API-KEY: {$apiKey}\r\nContent-Type: application/json\r\nAccept: application/json\r\n",
            'content' => json_encode($payload, JSON_UNESCAPED_SLASHES),
            'ignore_errors' => true,
            'timeout' => 25,
        ]]);
        $body = @file_get_contents($url, false, $context);
        $statusLine = $http_response_header[0] ?? '';
        $status = preg_match('/\s(\d{3})\s/', $statusLine, $match) ? (int) $match[1] : 0;
        $decoded = is_string($body) ? json_decode($body, true) : null;
        if ($status < 200 || $status >= 300 || !is_array($decoded)) {
            $providerMessage = is_array($decoded) ? (string) ($decoded['message'] ?? $decoded['error'] ?? '') : '';
            error_log('LiveAvatar request failed with HTTP ' . $status . ($providerMessage ? ': ' . $providerMessage : ''));
            Response::error('Lisa could not start the video call. Please try again shortly.', 502);
        }
        return $decoded;
    }

    private static function proxySdkRequest(string $path): void
    {
        RateLimitMiddleware::enforce('liveavatar_sdk_proxy', 180);
        $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
        if (!preg_match('/^Bearer\s+[A-Za-z0-9._-]+$/', $authorization)) {
            Response::error('A valid LiveAvatar session token is required.', 401);
        }
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Authorization: {$authorization}\r\nContent-Type: application/json\r\nAccept: application/json\r\n",
            'content' => '{}',
            'ignore_errors' => true,
            'timeout' => 30,
        ]]);
        $body = @file_get_contents('https://api.liveavatar.com' . $path, false, $context);
        $statusLine = $http_response_header[0] ?? '';
        $status = preg_match('/\s(\d{3})\s/', $statusLine, $match) ? (int) $match[1] : 502;
        $decoded = is_string($body) ? json_decode($body, true) : null;
        if (!is_array($decoded)) {
            error_log('LiveAvatar SDK proxy returned an invalid response for ' . $path);
            Response::error('LiveAvatar did not return a valid response.', 502);
        }
        Response::json($decoded, $status);
    }
}
