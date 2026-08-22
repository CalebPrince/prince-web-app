<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Sends an approved Meta template through ElevenLabs' WhatsApp agent, the same
 * endpoint LiveChatController::sendIntro() uses for lead intros.
 *
 * Templates, unlike Whapi's free text, have a fixed number of body
 * placeholders fixed at Meta approval time — send the wrong count and Meta
 * rejects the whole message. Which fields fill those placeholders is therefore
 * configuration, not code: `elevenlabs_whatsapp_alert_template_params` is an
 * ordered, comma-separated list of field names mapping to {{1}}, {{2}} and so
 * on, so a template of any shape is a settings change rather than a patch.
 *
 * Note this endpoint does not merely deliver a message: it opens an agent
 * conversation with the recipient, so a reply talks to the WhatsApp agent.
 * That is inherent to routing owner alerts through convai rather than posting
 * the template to Meta directly.
 */
final class ElevenLabsWhatsAppClient
{
    /** Field names accepted in elevenlabs_whatsapp_alert_template_params. */
    public const FIELDS = ['name', 'email', 'phone', 'reason', 'summary', 'message'];

    public static function isConfigured(): bool
    {
        foreach (['elevenlabs_api_key', 'elevenlabs_whatsapp_agent_id', 'elevenlabs_whatsapp_phone_number_id', 'elevenlabs_whatsapp_alert_template_name'] as $key) {
            if (trim((string) Settings::get($key)) === '') {
                return false;
            }
        }
        return true;
    }

    /**
     * The configured owner alert: template and placeholder order come from
     * Settings.
     *
     * @param array<string,string> $fields Values keyed by the names in FIELDS.
     * @return array{ok:bool,id:?string,error:?string}
     */
    public static function sendOwnerTemplate(string $recipient, array $fields): array
    {
        if (!self::isConfigured()) {
            return ['ok' => false, 'id' => null, 'error' => 'ElevenLabs WhatsApp alert settings are incomplete.'];
        }
        return self::sendTemplate(
            $recipient,
            trim((string) Settings::get('elevenlabs_whatsapp_alert_template_name')),
            trim((string) Settings::get('elevenlabs_whatsapp_alert_template_lang')) ?: 'en',
            self::paramOrder(),
            $fields
        );
    }

    /**
     * Send any approved template to any number. Split out from
     * sendOwnerTemplate so the pipeline — credentials, agent, phone number ID,
     * number format, placeholder count — can be proved against a template that
     * is already approved, without first writing a template name into the
     * settings that real handoffs read.
     *
     * @param list<string>         $order  Field names filling {{1}}, {{2}}, ...
     * @param array<string,string> $fields Values keyed by the names in FIELDS.
     * @return array{ok:bool,id:?string,error:?string}
     */
    public static function sendTemplate(
        string $recipient,
        string $templateName,
        string $languageCode,
        array $order,
        array $fields
    ): array {
        $to = preg_replace('/\D+/', '', $recipient) ?? '';
        if (!preg_match('/^[1-9]\d{7,14}$/', $to)) {
            return ['ok' => false, 'id' => null, 'error' => 'Recipient WhatsApp number is missing or malformed.'];
        }
        if ($templateName === '') {
            return ['ok' => false, 'id' => null, 'error' => 'No template name given.'];
        }
        foreach (['elevenlabs_api_key', 'elevenlabs_whatsapp_agent_id', 'elevenlabs_whatsapp_phone_number_id'] as $key) {
            if (trim((string) Settings::get($key)) === '') {
                return ['ok' => false, 'id' => null, 'error' => "Setting {$key} is empty."];
            }
        }
        if (!function_exists('curl_init')) {
            return ['ok' => false, 'id' => null, 'error' => 'PHP cURL is unavailable.'];
        }

        $parameters = [];
        foreach ($order as $field) {
            // Meta rejects an empty placeholder outright, and newlines are not
            // allowed inside a body parameter, so each value is flattened and
            // given a filler when the conversation did not supply it.
            $value = trim((string) ($fields[$field] ?? ''));
            $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
            if ($value === '') {
                $value = '—';
            }
            $parameters[] = ['type' => 'text', 'text' => mb_substr($value, 0, 900)];
        }

        $payload = json_encode([
            'agent_id' => trim((string) Settings::get('elevenlabs_whatsapp_agent_id')),
            'whatsapp_phone_number_id' => trim((string) Settings::get('elevenlabs_whatsapp_phone_number_id')),
            'whatsapp_user_id' => $to,
            'template_name' => $templateName,
            'template_language_code' => $languageCode ?: 'en',
            'template_params' => $parameters === []
                ? []
                : [['type' => 'body', 'parameters' => $parameters]],
        ], JSON_UNESCAPED_UNICODE);

        $ch = curl_init('https://api.elevenlabs.io/v1/convai/whatsapp/outbound-message');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'xi-api-key: ' . trim((string) Settings::get('elevenlabs_api_key'))],
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        // No curl_close() — deprecated since PHP 8.0, and on 8.5 it emits a
        // notice that has leaked into JSON responses here before.

        $response = is_string($raw) ? json_decode($raw, true) : null;
        $conversationId = is_array($response) ? (string) ($response['conversation_id'] ?? '') : '';

        if ($raw === false || $status < 200 || $status >= 300 || $conversationId === '') {
            $error = $curlError
                ?: (string) ($response['detail']['message'] ?? $response['message'] ?? $raw);
            error_log('ElevenLabs owner WhatsApp alert failed: HTTP ' . $status . ' ' . mb_substr($error, 0, 800));
            return ['ok' => false, 'id' => null, 'error' => mb_substr($error, 0, 500)];
        }

        return ['ok' => true, 'id' => $conversationId, 'error' => null];
    }

    /**
     * The configured placeholder order, filtered to names this class knows.
     * Defaults to a single placeholder carrying the whole summary, which is
     * the shape of a one-parameter template.
     *
     * @return list<string>
     */
    public static function paramOrder(): array
    {
        $raw = trim((string) Settings::get('elevenlabs_whatsapp_alert_template_params'));
        if ($raw === '') {
            return ['summary'];
        }
        $order = [];
        foreach (explode(',', $raw) as $part) {
            $field = strtolower(trim($part));
            if ($field !== '' && in_array($field, self::FIELDS, true)) {
                $order[] = $field;
            }
        }
        return $order;
    }
}
