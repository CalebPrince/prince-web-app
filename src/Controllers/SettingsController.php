<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\Settings;

class SettingsController
{
    /** Only these keys may be read or written through the admin API. */
    private const KEYS = ['gemini_api_key', 'slack_webhook_url'];

    /** GET /api/v1/admin/settings */
    public static function adminGet(): void
    {
        AuthMiddleware::requireAuth();
        $out = [];
        foreach (self::KEYS as $key) {
            $out[$key] = Settings::get($key);
        }
        Response::json($out);
    }

    /** PUT /api/v1/admin/settings — body: {gemini_api_key?, slack_webhook_url?} */
    public static function adminUpdate(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        foreach (self::KEYS as $key) {
            if (!array_key_exists($key, $data)) {
                continue;
            }
            $value = trim((string) $data[$key]);
            if (mb_strlen($value) > 500) {
                Response::error('Value too long.', 422);
            }
            Settings::set($key, $value);
        }
        Response::json(['status' => 'saved']);
    }
}
