<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Changes the WhatsApp display name of Lisa's Twilio sender through Twilio's
 * Senders API (v2), which submits it to Meta for review and applies it once
 * approved. Neither Twilio's console nor Meta's WhatsApp Manager lets the
 * name be edited for a Twilio-managed sender, so this is the only self-serve
 * route. Admin -> Settings -> Messaging drives it, the same way the template
 * cards drive WhatsAppContentTemplateManager.
 *
 * Nothing is stored locally: Twilio is the source of truth, and status()
 * reads the sender fresh every time.
 */
final class WhatsAppDisplayNameManager
{
    private const SENDERS_API = 'https://messaging.twilio.com/v2/Channels/Senders';

    public const SUGGESTED_NAME = 'Lisa - Prince Caleb Support';

    /** Twilio error code => what to do about it, for the admin message. */
    private const ERROR_HINTS = [
        63124 => 'Meta rejected the name. Change it to meet the display name guidelines and try again.',
        63121 => 'A name change is already in review for this sender. Wait for it to finish.',
        63100 => 'The name is empty or longer than 255 characters.',
        20404 => 'Twilio says this is not a WhatsApp Cloud API sender, so only Twilio support can rename it.',
        63117 => 'Twilio could not reach Meta. Try again in a few minutes.',
    ];

    /**
     * The sender's live name and any change in flight. pending_status is
     * Meta's verdict: PENDING_REVIEW, APPROVED (Twilio is applying it),
     * DECLINED, COMPLETED (live), or PIN_MISMATCH / REGISTRATION_FAILED /
     * EXPIRED (approved but not applied; submitting the same name retries
     * it without a new review).
     *
     * @return array<string,mixed>
     */
    public static function status(): array
    {
        return self::summarize(self::findSender());
    }

    /** @return array<string,mixed> status() after the submission, plus `submission` */
    public static function submit(string $name): array
    {
        $name = trim(preg_replace('/\s+/', ' ', $name) ?? '');
        if ($name === '' || mb_strlen($name) > 255) {
            throw new \RuntimeException('Enter a display name of 1 to 255 characters.');
        }

        $sender = self::findSender();
        $current = self::summarize($sender);

        // Meta allows only a few name changes per 30 days; don't spend one on
        // a name that is already live or already in review.
        if ($current['name'] === $name && $current['pending_status'] !== 'PENDING_REVIEW') {
            throw new \RuntimeException("\"{$name}\" is already the live display name.");
        }
        if ($current['pending_name'] === $name && in_array($current['pending_status'], ['PENDING_REVIEW', 'APPROVED'], true)) {
            throw new \RuntimeException("\"{$name}\" is already {$current['pending_status']}. Use Refresh status to follow it.");
        }

        $response = self::request('POST', self::SENDERS_API . '/' . rawurlencode($current['sid']), [
            'profile' => ['name' => $name],
        ]);

        // updating (sent to Meta), no_change, pending_review, or error (the
        // request went through but the name itself failed).
        $submission = (string) ($response['profile']['display_name_status'] ?? '');
        if ($submission === 'error') {
            throw new \RuntimeException('Twilio accepted the request but the name change failed. Check the Twilio error log.');
        }

        // Re-read so the card shows Twilio's own view of the pending change.
        $after = self::summarize(self::findSender());
        $after['submission'] = $submission !== '' ? $submission : 'not reported';
        return $after;
    }

    /** @return array<string,mixed> */
    private static function findSender(): array
    {
        $digits = TwilioClient::senderDigits();
        if ($digits === '') {
            throw new \RuntimeException('Save the Twilio WhatsApp number first.');
        }

        $url = self::SENDERS_API . '?Channel=whatsapp&PageSize=50';
        while ($url !== '') {
            $page = self::request('GET', $url);
            foreach ($page['senders'] ?? [] as $sender) {
                if ((preg_replace('/\D+/', '', (string) ($sender['sender_id'] ?? '')) ?? '') === $digits) {
                    // The list omits the pending_display_name* fields; only
                    // fetching the sender itself reports a change in review.
                    $sid = (string) ($sender['sid'] ?? '');
                    return $sid !== '' ? self::request('GET', self::SENDERS_API . '/' . rawurlencode($sid)) : $sender;
                }
            }
            $url = (string) ($page['meta']['next_page_url'] ?? '');
        }

        throw new \RuntimeException("No Twilio WhatsApp sender matches +{$digits}. Check the Twilio WhatsApp number.");
    }

    /**
     * @param array<string,mixed> $sender
     * @return array<string,mixed>
     */
    private static function summarize(array $sender): array
    {
        $profile = is_array($sender['profile'] ?? null) ? $sender['profile'] : [];
        $properties = is_array($sender['properties'] ?? null) ? $sender['properties'] : [];

        return [
            'sid' => (string) ($sender['sid'] ?? ''),
            'sender' => (string) ($sender['sender_id'] ?? ''),
            'sender_status' => (string) ($sender['status'] ?? ''),
            'name' => (string) ($profile['name'] ?? ''),
            // Twilio's docs show these under profile in one place and on the
            // sender itself in another, so accept either.
            'pending_name' => (string) ($profile['pending_display_name'] ?? $sender['pending_display_name'] ?? ''),
            'pending_status' => (string) ($profile['pending_display_name_status'] ?? $sender['pending_display_name_status'] ?? ''),
            'pending_status_date' => (string) ($profile['pending_display_name_status_date'] ?? $sender['pending_display_name_status_date'] ?? ''),
            'messaging_limit' => (string) ($properties['messaging_limit'] ?? ''),
            'quality_rating' => (string) ($properties['quality_rating'] ?? ''),
            'suggested_name' => self::SUGGESTED_NAME,
        ];
    }

    /**
     * @param array<string,mixed>|null $json
     * @return array<string,mixed>
     */
    private static function request(string $method, string $url, ?array $json = null): array
    {
        $accountSid = trim((string) Settings::get('twilio_account_sid'));
        $token = trim((string) Settings::get('twilio_auth_token'));
        if (!preg_match('/^AC[0-9a-fA-F]{32}$/', $accountSid) || $token === '') {
            throw new \RuntimeException('Save a valid Twilio account SID and auth token first.');
        }
        if (!function_exists('curl_init')) {
            throw new \RuntimeException('PHP cURL is unavailable.');
        }

        $ch = curl_init($url);
        $headers = ['Accept: application/json'];
        $options = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_USERPWD => $accountSid . ':' . $token,
        ];
        if ($json !== null) {
            $options[CURLOPT_POSTFIELDS] = json_encode($json, JSON_UNESCAPED_UNICODE);
            $headers[] = 'Content-Type: application/json';
        }
        $options[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $options);

        $raw = curl_exec($ch);
        $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if ($raw === false || $http < 200 || $http >= 300 || !is_array($decoded)) {
            error_log('Twilio Senders API failed: ' . $method . ' ' . $url . ' HTTP ' . $http . ' ' . mb_substr((string) $raw, 0, 800));
            $code = (int) ($decoded['code'] ?? 0);
            $message = (string) ($decoded['message'] ?? ($error ?: 'Twilio Senders API failed (HTTP ' . $http . ').'));
            throw new \RuntimeException(mb_substr(
                isset(self::ERROR_HINTS[$code]) ? self::ERROR_HINTS[$code] . ' (Twilio: ' . $message . ')' : $message,
                0,
                1000
            ));
        }

        return $decoded;
    }
}
