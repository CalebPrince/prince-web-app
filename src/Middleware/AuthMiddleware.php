<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Support\Database;
use App\Support\Jwt;
use App\Support\Response;

class AuthMiddleware
{
    /** Returns the authenticated user row, or halts the request with a 401. */
    public static function requireAuth(): array
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        $config = appConfig();

        $token = self::bearerToken() ?? ($_COOKIE['access_token'] ?? null);
        if (!$token) {
            Response::error('Not authenticated', 401);
        }

        $payload = Jwt::decode($token, $config['jwt_secret']);
        if (!$payload || ($payload['type'] ?? null) !== 'access') {
            Response::error('Invalid or expired token', 401);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? AND is_active = 1');
        $stmt->execute([$payload['sub']]);
        $user = $stmt->fetch();

        if (!$user || (int) $user['token_version'] !== (int) $payload['tv']) {
            Response::error('Session no longer valid', 401);
        }

        return $user;
    }

    /**
     * Same JWT-verify + token_version revocation check as requireAuth(), but
     * never halts the request — returns the user row if the caller happens to
     * carry a valid admin session, or null for the overwhelmingly common case
     * of an ordinary, unauthenticated visitor. For a public endpoint that
     * wants to recognize Prince Caleb when he's the one using it, without
     * requiring auth for everyone else.
     */
    public static function tryAuth(): ?array
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        $config = appConfig();

        $token = self::bearerToken() ?? ($_COOKIE['access_token'] ?? null);
        if (!$token) {
            return null;
        }

        $payload = Jwt::decode($token, $config['jwt_secret']);
        if (!$payload || ($payload['type'] ?? null) !== 'access') {
            return null;
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? AND is_active = 1');
        $stmt->execute([$payload['sub']]);
        $user = $stmt->fetch();

        if (!$user || (int) $user['token_version'] !== (int) $payload['tv']) {
            return null;
        }

        return $user;
    }

    private static function bearerToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($header, 'Bearer ')) {
            return substr($header, 7);
        }
        return null;
    }
}
