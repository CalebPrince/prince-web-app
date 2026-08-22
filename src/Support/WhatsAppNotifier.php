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
 * The two providers differ in kind, not just in endpoint. Whapi sends free
 * text, so the caller's fully composed $body goes out as written. ElevenLabs
 * sends an approved Meta template, whose placeholders are fixed at approval
 * time, so the same alert has to arrive as discrete $fields the template can
 * interpolate. Callers supply both: the prose for Whapi, the parts for Meta.
 */
class WhatsAppNotifier
{
    public static function provider(): string
    {
        return Settings::get('whatsapp_provider') === 'elevenlabs' ? 'elevenlabs' : 'whapi';
    }

    public static function isOwnerConfigured(): bool
    {
        if (self::address((string) Settings::get('owner_whatsapp_number')) === null) {
            return false;
        }
        return self::provider() === 'elevenlabs'
            ? ElevenLabsWhatsAppClient::isConfigured()
            : trim((string) Settings::get('whapi_api_token')) !== '';
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

        return WhapiClient::sendText($recipient, $body)['ok'];
    }

    public static function address(string $value): ?string
    {
        $value = preg_replace('/^whatsapp:/i', '', trim($value)) ?? '';
        $number = preg_replace('/[\s().-]+/', '', $value) ?? '';
        return preg_match('/^\+[1-9]\d{7,14}$/', $number) ? 'whatsapp:' . $number : null;
    }
}
