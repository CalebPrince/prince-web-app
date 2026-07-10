<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Jwt;
use App\Support\Response;
use App\Support\Settings;
use App\Support\Totp;

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

    private static function verifyPassword(string $password, string $storedHash): bool
    {
        if (strpos($storedHash, 'pbkdf2_sha256$') === 0) {
            $parts = explode('$', $storedHash, 4);
            if (count($parts) !== 4) {
                return false;
            }

            [, $iterations, $salt, $expected] = $parts;
            $iterations = (int) $iterations;
            if ($iterations < 100000 || $salt === '' || $expected === '') {
                return false;
            }

            $actual = hash_pbkdf2('sha256', $password, $salt, $iterations, strlen($expected));
            return hash_equals($expected, $actual);
        }

        return password_verify($password, $storedHash);
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

        if (!$user || !self::verifyPassword($password, (string) $user['password_hash'])) {
            Response::error('Invalid credentials', 401);
        }

        if (!empty($user['totp_enabled'])) {
            self::issuePending2faCookie($user);
            Response::json(['requires_2fa' => true]);
        }

        self::issueTokens($user);
        Response::json(['id' => (int) $user['id'], 'email' => $user['email']]);
    }

    /**
     * GET /api/v1/auth/google/client-id — public. The OAuth client id is not
     * a secret (it ships in the markup of every Google sign-in button); the
     * login page uses this to decide whether to render the button at all.
     */
    public static function googleClientId(): void
    {
        Response::json(['client_id' => Settings::get('google_client_id')]);
    }

    /**
     * POST /api/v1/auth/google — body: {credential} (a Google Identity
     * Services ID token). Verifies the token against Google, then signs in
     * only if the Google account's verified email matches an active admin
     * user. TOTP is intentionally skipped on this path: the token proves a
     * live Google session (with Google's own 2FA) rather than a stored
     * password, so it already carries a second factor.
     */
    public static function googleLogin(): void
    {
        $clientId = Settings::get('google_client_id');
        if (!$clientId) {
            Response::error('Google sign-in is not configured.', 404);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $credential = (string) ($data['credential'] ?? '');
        if ($credential === '' || substr_count($credential, '.') !== 2) {
            Response::error('Invalid Google credential.', 422);
        }

        $claims = self::verifyGoogleIdToken($credential, $clientId);
        if (!$claims) {
            Response::error('Google sign-in could not be verified — please try again.', 401);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE lower(email) = ? AND is_active = 1');
        $stmt->execute([$claims['email']]);
        $user = $stmt->fetch();

        if (!$user) {
            Response::error('This Google account is not authorized for admin access.', 401);
        }

        self::issueTokens($user);
        Response::json(['id' => (int) $user['id'], 'email' => $user['email']]);
    }

    /**
     * curl when available (production), stream-context fallback otherwise
     * (some dev setups ship PHP without the curl extension). 200-only.
     */
    private static function httpGet(string $url): ?string
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_CONNECTTIMEOUT => 5,
            ]);
            $response = @curl_exec($ch);
            $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            return ($response !== false && $status === 200) ? (string) $response : null;
        }

        $context = stream_context_create(['http' => ['timeout' => 8, 'ignore_errors' => true]]);
        $body = @file_get_contents($url, false, $context);
        $statusLine = $http_response_header[0] ?? '';
        if ($body === false || !preg_match('~\s200\b~', $statusLine)) {
            return null;
        }
        return $body;
    }

    /** @return ?array{email: string} */
    private static function verifyGoogleIdToken(string $idToken, string $clientId): ?array
    {
        // Google's tokeninfo endpoint validates the signature and expiry —
        // fine at admin-login volume; a local JWKS cache would be overkill.
        $response = self::httpGet('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken));
        if ($response === null) {
            return null;
        }

        $claims = json_decode($response, true) ?: [];
        $issuerOk = in_array($claims['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true);
        $email = strtolower(trim((string) ($claims['email'] ?? '')));

        if (
            !$issuerOk
            || ($claims['aud'] ?? '') !== $clientId
            || ($claims['email_verified'] ?? '') !== 'true'
            || $email === ''
            || (int) ($claims['exp'] ?? 0) < time()
        ) {
            return null;
        }

        return ['email' => $email];
    }

    private static function issuePending2faCookie(array $user): void
    {
        $config = self::config();
        $now = time();
        $ttl = 5 * 60;
        $token = Jwt::encode([
            'sub' => (int) $user['id'],
            'tv' => (int) $user['token_version'],
            'type' => '2fa_pending',
            'iat' => $now,
            'exp' => $now + $ttl,
        ], $config['jwt_secret']);

        setcookie('pending_2fa', $token, [
            'expires' => $now + $ttl,
            'path' => '/',
            'httponly' => true,
            'secure' => $config['environment'] !== 'development',
            'samesite' => 'Lax',
        ]);
    }

    /** POST /api/v1/auth/verify-2fa — body: {code} (TOTP) or {backup_code} */
    public static function verifyTwoFactor(): void
    {
        $config = self::config();
        $token = $_COOKIE['pending_2fa'] ?? null;
        if (!$token) {
            Response::error('No pending login — please sign in again.', 401);
        }

        $payload = Jwt::decode($token, $config['jwt_secret']);
        if (!$payload || ($payload['type'] ?? null) !== '2fa_pending') {
            Response::error('That sign-in attempt has expired — please sign in again.', 401);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? AND is_active = 1');
        $stmt->execute([$payload['sub']]);
        $user = $stmt->fetch();

        if (!$user || (int) $user['token_version'] !== (int) $payload['tv'] || empty($user['totp_enabled'])) {
            Response::error('That sign-in attempt has expired — please sign in again.', 401);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $code = trim((string) ($data['code'] ?? ''));
        $backupCode = trim((string) ($data['backup_code'] ?? ''));

        $verified = false;
        if ($code !== '') {
            $verified = Totp::verify((string) $user['totp_secret'], $code);
        } elseif ($backupCode !== '') {
            $verified = self::consumeBackupCode($pdo, (int) $user['id'], (string) $user['totp_backup_codes'], $backupCode);
        }

        if (!$verified) {
            Response::error('Incorrect code — please try again.', 401);
        }

        setcookie('pending_2fa', '', ['expires' => 1, 'path' => '/']);
        self::issueTokens($user);
        Response::json(['id' => (int) $user['id'], 'email' => $user['email']]);
    }

    private static function consumeBackupCode(\PDO $pdo, int $userId, string $codesJson, string $submitted): bool
    {
        $normalized = strtoupper(preg_replace('/\s+/', '', $submitted) ?? '');
        $hashes = json_decode($codesJson, true) ?: [];
        $matchHash = hash('sha256', $normalized);

        $index = array_search($matchHash, $hashes, true);
        if ($index === false) {
            return false;
        }

        // Single-use: remove it so the same backup code can't be replayed.
        unset($hashes[$index]);
        $pdo->prepare('UPDATE users SET totp_backup_codes = ? WHERE id = ?')
            ->execute([json_encode(array_values($hashes)), $userId]);

        return true;
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
        Response::json([
            'id' => (int) $user['id'],
            'email' => $user['email'],
            'totp_enabled' => (bool) $user['totp_enabled'],
        ]);
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

        if (!self::verifyPassword($current, (string) $user['password_hash'])) {
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

    /**
     * POST /api/v1/admin/2fa/setup — generates a candidate secret. Nothing is
     * persisted until /confirm verifies the admin actually scanned/entered it
     * correctly, so a setup that's abandoned mid-way never half-enables 2FA.
     */
    public static function setupTwoFactor(): void
    {
        $user = AuthMiddleware::requireAuth();
        $secret = Totp::generateSecret();
        Response::json([
            'secret' => $secret,
            'otpauth_uri' => Totp::provisioningUri($secret, $user['email']),
        ]);
    }

    /** POST /api/v1/admin/2fa/confirm — body: {secret, code} */
    public static function confirmTwoFactor(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $secret = trim((string) ($data['secret'] ?? ''));
        $code = trim((string) ($data['code'] ?? ''));

        if ($secret === '' || !Totp::verify($secret, $code)) {
            Response::error('That code doesn\'t match — check your authenticator app and try again.', 422);
        }

        $backupCodes = [];
        $hashedCodes = [];
        for ($i = 0; $i < 8; $i++) {
            $plain = strtoupper(bin2hex(random_bytes(4))); // e.g. "A1B2C3D4"
            $backupCodes[] = $plain;
            $hashedCodes[] = hash('sha256', $plain);
        }

        $pdo = Database::get();
        $pdo->prepare('UPDATE users SET totp_secret = ?, totp_enabled = 1, totp_backup_codes = ? WHERE id = ?')
            ->execute([$secret, json_encode($hashedCodes), $user['id']]);

        Response::json(['status' => 'enabled', 'backup_codes' => $backupCodes]);
    }

    /** POST /api/v1/admin/2fa/disable — body: {password} */
    public static function disableTwoFactor(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $password = (string) ($data['password'] ?? '');

        if (!self::verifyPassword($password, (string) $user['password_hash'])) {
            Response::error('Current password is incorrect.', 401);
        }

        Database::get()
            ->prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_backup_codes = NULL WHERE id = ?')
            ->execute([$user['id']]);

        Response::json(['status' => 'disabled']);
    }
}
