<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AgentCapabilities;
use App\Support\EmailTemplate;
use App\Support\LisaInstructions;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Settings;

class SettingsController
{
    /** Secrets and behavior config — admin read/write only, never exposed publicly. */
    private const ADMIN_ONLY_KEYS = [
        'gemini_api_key', 'gemini_model', 'gemini_image_model', 'openrouter_api_key', 'openrouter_model', 'groq_api_key', 'groq_model', 'serper_api_key', 'hunter_api_key', 'apify_api_key', 'slack_webhook_url',
        'whatsapp_provider', 'whapi_api_token', 'whapi_webhook_secret',
        'elevenlabs_webhook_secret', 'elevenlabs_whatsapp_agent_id', 'elevenlabs_postcall_signing_secret',
        'twilio_account_sid', 'twilio_auth_token', 'twilio_whatsapp_number', 'owner_whatsapp_number',
        'twilio_voice_enabled', 'twilio_voice_number', 'owner_voice_number', 'twilio_voice_tts_voice', 'twilio_regulatory_approved',
        'twilio_conversation_relay_enabled', 'twilio_conversation_relay_url', 'twilio_conversation_relay_secret',
        'twilio_conversation_relay_voice',
        'elevenlabs_tts_enabled', 'elevenlabs_api_key', 'elevenlabs_voice_id', 'elevenlabs_tts_model', 'scout_elevenlabs_voice_id',
        'liveavatar_enabled', 'liveavatar_api_key', 'liveavatar_avatar_id', 'liveavatar_context_id', 'liveavatar_voice_id',
        'liveavatar_llm_bridge_secret', 'liveavatar_llm_configuration_id', 'liveavatar_sandbox_enabled',
        'twilio_whatsapp_production_approved',
        'twilio_whatsapp_post_call_enabled', 'twilio_whatsapp_post_call_content_sid',
        'twilio_whatsapp_post_call_template_status',
        'twilio_balance_alert_threshold', 'twilio_last_balance', 'twilio_last_balance_currency', 'twilio_balance_checked_at',
        'integration_api_key', 'notification_email',
        'smtp_gmail_address', 'smtp_app_password', 'smtp_host', 'smtp_port', 'imap_host', 'mail_from', 'mail_from_name',
        'google_client_id',
        'chat_persona',
        'chat_hours_enabled', 'chat_hours_days', 'chat_hours_start', 'chat_hours_end', 'chat_timezone',
        'maintenance_mode',
        'paystack_public_key', 'paystack_secret_key',
        'monthly_revenue_target', 'revenue_target_currency', 'weekly_billable_hours',
        'external_expense_currency', 'external_service_expenses', 'external_expense_monthly_budget',
        'booking_enabled', 'booking_days', 'booking_start_time', 'booking_end_time',
        'booking_slot_minutes', 'booking_lead_days', 'booking_min_notice_hours', 'booking_timezone',
        'social_draft_enabled', 'social_draft_frequency', 'social_draft_last_run',
        'nurturer_sequence_2_day_offset', 'nurturer_sequence_3_day_offset',
        'nurturer_reply_sync_enabled', 'nurturer_reply_auto_send',
        'beacon_discovery_enabled', 'beacon_discovery_frequency', 'beacon_discovery_last_run', 'beacon_discovery_keywords', 'beacon_discovery_recency',
        'beacon_auto_accept_all', 'outreach_auto_accept_all', 'social_draft_auto_approve',
        'beacon_apify_enabled', 'beacon_apify_frequency', 'beacon_apify_last_run', 'beacon_apify_last_status',
        'beacon_apify_profiles', 'beacon_apify_actor_posts', 'beacon_apify_actor_posts_input',
        'beacon_apify_actor_engagers', 'beacon_apify_actor_engagers_input',
        'beacon_apify_posts_per_profile', 'beacon_apify_engagers_per_post', 'beacon_apify_max_engagers_per_run',
        'stale_lead_followup_enabled', 'stale_lead_followup_days',
        'composio_api_key',
        'composio_google_calendar_auth_config_id', 'composio_google_calendar_account_id',
        'composio_gmail_auth_config_id', 'composio_gmail_account_id',
        'composio_slack_auth_config_id', 'composio_slack_account_id',
        'composio_linkedin_auth_config_id', 'composio_linkedin_account_id',
        'composio_google_calendar_booking_tool', 'composio_google_calendar_id',
        'composio_gmail_booking_tool', 'composio_gmail_booking_to',
        'composio_slack_booking_tool', 'composio_slack_channel',
        'composio_linkedin_post_tool', 'composio_linkedin_author_urn', 'composio_linkedin_stats_tool',
        'composio_google_calendar_last_error', 'composio_gmail_last_error',
        'composio_slack_last_error', 'composio_linkedin_last_error',
        'email_tpl_payment_success_subject', 'email_tpl_payment_success_html', 'email_tpl_payment_success_text',
        'email_tpl_invoice_send_subject', 'email_tpl_invoice_send_html', 'email_tpl_invoice_send_text',
        'email_tpl_invoice_receipt_subject', 'email_tpl_invoice_receipt_html', 'email_tpl_invoice_receipt_text',
        'email_tpl_manual_payment_receipt_subject', 'email_tpl_manual_payment_receipt_html', 'email_tpl_manual_payment_receipt_text',
        'email_tpl_subscription_receipt_subject', 'email_tpl_subscription_receipt_html', 'email_tpl_subscription_receipt_text',
        'email_tpl_proposal_send_subject', 'email_tpl_proposal_send_html', 'email_tpl_proposal_send_text',
        'email_tpl_booking_client_confirmation_subject', 'email_tpl_booking_client_confirmation_html', 'email_tpl_booking_client_confirmation_text',
        'email_tpl_booking_internal_notification_subject', 'email_tpl_booking_internal_notification_html', 'email_tpl_booking_internal_notification_text',
        'email_tpl_appointment_reminder_subject', 'email_tpl_appointment_reminder_html', 'email_tpl_appointment_reminder_text',
        'email_tpl_client_invite_subject', 'email_tpl_client_invite_html', 'email_tpl_client_invite_text',
        'email_tpl_client_password_reset_subject', 'email_tpl_client_password_reset_html', 'email_tpl_client_password_reset_text',
        'email_tpl_client_portal_message_subject', 'email_tpl_client_portal_message_html', 'email_tpl_client_portal_message_text',
        'email_tpl_project_request_confirmation_subject', 'email_tpl_project_request_confirmation_html', 'email_tpl_project_request_confirmation_text',
        'email_tpl_testimonial_request_subject', 'email_tpl_testimonial_request_html', 'email_tpl_testimonial_request_text',
        'email_tpl_milestone_reminder_subject', 'email_tpl_milestone_reminder_html', 'email_tpl_milestone_reminder_text',
        'email_tpl_inquiry_internal_notification_subject', 'email_tpl_inquiry_internal_notification_html', 'email_tpl_inquiry_internal_notification_text',
        'email_brand_logo_url', 'email_site_url',
    ];

    /** Site copy editable from Admin → Site Content, served publicly for page hydration. */
    private const CONTENT_KEYS = [
        'default_theme',
        'splash_screen_enabled',
        'animation_style',
        'hero_eyebrow', 'hero_title', 'hero_subtitle', 'availability_badge',
        'hero_video_url', 'live_demo_video_url',
        'hero_value_eyebrow',
        'hero_value_1_label', 'hero_value_1_text',
        'hero_value_2_label', 'hero_value_2_text',
        'hero_value_3_label', 'hero_value_3_text',
        'faq_eyebrow', 'faq_title', 'faq_count',
        'faq_1_question', 'faq_1_answer',
        'faq_2_question', 'faq_2_answer',
        'faq_3_question', 'faq_3_answer',
        'faq_4_question', 'faq_4_answer',
        'faq_5_question', 'faq_5_answer',
        'faq_6_question', 'faq_6_answer',
        'faq_7_question', 'faq_7_answer',
        'faq_8_question', 'faq_8_answer',
        'faq_9_question', 'faq_9_answer',
        'faq_10_question', 'faq_10_answer',
        'faq_11_question', 'faq_11_answer',
        'faq_12_question', 'faq_12_answer',
        'tech_badges',
        'service_1_title', 'service_1_summary', 'service_1_desc',
        'service_2_title', 'service_2_summary', 'service_2_desc',
        'service_3_title', 'service_3_summary', 'service_3_desc',
        'about_intro', 'about_bio',
        'contact_intro', 'contact_location', 'contact_phone', 'ai_voice_public_number',
        'social_github', 'social_linkedin', 'social_twitter', 'social_whatsapp', 'social_upwork', 'social_fiverr', 'social_email',
        'chat_greeting', 'chat_intro', 'chat_offline_message', 'chat_assistant_name',
        'chat_voice_gender', 'chat_voice_accent', 'chat_voice_rate', 'chat_voice_pitch',
        'beacon_assistant_name', 'beacon_voice_gender', 'beacon_voice_accent',
        'dossier_assistant_name', 'dossier_voice_gender', 'dossier_voice_accent',
        'nurturer_assistant_name', 'nurturer_voice_gender', 'nurturer_voice_accent',
        'proposal_assistant_name', 'proposal_voice_gender', 'proposal_voice_accent',
        'sketch_assistant_name', 'sketch_voice_gender', 'sketch_voice_accent',
        'ada_assistant_name', 'ada_voice_gender', 'ada_voice_accent',
        'chief_assistant_name', 'chief_voice_gender', 'chief_voice_accent',
        'content_assistant_name', 'content_voice_gender', 'content_voice_accent',
        'arch_assistant_name', 'arch_voice_gender', 'arch_voice_accent',
        'scout_assistant_name', 'scout_voice_gender', 'scout_voice_accent',
        'sage_assistant_name', 'sage_voice_gender', 'sage_voice_accent',
        'reel_assistant_name', 'reel_voice_gender', 'reel_voice_accent',
        'radar_assistant_name', 'radar_voice_gender', 'radar_voice_accent',
        'brand_primary_color', 'brand_accent_color', 'brand_font', 'brand_style_note',
        'brand_logo_dark_url', 'brand_logo_white_url',
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
        'pricing_tier_4_name', 'pricing_tier_4_price', 'pricing_tier_4_tagline', 'pricing_tier_4_features',
        'pricing_currency', 'pricing_tier_1_amount',
        'home_pricing_eyebrow', 'home_pricing_title', 'home_pricing_note',
        'lisa_page_eyebrow', 'lisa_page_subheadline', 'lisa_page_service_pitch', 'lisa_page_integrations_disclaimer',
        'lisa_pricing_eyebrow', 'lisa_pricing_title',
        'lisa_tier_1_name', 'lisa_tier_1_price_ghs', 'lisa_tier_1_price_usd', 'lisa_tier_1_tagline', 'lisa_tier_1_features',
        'lisa_tier_2_name', 'lisa_tier_2_price_ghs', 'lisa_tier_2_price_usd', 'lisa_tier_2_tagline', 'lisa_tier_2_features',
        'lisa_tier_3_name', 'lisa_tier_3_price_ghs', 'lisa_tier_3_price_usd', 'lisa_tier_3_tagline', 'lisa_tier_3_features',
        'lisa_custom_tier_name', 'lisa_custom_tier_tagline', 'lisa_custom_tier_features', 'lisa_custom_tier_cta_label',
        'archive_eyebrow', 'archive_title',
        'archive_1_domain', 'archive_1_meta', 'archive_1_title', 'archive_1_desc', 'archive_1_link', 'archive_1_metric', 'archive_1_metric_label',
        'archive_2_domain', 'archive_2_meta', 'archive_2_title', 'archive_2_desc', 'archive_2_link', 'archive_2_metric', 'archive_2_metric_label',
        'archive_3_domain', 'archive_3_meta', 'archive_3_title', 'archive_3_desc', 'archive_3_link', 'archive_3_metric', 'archive_3_metric_label',
        'production_eyebrow', 'production_title',
        'live_demo_eyebrow', 'live_demo_title', 'live_demo_desc', 'live_demo_metric_label', 'live_demo_metric_text', 'live_demo_console_label',
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

    /**
     * GET /api/v1/admin/agent-capabilities — which integrations are
     * actually configured right now, and which agents depend on each, so
     * a gap is visible here instead of only being discovered the next time
     * an agent that needs it happens to run.
     */
    public static function capabilities(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(['capabilities' => AgentCapabilities::status()]);
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
            if (in_array($key, ['smtp_gmail_address', 'mail_from'], true)
                && $value !== '' && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
                Response::error('Enter a valid email address.', 422);
            }
            if ($key === 'mail_from_name' && preg_match('/[\r\n]/', $value)) {
                Response::error('Sender name cannot contain line breaks.', 422);
            }
            if ($key === 'chat_persona' && mb_strlen($value) > LisaInstructions::MAX_LENGTH) {
                Response::error('Lisa custom instructions must be 4,000 characters or fewer.', 422);
            }
            if ($key === 'whatsapp_provider' && !in_array($value, ['twilio', 'whapi', 'elevenlabs'], true)) {
                Response::error('Choose Twilio, Whapi, or ElevenLabs as the WhatsApp provider.', 422);
            }
            if ($key === 'whapi_webhook_secret' && $value !== '' && mb_strlen($value) < 24) {
                Response::error('The Whapi webhook secret must be at least 24 characters.', 422);
            }
            if ($key === 'elevenlabs_webhook_secret' && $value !== '' && mb_strlen($value) < 24) {
                Response::error('The ElevenLabs webhook secret must be at least 24 characters.', 422);
            }
            if ($key === 'smtp_port' && $value !== ''
                && (!is_numeric($value) || (int) $value < 1 || (int) $value > 65535)) {
                Response::error('SMTP port must be a number between 1 and 65535.', 422);
            }
            if ($key === 'monthly_revenue_target'
                && (!is_numeric($value) || (float) $value < 0 || (float) $value > 999999999)) {
                Response::error('Revenue target must be a valid positive amount.', 422);
            }
            if ($key === 'external_expense_monthly_budget' && $value !== ''
                && (!is_numeric($value) || (float) $value < 0 || (float) $value > 999999999)) {
                Response::error('Expense budget must be a valid positive amount.', 422);
            }
            if ($key === 'weekly_billable_hours' && $value !== ''
                && (!is_numeric($value) || (float) $value <= 0 || (float) $value > 168)) {
                Response::error('Weekly billable hours must be a positive number, at most 168.', 422);
            }
            if ($key === 'twilio_balance_alert_threshold' && $value !== ''
                && (!is_numeric($value) || (float) $value < 0 || (float) $value > 999999)) {
                Response::error('Balance alert threshold must be a valid positive amount.', 422);
            }
            if ($key === 'stale_lead_followup_days' && $value !== ''
                && (!ctype_digit($value) || (int) $value < 1 || (int) $value > 90)) {
                Response::error('Stale-lead follow-up window must be a whole number of days between 1 and 90.', 422);
            }
            if ($key === 'revenue_target_currency') {
                $value = strtoupper($value);
                if (!preg_match('/^[A-Z]{3}$/', $value)) {
                    Response::error('Choose a valid three-letter currency.', 422);
                }
            }
            if ($key === 'external_expense_currency') {
                $value = strtoupper($value);
                if (!preg_match('/^[A-Z]{3}$/', $value)) {
                    Response::error('Expense currency must be a three-letter code such as USD or GHS.', 422);
                }
            }
            $maxLength = str_starts_with($key, 'email_tpl_') ? 20000 : 5000;
            if (mb_strlen($value) > $maxLength) {
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

    /**
     * GET /api/v1/admin/email-template-defaults
     * The built-in copy for every template, shown as placeholders in the
     * editor so the admin can see the starting text before overriding. These
     * are display-only — leaving a field blank still uses the built-in.
     */
    public static function emailTemplateDefaults(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(EmailTemplate::defaults());
    }

    /**
     * POST /api/v1/admin/settings/test-email
     * Sends a sample of one email template to the admin's own inbox so the
     * branded design can be checked in a real mail client. Body:
     *   { key: "invoice_send", subject?, html?, text? }
     * The optional subject/html/text let the button preview unsaved edits;
     * blank ones fall back to the built-in template.
     */
    public static function sendTestEmail(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $key = trim((string) ($data['key'] ?? ''));
        if (!isset(EmailTemplate::defaults()[$key])) {
            Response::error('Unknown email template.', 422);
        }

        // Deliver to the admin's own inbox — the notification address if set,
        // otherwise the login email. Never to an address from the request body.
        $to = Settings::get('notification_email') ?: (string) ($user['email'] ?? '');
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            Response::error('No valid admin inbox found. Set a notification email under Integrations first.', 422);
        }

        $rendered = EmailTemplate::preview($key, [
            'subject' => (string) ($data['subject'] ?? ''),
            'html' => (string) ($data['html'] ?? ''),
            'text' => (string) ($data['text'] ?? ''),
        ], EmailTemplate::sampleVars($to));

        $sent = Mailer::sendHtml($to, '[TEST] ' . $rendered['subject'], $rendered['html'], $rendered['text']);
        if (!$sent) {
            Response::error('Could not send — check that Gmail SMTP is configured under Email delivery.', 502);
        }

        ActivityLog::log($user, 'sent', 'test_email', null, null, ['template' => $key, 'to' => $to]);
        Response::json(['status' => 'sent', 'to' => $to]);
    }
}
