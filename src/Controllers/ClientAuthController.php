<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\ClientAuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\Database;
use App\Support\EmailTemplate;
use App\Support\Jwt;
use App\Support\Mailer;
use App\Support\Response;

/** Mirrors AuthController's JWT-cookie flow but against the clients table — no 2FA, plus invite/reset flows admin accounts don't need. */
class ClientAuthController
{
    private static function config(): array
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        return appConfig();
    }

    private static function issueTokens(array $client): void
    {
        $config = self::config();
        $now = time();

        $accessToken = Jwt::encode([
            'sub' => (int) $client['id'],
            'tv' => (int) $client['token_version'],
            'type' => 'client_access',
            'iat' => $now,
            'exp' => $now + $config['access_token_ttl'],
        ], $config['jwt_secret']);

        $refreshToken = Jwt::encode([
            'sub' => (int) $client['id'],
            'tv' => (int) $client['token_version'],
            'type' => 'client_refresh',
            'iat' => $now,
            'exp' => $now + $config['refresh_token_ttl'],
        ], $config['jwt_secret']);

        $secure = $config['environment'] !== 'development';
        setcookie('client_access_token', $accessToken, [
            'expires' => $now + $config['access_token_ttl'],
            'path' => '/',
            'httponly' => true,
            'secure' => $secure,
            'samesite' => 'Lax',
        ]);
        setcookie('client_refresh_token', $refreshToken, [
            'expires' => $now + $config['refresh_token_ttl'],
            'path' => '/',
            'httponly' => true,
            'secure' => $secure,
            'samesite' => 'Lax',
        ]);
    }

    /** POST /api/v1/client/auth/login — body: {email, password} */
    public static function login(): void
    {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $email = trim((string) ($data['email'] ?? ''));
        $password = (string) ($data['password'] ?? '');

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM clients WHERE email = ? AND is_active = 1');
        $stmt->execute([$email]);
        $client = $stmt->fetch();

        if (!$client || !$client['password_hash'] || !password_verify($password, $client['password_hash'])) {
            Response::error('Invalid credentials', 401);
        }

        self::issueTokens($client);
        Response::json(['id' => (int) $client['id'], 'email' => $client['email'], 'name' => $client['name']]);
    }

    /** POST /api/v1/client/auth/refresh */
    public static function refresh(): void
    {
        $config = self::config();
        $token = $_COOKIE['client_refresh_token'] ?? null;
        if (!$token) {
            Response::error('No refresh token', 401);
        }

        $payload = Jwt::decode($token, $config['jwt_secret']);
        if (!$payload || ($payload['type'] ?? null) !== 'client_refresh') {
            Response::error('Invalid refresh token', 401);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM clients WHERE id = ? AND is_active = 1');
        $stmt->execute([$payload['sub']]);
        $client = $stmt->fetch();

        if (!$client || (int) $client['token_version'] !== (int) $payload['tv']) {
            Response::error('Session no longer valid', 401);
        }

        self::issueTokens($client);
        Response::json(['status' => 'refreshed']);
    }

    /** POST /api/v1/client/auth/logout */
    public static function logout(): void
    {
        setcookie('client_access_token', '', ['expires' => 1, 'path' => '/']);
        setcookie('client_refresh_token', '', ['expires' => 1, 'path' => '/']);
        Response::json(['status' => 'logged_out']);
    }

    /** GET /api/v1/client/me */
    public static function me(): void
    {
        $client = ClientAuthMiddleware::requireAuth();
        Response::json(['id' => (int) $client['id'], 'email' => $client['email'], 'name' => $client['name']]);
    }

    /** POST /api/v1/client/auth/setup-password — body: {token, password} */
    public static function setupPassword(): void
    {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $token = trim((string) ($data['token'] ?? ''));
        $password = (string) ($data['password'] ?? '');

        if ($token === '') {
            Response::error('This setup link is invalid.', 422);
        }
        if (strlen($password) < 10) {
            Response::error('Password must be at least 10 characters.', 422);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare(
            "SELECT * FROM clients WHERE invite_token = ? AND is_active = 1 AND invite_expires_at > datetime('now')"
        );
        $stmt->execute([$token]);
        $client = $stmt->fetch();
        if (!$client) {
            Response::error('This setup link is invalid or has expired. Ask for a new invite.', 422);
        }

        $pdo->prepare(
            'UPDATE clients SET password_hash = ?, invite_token = NULL, invite_expires_at = NULL WHERE id = ?'
        )->execute([password_hash($password, PASSWORD_DEFAULT), $client['id']]);

        $client['password_hash'] = 'set';
        self::issueTokens($client);
        Response::json(['id' => (int) $client['id'], 'email' => $client['email'], 'name' => $client['name']]);
    }

    /** POST /api/v1/client/auth/forgot-password — body: {email}. Always reports success to avoid account enumeration. */
    public static function forgotPassword(): void
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        RateLimitMiddleware::enforce('client_forgot_password', appConfig()['contact_rate_limit']);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $email = trim((string) ($data['email'] ?? ''));

        if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $pdo = Database::get();
            $stmt = $pdo->prepare('SELECT * FROM clients WHERE email = ? AND is_active = 1');
            $stmt->execute([$email]);
            $client = $stmt->fetch();

            if ($client) {
                $resetToken = bin2hex(random_bytes(16));
                $pdo->prepare(
                    "UPDATE clients SET reset_token = ?, reset_expires_at = datetime('now', '+1 hour') WHERE id = ?"
                )->execute([$resetToken, $client['id']]);

                $url = self::absoluteUrl('/client/reset-password.html?token=' . $resetToken);
                $message = EmailTemplate::render('client_password_reset', [
                    'client_name' => $client['name'],
                    'client_email' => $client['email'],
                    'reset_url' => $url,
                ], EmailTemplate::defaults()['client_password_reset']);
                Mailer::sendHtml($client['email'], $message['subject'], $message['html'], $message['text']);
                if (false) Mailer::send(
                    $client['email'],
                    'Reset your client portal password',
                    "Hi {$client['name']},\n\nUse this link to reset your password:\n\n{$url}\n\n"
                        . "This link expires in 1 hour. If you didn't request this, you can ignore this email."
                );
            }
        }

        Response::json(['status' => 'ok']);
    }

    /** POST /api/v1/client/auth/reset-password — body: {token, password} */
    public static function resetPassword(): void
    {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $token = trim((string) ($data['token'] ?? ''));
        $password = (string) ($data['password'] ?? '');

        if ($token === '') {
            Response::error('This reset link is invalid.', 422);
        }
        if (strlen($password) < 10) {
            Response::error('Password must be at least 10 characters.', 422);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare(
            "SELECT * FROM clients WHERE reset_token = ? AND is_active = 1 AND reset_expires_at > datetime('now')"
        );
        $stmt->execute([$token]);
        $client = $stmt->fetch();
        if (!$client) {
            Response::error('This reset link is invalid or has expired.', 422);
        }

        $pdo->prepare(
            'UPDATE clients SET password_hash = ?, reset_token = NULL, reset_expires_at = NULL, token_version = token_version + 1 WHERE id = ?'
        )->execute([password_hash($password, PASSWORD_DEFAULT), $client['id']]);

        $client['password_hash'] = 'set';
        $client['token_version'] = (int) $client['token_version'] + 1;
        self::issueTokens($client);
        Response::json(['status' => 'password_reset']);
    }

    private static function absoluteUrl(string $path): string
    {
        $host = $_SERVER['HTTP_HOST'] ?? 'princecaleb.dev';
        $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https' ? 'https' : 'http';
        if ($host === 'princecaleb.dev' || str_ends_with($host, '.princecaleb.dev')) {
            $scheme = 'https';
        }

        return $scheme . '://' . $host . $path;
    }
}
