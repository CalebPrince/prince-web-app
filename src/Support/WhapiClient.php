<?php

declare(strict_types=1);

namespace App\Support;

final class WhapiClient
{
    /** @return array{ok:bool,id:?string,error:?string} */
    public static function sendText(string $recipient, string $body): array
    {
        $token = trim((string) Settings::get('whapi_api_token'));
        $to = preg_replace('/\D+/', '', $recipient) ?? '';
        $body = trim($body);
        if ($token === '' || !preg_match('/^[1-9]\d{7,14}$/', $to) || $body === '') {
            return ['ok' => false, 'id' => null, 'error' => 'Whapi token, recipient, or message is missing.'];
        }
        if (!function_exists('curl_init')) {
            return ['ok' => false, 'id' => null, 'error' => 'PHP cURL is unavailable.'];
        }

        $ch = curl_init('https://gate.whapi.cloud/messages/text');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode([
                'to' => $to,
                'body' => mb_substr($body, 0, 4000),
                'typing_time' => 1,
            ], JSON_UNESCAPED_UNICODE),
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
            $error = $curlError ?: (string) ($response['message'] ?? $response['error'] ?? $raw);
            error_log('Whapi send failed: HTTP ' . $status . ' ' . mb_substr($error, 0, 800));
            return ['ok' => false, 'id' => null, 'error' => mb_substr($error, 0, 500)];
        }

        return [
            'ok' => true,
            'id' => isset($response['message']['id'])
                ? (string) $response['message']['id']
                : (isset($response['id']) ? (string) $response['id'] : null),
            'error' => null,
        ];
    }
}
