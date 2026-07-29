<?php

declare(strict_types=1);

namespace App\Support;

final class WhatsAppTemplateManager
{
    public const NAME = 'lisa_post_call_summary';
    public const LANGUAGE = 'en';

    public static function createAndSubmit(): array
    {
        if (preg_match('/^HX[0-9a-fA-F]{32}$/', trim((string) Settings::get('twilio_whatsapp_post_call_content_sid')))) {
            throw new \RuntimeException('A post-call template already exists. Refresh its approval status instead.');
        }
        $created = self::request('POST', 'https://content.twilio.com/v1/Content', [
            'friendly_name' => self::NAME,
            'language' => self::LANGUAGE,
            'variables' => ['1' => 'Customer', '2' => 'We discussed how Lisa can help your business.'],
            'types' => [
                'twilio/text' => [
                    'body' => "Hi {{1}}, thank you for speaking with Lisa today.\n\nHere is a summary of our call:\n{{2}}\n\nYou can reply directly to this message if you have any questions.",
                ],
            ],
        ], true);
        $sid = (string) ($created['sid'] ?? '');
        if (!preg_match('/^HX[0-9a-fA-F]{32}$/', $sid)) {
            throw new \RuntimeException((string) ($created['message'] ?? 'Twilio did not create the template.'));
        }
        $approval = self::request(
            'POST',
            "https://content.twilio.com/v1/Content/{$sid}/ApprovalRequests/whatsapp",
            ['name' => self::NAME, 'category' => 'UTILITY'],
            true
        );
        Settings::set('twilio_whatsapp_post_call_content_sid', $sid);
        Settings::set('twilio_whatsapp_post_call_template_status', (string) ($approval['status'] ?? 'pending'));
        Settings::set('twilio_whatsapp_post_call_enabled', '1');
        return self::status();
    }

    public static function refresh(): array
    {
        $sid = trim((string) Settings::get('twilio_whatsapp_post_call_content_sid'));
        if ($sid === '') return self::status();
        $response = self::request('GET', "https://content.twilio.com/v1/Content/{$sid}/ApprovalRequests");
        $status = self::extractStatus($response) ?: 'pending';
        Settings::set('twilio_whatsapp_post_call_template_status', $status);
        return self::status();
    }

    public static function status(): array
    {
        return [
            'content_sid' => Settings::get('twilio_whatsapp_post_call_content_sid'),
            'status' => Settings::get('twilio_whatsapp_post_call_template_status') ?: 'not_created',
            'enabled' => Settings::get('twilio_whatsapp_post_call_enabled') === '1',
            'template_name' => self::NAME,
            'language' => self::LANGUAGE,
        ];
    }

    private static function request(string $method, string $url, ?array $payload = null, bool $json = false): array
    {
        $sid = trim((string) Settings::get('twilio_account_sid'));
        $token = trim((string) Settings::get('twilio_auth_token'));
        if (!preg_match('/^AC[0-9a-fA-F]{32}$/', $sid) || $token === '' || !function_exists('curl_init')) {
            throw new \RuntimeException('Save a valid Twilio Account SID and Auth Token first.');
        }
        $ch = curl_init($url);
        $headers = ['Accept: application/json'];
        $options = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_USERPWD => $sid . ':' . $token,
        ];
        if ($payload !== null) {
            $options[CURLOPT_POSTFIELDS] = $json
                ? json_encode($payload, JSON_UNESCAPED_UNICODE)
                : http_build_query($payload);
            $headers[] = $json ? 'Content-Type: application/json' : 'Content-Type: application/x-www-form-urlencoded';
        }
        $options[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $options);
        $raw = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if ($raw === false || $http < 200 || $http >= 300 || !is_array($decoded)) {
            throw new \RuntimeException(mb_substr((string) ($decoded['message'] ?? $error ?: $raw ?: 'Twilio Content API failed.'), 0, 1000));
        }
        return $decoded;
    }

    private static function extractStatus(array $response): ?string
    {
        if (isset($response['whatsapp']['status'])) return strtolower((string) $response['whatsapp']['status']);
        if (isset($response['status'])) return strtolower((string) $response['status']);
        foreach ($response as $value) {
            if (is_array($value) && ($status = self::extractStatus($value))) return $status;
        }
        return null;
    }
}
