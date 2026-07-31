<?php

declare(strict_types=1);

namespace App\Support;

/** Sends private operational alerts through Lisa's Twilio WhatsApp sender. */
class WhatsAppNotifier
{
    public static function isOwnerConfigured(): bool
    {
        if (Settings::get('whatsapp_provider') === 'whapi') {
            return trim((string) Settings::get('whapi_api_token')) !== ''
                && self::address((string) Settings::get('owner_whatsapp_number')) !== null;
        }
        return trim((string) Settings::get('twilio_account_sid')) !== ''
            && trim((string) Settings::get('twilio_auth_token')) !== ''
            && self::address((string) Settings::get('twilio_whatsapp_number')) !== null
            && self::address((string) Settings::get('owner_whatsapp_number')) !== null;
    }

    public static function sendOwnerAlert(string $body): bool
    {
        if (Settings::get('whatsapp_provider') === 'whapi') {
            $result = WhapiClient::sendText((string) Settings::get('owner_whatsapp_number'), $body);
            return $result['ok'];
        }
        $accountSid = trim((string) Settings::get('twilio_account_sid'));
        $authToken = trim((string) Settings::get('twilio_auth_token'));
        $from = self::address((string) Settings::get('twilio_whatsapp_number'));
        $to = self::address((string) Settings::get('owner_whatsapp_number'));

        if ($accountSid === '' || $authToken === '' || $from === null || $to === null) {
            error_log('WhatsApp handoff alert skipped: Twilio or owner WhatsApp settings are incomplete.');
            return false;
        }
        if (!preg_match('/^AC[0-9a-fA-F]{32}$/', $accountSid) || !function_exists('curl_init')) {
            error_log('WhatsApp handoff alert skipped: invalid Twilio Account SID or PHP cURL is unavailable.');
            return false;
        }

        $ch = curl_init("https://api.twilio.com/2010-04-01/Accounts/{$accountSid}/Messages.json");
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query([
                'From' => $from,
                'To' => $to,
                'Body' => mb_substr(trim($body), 0, 1500),
            ]),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_USERPWD => $accountSid . ':' . $authToken,
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        $response = is_string($raw) ? json_decode($raw, true) : null;
        if ($raw === false || $status < 200 || $status >= 300 || !is_array($response) || empty($response['sid'])) {
            error_log('WhatsApp handoff alert failed: ' . ($error ?: (string) $raw));
            return false;
        }
        return true;
    }

    /** @return array{ok:bool,sid:?string,status:?string,error:?string} */
    public static function sendTemplate(string $recipient, string $contentSid, array $variables): array
    {
        $accountSid = trim((string) Settings::get('twilio_account_sid'));
        $authToken = trim((string) Settings::get('twilio_auth_token'));
        $from = self::address((string) Settings::get('twilio_whatsapp_number'));
        $to = self::address($recipient);
        if (!preg_match('/^AC[0-9a-fA-F]{32}$/', $accountSid)
            || $authToken === '' || $from === null || $to === null
            || !preg_match('/^HX[0-9a-fA-F]{32}$/', $contentSid)
            || !function_exists('curl_init')) {
            return ['ok' => false, 'sid' => null, 'status' => null, 'error' => 'Twilio, recipient, or template settings are incomplete.'];
        }
        $callback = 'https://princecaleb.dev/api/v1/whatsapp/status';
        $ch = curl_init("https://api.twilio.com/2010-04-01/Accounts/{$accountSid}/Messages.json");
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query([
                'From' => $from,
                'To' => $to,
                'ContentSid' => $contentSid,
                'ContentVariables' => json_encode($variables, JSON_UNESCAPED_UNICODE),
                'StatusCallback' => $callback,
            ]),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_USERPWD => $accountSid . ':' . $authToken,
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        $response = is_string($raw) ? json_decode($raw, true) : null;
        if ($raw === false || $status < 200 || $status >= 300 || !is_array($response) || empty($response['sid'])) {
            return ['ok' => false, 'sid' => null, 'status' => null, 'error' => mb_substr($error ?: (string) $raw, 0, 1000)];
        }
        return [
            'ok' => true,
            'sid' => (string) $response['sid'],
            'status' => (string) ($response['status'] ?? 'queued'),
            'error' => null,
        ];
    }

    public static function address(string $value): ?string
    {
        $value = preg_replace('/^whatsapp:/i', '', trim($value)) ?? '';
        $number = preg_replace('/[\s().-]+/', '', $value) ?? '';
        return preg_match('/^\+[1-9]\d{7,14}$/', $number) ? 'whatsapp:' . $number : null;
    }
}
