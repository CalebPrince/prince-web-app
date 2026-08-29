<?php

declare(strict_types=1);

namespace App\Support;

/**
 * WATI (WhatsApp Team Inbox) API v3 client. Mirrors WhapiClient.php's shape
 * so LiveChatController can treat WATI as just another whatsapp_provider
 * option. Base URL is tenant-specific (e.g.
 * https://live-mt-server-XXXXX.wati.io/XXXXX) — copy it from Wati's own API
 * docs page (Connector -> API) into the wati_api_endpoint setting exactly as
 * shown there, no trailing slash required.
 */
final class WatiClient
{
    public static function isConfigured(): bool
    {
        return trim((string) Settings::get('wati_api_endpoint')) !== ''
            && trim((string) Settings::get('wati_api_token')) !== '';
    }

    /**
     * Free-form reply within WhatsApp's 24h customer-service window.
     * Confirmed against Wati's live API docs (2026-08): POST
     * {endpoint}/api/ext/v3/conversations/messages/text, body
     * {target, text}, target accepts a bare phone number.
     *
     * @return array{ok:bool,id:?string,error:?string}
     */
    public static function sendText(string $recipient, string $body): array
    {
        $digits = preg_replace('/\D+/', '', $recipient) ?? '';
        $body = trim($body);
        if (!preg_match('/^[1-9]\d{7,14}$/', $digits) || $body === '') {
            return ['ok' => false, 'id' => null, 'error' => 'Recipient or message is missing/invalid.'];
        }

        $response = self::request('POST', '/api/ext/v3/conversations/messages/text', [
            'target' => $digits,
            'text' => mb_substr($body, 0, 4096),
        ]);
        if (!$response['ok']) {
            return ['ok' => false, 'id' => null, 'error' => $response['error']];
        }

        $data = $response['data'];
        return [
            'ok' => true,
            'id' => isset($data['id']) ? (string) $data['id']
                : (isset($data['messageId']) ? (string) $data['messageId'] : null),
            'error' => null,
        ];
    }

    /**
     * Business-initiated first contact, outside any open session — WhatsApp
     * requires a pre-approved template for this (free text is rejected).
     * Field names for the V3 messageTemplates/send endpoint are confirmed
     * for template_name/broadcast_name/recipients; the exact per-recipient
     * key for template variable substitution wasn't visible in the docs
     * excerpt fetched during setup (only recipients[].phone_number/target
     * were documented) — $parameters is passed through as
     * recipients[0].parameters as a best guess and should be checked against
     * Wati's Postman collection or a real send before relying on template
     * variables in production.
     *
     * @param array<string,string> $parameters
     * @return array{ok:bool,id:?string,error:?string}
     */
    public static function sendTemplate(
        string $recipient,
        string $templateName,
        string $broadcastName,
        array $parameters = []
    ): array {
        $digits = preg_replace('/\D+/', '', $recipient) ?? '';
        $templateName = trim($templateName);
        $broadcastName = trim($broadcastName);
        if (!preg_match('/^[1-9]\d{7,14}$/', $digits) || $templateName === '' || $broadcastName === '') {
            return ['ok' => false, 'id' => null, 'error' => 'Recipient, template name, or broadcast name is missing.'];
        }

        $recipientObj = ['phone_number' => $digits];
        if ($parameters !== []) {
            $recipientObj['parameters'] = $parameters;
        }

        $response = self::request('POST', '/api/ext/v3/messageTemplates/send', [
            'template_name' => $templateName,
            'broadcast_name' => $broadcastName,
            'recipients' => [$recipientObj],
        ]);
        if (!$response['ok']) {
            return ['ok' => false, 'id' => null, 'error' => $response['error']];
        }

        $data = $response['data'];
        return [
            'ok' => true,
            'id' => isset($data['id']) ? (string) $data['id']
                : (isset($data['broadcastId']) ? (string) $data['broadcastId'] : null),
            'error' => null,
        ];
    }

    /**
     * Send a media file (used for ElevenLabs-voiced reply audio) into an
     * open conversation. Field names unconfirmed against a live call — same
     * caveat as sendTemplate() above; check Admin -> Error Logs after the
     * first real send and adjust if Wati rejects the shape.
     *
     * @return array{ok:bool,id:?string,error:?string}
     */
    public static function sendFileByUrl(string $recipient, string $fileUrl, string $caption = ''): array
    {
        $digits = preg_replace('/\D+/', '', $recipient) ?? '';
        $fileUrl = trim($fileUrl);
        if (!preg_match('/^[1-9]\d{7,14}$/', $digits) || $fileUrl === '') {
            return ['ok' => false, 'id' => null, 'error' => 'Recipient or file URL is missing.'];
        }

        $response = self::request('POST', '/api/ext/v3/conversations/messages/file-url', [
            'target' => $digits,
            'url' => $fileUrl,
            'caption' => mb_substr(trim($caption), 0, 1024),
        ]);
        if (!$response['ok']) {
            return ['ok' => false, 'id' => null, 'error' => $response['error']];
        }

        $data = $response['data'];
        return [
            'ok' => true,
            'id' => isset($data['id']) ? (string) $data['id'] : null,
            'error' => null,
        ];
    }

    /** @return array{ok:bool,data:array<mixed>,error:?string} */
    private static function request(string $method, string $path, array $body): array
    {
        $base = rtrim(trim((string) Settings::get('wati_api_endpoint')), '/');
        $token = trim((string) Settings::get('wati_api_token'));
        if ($base === '' || $token === '') {
            return ['ok' => false, 'data' => [], 'error' => 'Wati API endpoint or token is not configured.'];
        }
        if (!function_exists('curl_init')) {
            return ['ok' => false, 'data' => [], 'error' => 'PHP cURL is unavailable.'];
        }

        $ch = curl_init($base . $path);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $token,
                'Content-Type: application/json',
            ],
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        $response = is_string($raw) ? json_decode($raw, true) : null;
        if ($raw === false || $status < 200 || $status >= 300) {
            $error = $curlError ?: (string) ($response['title'] ?? $response['message'] ?? $response['error'] ?? $raw);
            error_log('Wati API call failed: ' . $method . ' ' . $path . ' HTTP ' . $status . ' ' . mb_substr($error, 0, 800));
            return ['ok' => false, 'data' => [], 'error' => mb_substr($error, 0, 500)];
        }

        return ['ok' => true, 'data' => is_array($response) ? $response : [], 'error' => null];
    }
}
