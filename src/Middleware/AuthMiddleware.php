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

    private static function bearerToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($header, 'Bearer ')) {
            return substr($header, 7);
        }
        return null;
    }
}
