<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Private operational alerts to the owner's WhatsApp.
 *
 * Routes on the same `whatsapp_provider` setting the inbound webhooks already
 * respect. Until now this class went straight to Whapi regardless, so a site
 * running on ElevenLabs had no working owner-alert path at all and every
 * handoff silently lost its WhatsApp leg.
 *
 * The providers differ in kind, not just in endpoint. Whapi and Twilio send
 * free text, so the caller's fully composed $body goes out as written.
 * ElevenLabs sends an approved Meta template, whose placeholders are fixed at
 * approval time, so the same alert has to arrive as discrete $fields the
 * template can interpolate. Callers supply both: the prose for the free-text
 * providers, the parts for Meta.
 *
 * Wati is deliberately absent here: it is selectable as an inbound
 * whatsapp_provider but has never been wired into owner alerts, so a site
 * running on Wati still falls through to Whapi for them.
 */
class WhatsAppNotifier
{
    public static function provider(): string
    {
        $provider = (string) Settings::get('whatsapp_provider');
        return in_array($provider, ['elevenlabs', 'twilio'], true) ? $provider : 'whapi';
    }

    public static function isOwnerConfigured(): bool
    {
        if (self::address((string) Settings::get('owner_whatsapp_number')) === null) {
            return false;
        }
        return match (self::provider()) {
            'elevenlabs' => ElevenLabsWhatsAppClient::isConfigured(),
            'twilio' => TwilioClient::isConfigured(),
            default => trim((string) Settings::get('whapi_api_token')) !== '',
        };
    }

    /**
     * @param array<string,string> $fields Parts of the alert, for providers
     *        that send a template rather than free text. Ignored by Whapi.
     *        Recognised names are in ElevenLabsWhatsAppClient::FIELDS.
     */
    public static function sendOwnerAlert(string $body, array $fields = []): bool
    {
        $recipient = (string) Settings::get('owner_whatsapp_number');

        if (self::provider() === 'elevenlabs') {
            // A template still needs something to say when a caller predates
            // the $fields parameter: fall back to the prose it composed.
            if ($fields === []) {
                $fields = ['summary' => $body, 'message' => $body];
            }
            return ElevenLabsWhatsAppClient::sendOwnerTemplate($recipient, $fields)['ok'];
        }

        if (self::provider() === 'twilio') {
            // Free text only delivers inside Meta's 24h service window, and
            // Twilio accepts an out-of-window message (HTTP 201) then fails
            // it later with 63016, so this method reported success for
            // alerts that never arrived (Chief/Chloe went silent that way).
            // An approved template is the only reliable path, so prefer it
            // and keep free text as the fallback until it is approved.
            if (self::ownerAlertTemplateApproved()) {
                $sent = TwilioClient::sendTemplate($recipient, trim((string) Settings::get('twilio_owner_alert_content_sid')), [
                    '1' => self::singleLine((string) ($fields['name'] ?? 'Your assistant'), 60),
                    '2' => rtrim(self::singleLine((string) ($fields['reason'] ?? 'New update'), 120), '.!? '),
                    // The template's next sentence follows this variable directly.
                    '3' => preg_replace('/([^.!?…])$/u', '$1.', self::singleLine((string) ($fields['summary'] ?? $fields['message'] ?? $body), 500)),
                ]);
                if ($sent['ok']) {
                    return true;
                }
                error_log('Owner alert template send failed, trying free text: ' . ($sent['error'] ?? 'unknown'));
            }
            return TwilioClient::sendText($recipient, $body)['ok'];
        }

        return WhapiClient::sendText($recipient, $body)['ok'];
    }

    /** WhatsApp template variables can't hold newlines or long runs of spaces. */
    private static function singleLine(string $value, int $max): string
    {
        $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
        if ($value === '') {
            $value = '-';
        }
        return mb_strlen($value) > $max ? rtrim(mb_substr($value, 0, $max - 1)) . '…' : $value;
    }

    /**
     * True once Meta has approved the owner-alert template. The stored status
     * only changes when someone presses Refresh, so a still-pending template
     * is re-checked here at most every 15 minutes, letting alerts switch over
     * on their own the moment approval lands.
     */
    private static function ownerAlertTemplateApproved(): bool
    {
        if (trim((string) Settings::get('twilio_owner_alert_content_sid')) === '') {
            return false;
        }
        $status = (string) Settings::get('twilio_owner_alert_template_status');
        if ($status === 'approved') {
            return true;
        }
        if ($status !== 'pending' && $status !== '') {
            return false;
        }
        $checkedAt = (int) Settings::get('twilio_owner_alert_template_checked_at');
        if (time() - $checkedAt < 900) {
            return false;
        }
        Settings::set('twilio_owner_alert_template_checked_at', (string) time());
        try {
            return (WhatsAppOwnerAlertTemplateManager::refresh()['status'] ?? '') === 'approved';
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function address(string $value): ?string
    {
        $value = preg_replace('/^whatsapp:/i', '', trim($value)) ?? '';
        $number = preg_replace('/[\s().-]+/', '', $value) ?? '';
        return preg_match('/^\+[1-9]\d{7,14}$/', $number) ? 'whatsapp:' . $number : null;
    }
}
