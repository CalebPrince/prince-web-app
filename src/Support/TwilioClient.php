<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Twilio WhatsApp Business API client. Mirrors WhapiClient/WatiClient's shape
 * so LiveChatController can treat Twilio as just another whatsapp_provider
 * option — adding it does not disturb ElevenLabs, which stays the active
 * provider until whatsapp_provider is switched.
 *
 * Two settings do the work: twilio_account_sid + twilio_auth_token (Console
 * dashboard) authenticate every call over HTTP Basic, and
 * twilio_whatsapp_number is the WhatsApp-enabled sender the replies go out
 * from (either the sandbox number or an approved WhatsApp sender).
 *
 * Unlike Whapi and Wati, Twilio signs its inbound webhooks rather than
 * relying on a shared secret, so verifySignature() below is the webhook's
 * authentication — there is no separate twilio_webhook_secret setting.
 */
final class TwilioClient
{
    private const API_BASE = 'https://api.twilio.com/2010-04-01';

    public static function isConfigured(): bool
    {
        return trim((string) Settings::get('twilio_account_sid')) !== ''
            && trim((string) Settings::get('twilio_auth_token')) !== '';
    }

    /** The configured WhatsApp sender, as bare digits, or '' when unset. */
    public static function senderDigits(): string
    {
        return preg_replace('/\D+/', '', (string) Settings::get('twilio_whatsapp_number')) ?? '';
    }

    /**
     * Free-form reply within WhatsApp's 24h customer-service window.
     *
     * @param string|null $from Sender override in bare digits — the inbound
     *        message's own `To` number, so a reply still goes out from the
     *        right sender before twilio_whatsapp_number has been filled in.
     * @return array{ok:bool,id:?string,error:?string}
     */
    public static function sendText(string $recipient, string $body, ?string $from = null): array
    {
        $to = preg_replace('/\D+/', '', $recipient) ?? '';
        $sender = $from !== null && $from !== '' ? (preg_replace('/\D+/', '', $from) ?? '') : self::senderDigits();
        $body = trim($body);
        if (!preg_match('/^[1-9]\d{7,14}$/', $to) || $sender === '' || $body === '') {
            return ['ok' => false, 'id' => null, 'error' => 'Twilio sender, recipient, or message is missing.'];
        }

        return self::createMessage([
            'To' => 'whatsapp:+' . $to,
            'From' => 'whatsapp:+' . $sender,
            // Twilio caps a single WhatsApp body at 1600 characters.
            'Body' => mb_substr($body, 0, 1600),
        ]);
    }

    /**
     * Free-form reply carrying one media attachment (a document, image, etc.)
     * within WhatsApp's 24h customer-service window. $mediaUrl must be a
     * publicly reachable HTTPS URL — Twilio fetches it server-side and
     * forwards it to WhatsApp, so it cannot be behind auth. WhatsApp allows a
     * single media item per message; $caption rides along as the body text.
     *
     * @return array{ok:bool,id:?string,error:?string}
     */
    public static function sendMedia(string $recipient, string $mediaUrl, string $caption = '', ?string $from = null): array
    {
        $to = preg_replace('/\D+/', '', $recipient) ?? '';
        $sender = $from !== null && $from !== '' ? (preg_replace('/\D+/', '', $from) ?? '') : self::senderDigits();
        $mediaUrl = trim($mediaUrl);
        if (!preg_match('/^[1-9]\d{7,14}$/', $to) || $sender === '' || !preg_match('#^https://#i', $mediaUrl)) {
            return ['ok' => false, 'id' => null, 'error' => 'Twilio sender, recipient, or media URL is missing or not HTTPS.'];
        }

        $params = [
            'To' => 'whatsapp:+' . $to,
            'From' => 'whatsapp:+' . $sender,
            'MediaUrl' => $mediaUrl,
        ];
        $caption = trim($caption);
        if ($caption !== '') {
            $params['Body'] = mb_substr($caption, 0, 1600);
        }

        return self::createMessage($params);
    }

    /**
     * Business-initiated first contact, outside any open session — WhatsApp
     * requires a pre-approved template for this (free text is rejected).
     * Twilio delivers templates through the Content API: $contentSid is the
     * HX... id of an approved template, and $variables maps its numbered
     * placeholders ({{1}}, {{2}}, ...) to values.
     *
     * @param array<string|int,string> $variables
     * @return array{ok:bool,id:?string,error:?string}
     */
    public static function sendTemplate(
        string $recipient,
        string $contentSid,
        array $variables = [],
        ?string $from = null
    ): array {
        $to = preg_replace('/\D+/', '', $recipient) ?? '';
        $sender = $from !== null && $from !== '' ? (preg_replace('/\D+/', '', $from) ?? '') : self::senderDigits();
        $contentSid = trim($contentSid);
        if (!preg_match('/^[1-9]\d{7,14}$/', $to) || $sender === '' || $contentSid === '') {
            return ['ok' => false, 'id' => null, 'error' => 'Twilio sender, recipient, or content SID is missing.'];
        }

        $params = [
            'To' => 'whatsapp:+' . $to,
            'From' => 'whatsapp:+' . $sender,
            'ContentSid' => $contentSid,
        ];
        if ($variables !== []) {
            $params['ContentVariables'] = json_encode($variables, JSON_UNESCAPED_UNICODE);
        }

        return self::createMessage($params);
    }

    /**
     * Twilio's own request signature (X-Twilio-Signature): HMAC-SHA1 of the
     * exact webhook URL with every POST parameter appended in sorted
     * key-then-value order, keyed on the account's auth token, base64'd.
     *
     * The URL has to match what Twilio was configured to call, byte for
     * byte, which is the usual cause of a false rejection behind a proxy —
     * hence the twilio_webhook_url override and the caller logging the URL
     * it actually hashed when this returns false.
     *
     * @param array<string,mixed> $params Raw $_POST for the request.
     */
    public static function verifySignature(string $url, array $params, string $signature): bool
    {
        $token = trim((string) Settings::get('twilio_auth_token'));
        $signature = trim($signature);
        if ($token === '' || $signature === '') {
            return false;
        }

        ksort($params);
        $data = $url;
        foreach ($params as $key => $value) {
            // Twilio never sends nested values on a message webhook; skip
            // anything that isn't stringable rather than guess at a shape.
            if (is_array($value) || is_object($value)) {
                continue;
            }
            $data .= $key . (string) $value;
        }

        return hash_equals(base64_encode(hash_hmac('sha1', $data, $token, true)), $signature);
    }

    /**
     * The absolute URL Twilio signed. Prefers the twilio_webhook_url setting
     * when set, so a mismatched proxy header can be corrected without a code
     * change; otherwise reconstructed the same way the rest of the app builds
     * absolute URLs (see ShortLink::absoluteUrl()).
     */
    public static function webhookUrl(): string
    {
        $configured = trim((string) Settings::get('twilio_webhook_url'));
        if ($configured !== '') {
            return $configured;
        }

        $host = $_SERVER['HTTP_HOST'] ?? 'princecaleb.dev';
        $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https' ? 'https' : 'http';
        if ($host === 'princecaleb.dev' || str_ends_with($host, '.princecaleb.dev')) {
            $scheme = 'https';
        }

        return $scheme . '://' . $host . ($_SERVER['REQUEST_URI'] ?? '');
    }

    /**
     * @param array<string,string> $params
     * @return array{ok:bool,id:?string,error:?string}
     */
    private static function createMessage(array $params): array
    {
        $accountSid = trim((string) Settings::get('twilio_account_sid'));
        $token = trim((string) Settings::get('twilio_auth_token'));
        if ($accountSid === '' || $token === '') {
            return ['ok' => false, 'id' => null, 'error' => 'Twilio account SID or auth token is not configured.'];
        }
        if (!function_exists('curl_init')) {
            return ['ok' => false, 'id' => null, 'error' => 'PHP cURL is unavailable.'];
        }

        $ch = curl_init(self::API_BASE . '/Accounts/' . rawurlencode($accountSid) . '/Messages.json');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            // Twilio's REST API takes form encoding, not JSON.
            CURLOPT_POSTFIELDS => http_build_query($params),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_USERPWD => $accountSid . ':' . $token,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        $response = is_string($raw) ? json_decode($raw, true) : null;
        if ($raw === false || $status < 200 || $status >= 300) {
            $error = $curlError ?: trim(sprintf(
                '%s %s',
                isset($response['code']) ? '[' . $response['code'] . ']' : '',
                (string) ($response['message'] ?? $raw)
            ));
            error_log('Twilio send failed: HTTP ' . $status . ' ' . mb_substr($error, 0, 800));
            return ['ok' => false, 'id' => null, 'error' => mb_substr($error, 0, 500)];
        }

        return [
            'ok' => true,
            'id' => isset($response['sid']) ? (string) $response['sid'] : null,
            'error' => null,
        ];
    }
}
