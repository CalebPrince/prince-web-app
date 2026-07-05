<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\Settings;

class SettingsController
{
    /** Secrets — admin read/write only, never exposed publicly. */
    private const SECRET_KEYS = ['gemini_api_key', 'slack_webhook_url'];

    /** Site copy editable from Admin → Site Content, served publicly for page hydration. */
    private const CONTENT_KEYS = [
        'hero_eyebrow', 'hero_title', 'hero_subtitle', 'availability_badge',
        'tech_badges',
        'service_1_title', 'service_1_summary', 'service_1_desc',
        'service_2_title', 'service_2_summary', 'service_2_desc',
        'service_3_title', 'service_3_summary', 'service_3_desc',
        'about_intro', 'about_bio',
        'contact_intro',
        'social_github', 'social_linkedin', 'social_twitter', 'social_whatsapp', 'social_email',
        'chat_greeting', 'chat_intro', 'chat_offline_message', 'chat_persona',
    ];

    /** GET /api/v1/content — public: set content values only (secrets excluded) */
    public static function publicContent(): void
    {
        $out = [];
        foreach (self::CONTENT_KEYS as $key) {
            $value = Settings::get($key);
            if ($value !== null && $value !== '') {
                $out[$key] = $value;
            }
        }
        Response::json($out);
    }

    /** GET /api/v1/admin/settings */
    public static function adminGet(): void
    {
        AuthMiddleware::requireAuth();
        $out = [];
        foreach (array_merge(self::SECRET_KEYS, self::CONTENT_KEYS) as $key) {
            $out[$key] = Settings::get($key);
        }
        Response::json($out);
    }

    /** PUT /api/v1/admin/settings — body: any whitelisted keys */
    public static function adminUpdate(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        foreach (array_merge(self::SECRET_KEYS, self::CONTENT_KEYS) as $key) {
            if (!array_key_exists($key, $data)) {
                continue;
            }
            $value = trim((string) $data[$key]);
            if (mb_strlen($value) > 5000) {
                Response::error('Value too long.', 422);
            }
            Settings::set($key, $value);
        }
        Response::json(['status' => 'saved']);
    }
}
