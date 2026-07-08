<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Response;
use App\Support\Settings;

class SettingsController
{
    /** Secrets and behavior config — admin read/write only, never exposed publicly. */
    private const ADMIN_ONLY_KEYS = [
        'gemini_api_key', 'openrouter_api_key', 'openrouter_model', 'slack_webhook_url', 'makecom_webhook_url',
        'integration_api_key', 'notification_email',
        'chat_hours_enabled', 'chat_hours_days', 'chat_hours_start', 'chat_hours_end', 'chat_timezone',
        'maintenance_mode',
        'paystack_public_key', 'paystack_secret_key',
        'booking_enabled', 'booking_days', 'booking_start_time', 'booking_end_time',
        'booking_slot_minutes', 'booking_lead_days', 'booking_min_notice_hours', 'booking_timezone',
        'social_draft_enabled', 'social_draft_frequency', 'social_draft_last_run',
        'composio_api_key',
        'composio_linkedin_auth_config_id', 'composio_linkedin_account_id',
        'composio_twitter_auth_config_id', 'composio_twitter_account_id',
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
        'timeline_1_label', 'timeline_1_title', 'timeline_1_desc',
        'timeline_2_label', 'timeline_2_title', 'timeline_2_desc',
        'timeline_3_label', 'timeline_3_title', 'timeline_3_desc',
        'timeline_4_label', 'timeline_4_title', 'timeline_4_desc',
        'timeline_5_label', 'timeline_5_title', 'timeline_5_desc',
        'github_username',
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
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $changedPricingKeys = [];

        foreach (array_merge(self::ADMIN_ONLY_KEYS, self::CONTENT_KEYS) as $key) {
            if (!array_key_exists($key, $data)) {
                continue;
            }
            $value = trim((string) $data[$key]);
            if (mb_strlen($value) > 5000) {
                Response::error('Value too long.', 422);
            }
            Settings::set($key, $value);

            if (str_starts_with($key, 'pricing_')) {
                $changedPricingKeys[] = $key;
            }

            // The DB value is just UI state — the .maintenance marker file next
            // to .htaccess is what actually gates public requests (both there
            // and in index.php's matching check for local dev), so keep it
            // in sync whenever this setting changes. DOCUMENT_ROOT is used
            // (rather than a hardcoded 'public/' segment) because the web root
            // is named differently in production (public_html/, per README's
            // deploy layout) than in local dev (public/) — DOCUMENT_ROOT is
            // the one thing .htaccess, index.php, and this write path can all
            // agree on across both environments.
            if ($key === 'maintenance_mode') {
                $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? (dirname(__DIR__, 2) . '/public');
                $markerPath = $docRoot . '/.maintenance';
                if ($value !== '') {
                    file_put_contents($markerPath, 'Enabled at ' . date('c'));
                } elseif (file_exists($markerPath)) {
                    unlink($markerPath);
                }
            }
        }

        if ($changedPricingKeys) {
            ActivityLog::log($user, 'updated', 'pricing_settings', null, null, ['keys' => $changedPricingKeys]);
        }

        Response::json(['status' => 'saved']);
    }
}
