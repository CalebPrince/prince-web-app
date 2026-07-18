<?php

declare(strict_types=1);

// Minimal .env loader — no Composer dependency needed for this.
if (!function_exists('loadEnv')) {
    function loadEnv(string $path): void
    {
        if (!is_file($path)) {
            return;
        }
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            if (str_starts_with(trim($line), '#') || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            if ($key !== '' && getenv($key) === false) {
                putenv("$key=$value");
            }
        }
    }
}

if (!function_exists('env')) {
    function env(string $key, ?string $default = null): ?string
    {
        $value = getenv($key);
        return $value === false ? $default : $value;
    }
}

// Memoized so every caller gets the same array regardless of how many times
// this file has been require_once'd in the current request.
if (!function_exists('appConfig')) {
    function appConfig(): array
    {
        static $config = null;
        if ($config === null) {
            loadEnv(dirname(__DIR__) . '/.env');
            $config = [
                'app_name' => 'Prince Caleb',
                'environment' => env('APP_ENV', 'development'),
                'db_path' => dirname(__DIR__) . '/storage/db/portfolio.sqlite',
                'jwt_secret' => env('JWT_SECRET', 'dev-secret-change-me-in-production'),
                'access_token_ttl' => 15 * 60,
                'refresh_token_ttl' => 30 * 24 * 3600,
                'contact_rate_limit' => 5,
                'ai_rate_limit' => 20,
                'gemini_api_key' => env('GEMINI_API_KEY'),
                'slack_webhook_url' => env('SLACK_WEBHOOK_URL'),
                'mail_from' => env('MAIL_FROM', 'noreply@princecaleb.dev'),
                'mail_from_name' => env('MAIL_FROM_NAME', 'Prince Caleb Portfolio'),
                // Shared secret that lets the GitHub Actions deploy trigger
                // database migrations over HTTP after an FTP sync (there's no
                // shell on the host). Must match the DEPLOY_MIGRATE_TOKEN
                // GitHub secret. Empty = auto-migration disabled (fail closed).
                'deploy_migrate_token' => env('DEPLOY_MIGRATE_TOKEN'),
            ];
        }
        return $config;
    }
}
