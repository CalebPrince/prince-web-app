<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;
use App\Support\Settings;

class SettingsController
{
    /** Secrets and behavior config — admin read/write only, never exposed publicly. */
    private const ADMIN_ONLY_KEYS = [
        'gemini_api_key', 'slack_webhook_url', 'notification_email',
        'chat_hours_enabled', 'chat_hours_days', 'chat_hours_start', 'chat_hours_end', 'chat_timezone',
        'maintenance_mode',
        'paystack_public_key', 'paystack_secret_key',
    ];

    /** Site copy editable from Admin → Site Content, served publicly for page hydration. */
    private const CONTENT_KEYS = [
        'default_theme',
        'hero_eyebrow', 'hero_title', 'hero_subtitle', 'availability_badge',
        'tech_badges',
        'service_1_title', 'service_1_summary', 'service_1_desc',
        'service_2_title', 'service_2_summary', 'service_2_desc',
        'service_3_title', 'service_3_summary', 'service_3_desc',
        'about_intro', 'about_bio',
        'contact_intro', 'contact_location', 'contact_phone',
        'social_github', 'social_linkedin', 'social_twitter', 'social_whatsapp', 'social_email',
        'chat_greeting', 'chat_intro', 'chat_offline_message', 'chat_persona',
        'stat_1_value', 'stat_1_suffix', 'stat_1_label',
        'stat_2_value', 'stat_2_suffix', 'stat_2_label',
        'stat_3_value', 'stat_3_suffix', 'stat_3_label',
        'stat_4_value', 'stat_4_prefix', 'stat_4_suffix', 'stat_4_label',
        'testimonial_1_quote', 'testimonial_1_name', 'testimonial_1_role',
        'testimonial_2_quote', 'testimonial_2_name', 'testimonial_2_role',
        'testimonial_3_quote', 'testimonial_3_name', 'testimonial_3_role',
        'pricing_intro',
        'pricing_tier_1_name', 'pricing_tier_1_price', 'pricing_tier_1_tagline', 'pricing_tier_1_features',
        'pricing_tier_2_name', 'pricing_tier_2_price', 'pricing_tier_2_tagline', 'pricing_tier_2_features',
        'pricing_tier_3_name', 'pricing_tier_3_price', 'pricing_tier_3_tagline', 'pricing_tier_3_features',
        'pricing_currency', 'pricing_tier_1_amount',
        'live_chat_enabled', 'whatsapp_button_enabled',
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
        foreach (array_merge(self::ADMIN_ONLY_KEYS, self::CONTENT_KEYS) as $key) {
            $out[$key] = Settings::get($key);
        }
        Response::json($out);
    }

    /** PUT /api/v1/admin/settings — body: any whitelisted keys */
    public static function adminUpdate(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        foreach (array_merge(self::ADMIN_ONLY_KEYS, self::CONTENT_KEYS) as $key) {
            if (!array_key_exists($key, $data)) {
                continue;
            }
            $value = trim((string) $data[$key]);
            if (mb_strlen($value) > 5000) {
                Response::error('Value too long.', 422);
            }
            Settings::set($key, $value);

            // The DB value is just UI state — the .maintenance marker file next
            // to .htaccess is what actually gates public requests (both there
            // and in index.php's matching check for local dev), so keep it
            // in sync whenever this setting changes.
            if ($key === 'maintenance_mode') {
                $markerPath = dirname(__DIR__, 2) . '/public/.maintenance';
                if ($value !== '') {
                    file_put_contents($markerPath, 'Enabled at ' . date('c'));
                } elseif (file_exists($markerPath)) {
                    unlink($markerPath);
                }
            }
        }
        Response::json(['status' => 'saved']);
    }
}
