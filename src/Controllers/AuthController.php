<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Jwt;
use App\Support\Response;

class AuthController
{
    private static function config(): array
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        return appConfig();
    }

    private static function issueTokens(array $user): array
    {
        $config = self::config();
        $now = time();

        $accessToken = Jwt::encode([
            'sub' => (int) $user['id'],
            'tv' => (int) $user['token_version'],
            'type' => 'access',
            'iat' => $now,
            'exp' => $now + $config['access_token_ttl'],
        ], $config['jwt_secret']);

        $refreshToken = Jwt::encode([
            'sub' => (int) $user['id'],
            'tv' => (int) $user['token_version'],
            'type' => 'refresh',
            'iat' => $now,
            'exp' => $now + $config['refresh_token_ttl'],
        ], $config['jwt_secret']);

        $secure = $config['environment'] !== 'development';
        setcookie('access_token', $accessToken, [
            'expires' => $now + $config['access_token_ttl'],
            'path' => '/',
            'httponly' => true,
            'secure' => $secure,
            'samesite' => 'Lax',
        ]);
        setcookie('refresh_token', $refreshToken, [
            'expires' => $now + $config['refresh_token_ttl'],
            'path' => '/',
            'httponly' => true,
            'secure' => $secure,
            'samesite' => 'Lax',
        ]);

        return ['access_token' => $accessToken];
    }

    public static function login(): void
    {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $email = trim((string) ($data['email'] ?? ''));
        $password = (string) ($data['password'] ?? '');

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE email = ? AND is_active = 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            Response::error('Invalid credentials', 401);
        }

        self::issueTokens($user);
        Response::json(['id' => (int) $user['id'], 'email' => $user['email']]);
    }

    public static function refresh(): void
    {
        $config = self::config();
        $token = $_COOKIE['refresh_token'] ?? null;
        if (!$token) {
            Response::error('No refresh token', 401);
        }

        $payload = Jwt::decode($token, $config['jwt_secret']);
        if (!$payload || ($payload['type'] ?? null) !== 'refresh') {
            Response::error('Invalid refresh token', 401);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? AND is_active = 1');
        $stmt->execute([$payload['sub']]);
        $user = $stmt->fetch();

        if (!$user || (int) $user['token_version'] !== (int) $payload['tv']) {
            Response::error('Session no longer valid', 401);
        }

        self::issueTokens($user);
        Response::json(['status' => 'refreshed']);
    }

    public static function logout(): void
    {
        setcookie('access_token', '', ['expires' => 1, 'path' => '/']);
        setcookie('refresh_token', '', ['expires' => 1, 'path' => '/']);
        Response::json(['status' => 'logged_out']);
    }

    public static function me(): void
    {
        $user = AuthMiddleware::requireAuth();
        Response::json(['id' => (int) $user['id'], 'email' => $user['email']]);
    }

    /** PATCH /api/v1/admin/account — change the login email */
    public static function updateAccount(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $email = trim((string) ($data['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('A valid email address is required.', 422);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id != ?');
        $stmt->execute([$email, $user['id']]);
        if ($stmt->fetch()) {
            Response::error('That email is already in use.', 409);
        }

        $pdo->prepare('UPDATE users SET email = ? WHERE id = ?')->execute([$email, $user['id']]);
        Response::json(['id' => (int) $user['id'], 'email' => $email]);
    }

    /** POST /api/v1/admin/account/password */
    public static function changePassword(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $current = (string) ($data['current_password'] ?? '');
        $new = (string) ($data['new_password'] ?? '');

        if (!password_verify($current, $user['password_hash'])) {
            Response::error('Current password is incorrect.', 401);
        }
        if (strlen($new) < 10) {
            Response::error('New password must be at least 10 characters.', 422);
        }

        $pdo = Database::get();
        $pdo->prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), $user['id']]);

        // Bumping token_version invalidated every outstanding token, including
        // this session's — re-issue cookies so only other devices are signed out.
        $user['token_version'] = (int) $user['token_version'] + 1;
        self::issueTokens($user);
        Response::json(['status' => 'password_changed']);
    }
}
