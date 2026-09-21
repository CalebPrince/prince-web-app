<?php

declare(strict_types=1);

namespace App\Support;

/**
 * The one template every agent's owner alert (Chief, Chloe, Allie, Wendy,
 * Lisa handoffs, social draft reminders) can fall back on. Plain text to the
 * owner only works inside WhatsApp's 24h session window, and Twilio accepts
 * an out-of-window message (HTTP 201) then fails it later (error 63016), so
 * the app believed those alerts were delivered when they were not. A
 * template is the only thing WhatsApp lets a business send at any time.
 *
 * WhatsAppNotifier::sendOwnerAlert() fills it from the same name/reason/
 * summary fields the callers already pass, so no agent needed changing. The
 * variables must be single-line (WhatsApp rejects newlines in them), which
 * is why long briefs arrive as a short summary; the full text still goes by
 * email.
 */
final class WhatsAppOwnerAlertTemplateManager extends WhatsAppContentTemplateManager
{
    protected const NAME = 'owner_alert';
    protected const LANGUAGE = 'en';
    protected const CATEGORY = 'UTILITY';

    protected const BODY = "Update from {{1}}: {{2}}. Details: {{3}} Open your admin dashboard to review.";

    protected const BUTTON_TEXT = 'Open admin';
    protected const BUTTON_URL = 'https://princecaleb.dev/admin';

    protected const SAMPLE_VARIABLES = [
        '1' => 'Chief',
        '2' => 'Daily report ready',
        '3' => 'Three leads replied and one site had a short outage overnight.',
    ];
    protected const SID_SETTING = 'twilio_owner_alert_content_sid';
    protected const STATUS_SETTING = 'twilio_owner_alert_template_status';
}
