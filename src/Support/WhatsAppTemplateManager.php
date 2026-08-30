<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Creates Lisa's WhatsApp intro template through Twilio's Content API and
 * tracks its Meta approval, so the template never has to be hand-built in the
 * Console. This is a narrowed revival of the manager deleted in the 2026-08-10
 * Twilio removal — that one owned the post-call summary template, which has no
 * equivalent any more; this one owns the intro template that
 * LiveChatController::sendIntro() sends.
 *
 * Approval is Meta's, not Twilio's: createAndSubmit() only gets the request
 * into their queue, and the answer arrives minutes to a day later, which is
 * why refresh() exists rather than a single blocking call.
 */
final class WhatsAppTemplateManager
{
    public const NAME = 'lisa_intro';
    public const LANGUAGE = 'en';

    /**
     * Meta classifies first-contact outreach like this as MARKETING. Declaring
     * UTILITY to dodge that gets the template rejected or reclassified, so it
     * is declared honestly.
     */
    private const CATEGORY = 'MARKETING';

    /** {{1}} is the contact's name — the one parameter sendIntro() fills in. */
    private const BODY = "Hi {{1}}, this is Lisa — Prince Caleb's assistant. "
        . "You got in touch with Caleb recently, so I'm picking things up here on WhatsApp.\n\n"
        . "Reply to this message and I can answer questions about your project, "
        . "walk you through pricing, or get a call booked in.";

    /** @return array<string,mixed> */
    public static function createAndSubmit(): array
    {
        if (self::isContentSid(trim((string) Settings::get('twilio_intro_content_sid')))) {
            throw new \RuntimeException('An intro template already exists. Refresh its approval status instead.');
        }

        $created = self::request('POST', 'https://content.twilio.com/v1/Content', [
            'friendly_name' => self::NAME,
            'language' => self::LANGUAGE,
            'variables' => ['1' => 'Ama'],
            'types' => ['twilio/text' => ['body' => self::BODY]],
        ], true);

        $sid = (string) ($created['sid'] ?? '');
        if (!self::isContentSid($sid)) {
            throw new \RuntimeException((string) ($created['message'] ?? 'Twilio did not create the template.'));
        }

        // Store the SID before submitting for approval: if the approval call
        // fails, the content still exists on Twilio's side, and losing the SID
        // here would strand it and block a retry with "already exists".
        Settings::set('twilio_intro_content_sid', $sid);
        Settings::set('twilio_intro_template_status', 'pending');

        $approval = self::request(
            'POST',
            "https://content.twilio.com/v1/Content/{$sid}/ApprovalRequests/whatsapp",
            ['name' => self::NAME, 'category' => self::CATEGORY],
            true
        );
        Settings::set('twilio_intro_template_status', strtolower((string) ($approval['status'] ?? 'pending')));

        return self::status();
    }

    /** @return array<string,mixed> */
    public static function refresh(): array
    {
        $sid = trim((string) Settings::get('twilio_intro_content_sid'));
        if ($sid === '') {
            return self::status();
        }

        $response = self::request('GET', "https://content.twilio.com/v1/Content/{$sid}/ApprovalRequests");
        Settings::set('twilio_intro_template_status', self::extractStatus($response) ?: 'pending');

        return self::status();
    }

    /** @return array<string,mixed> */
    public static function status(): array
    {
        $sid = trim((string) Settings::get('twilio_intro_content_sid'));
        return [
            'content_sid' => $sid !== '' ? $sid : null,
            'status' => $sid === '' ? 'not_created' : (Settings::get('twilio_intro_template_status') ?: 'pending'),
            'template_name' => self::NAME,
            'language' => self::LANGUAGE,
            'category' => self::CATEGORY,
            'body' => self::BODY,
            'provider' => (string) Settings::get('whatsapp_provider'),
        ];
    }

    private static function isContentSid(string $value): bool
    {
        return (bool) preg_match('/^HX[0-9a-fA-F]{32}$/', $value);
    }

    /**
     * @param array<string,mixed>|null $payload
     * @return array<string,mixed>
     */
    private static function request(string $method, string $url, ?array $payload = null, bool $json = false): array
    {
        $sid = trim((string) Settings::get('twilio_account_sid'));
        $token = trim((string) Settings::get('twilio_auth_token'));
        if (!preg_match('/^AC[0-9a-fA-F]{32}$/', $sid) || $token === '') {
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
            error_log('Twilio Content API failed: ' . $method . ' ' . $url . ' HTTP ' . $http . ' ' . mb_substr((string) $raw, 0, 800));
            throw new \RuntimeException(mb_substr(
                (string) ($decoded['message'] ?? $error ?: $raw ?: 'Twilio Content API failed.'),
                0,
                1000
            ));
        }

        return $decoded;
    }

    /**
     * Twilio nests the WhatsApp verdict differently depending on how many
     * approval requests a piece of content has, so this walks the response
     * rather than assuming one shape.
     *
     * @param array<mixed> $response
     */
    private static function extractStatus(array $response): ?string
    {
        if (isset($response['whatsapp']['status'])) {
            return strtolower((string) $response['whatsapp']['status']);
        }
        if (isset($response['status']) && is_scalar($response['status'])) {
            return strtolower((string) $response['status']);
        }
        foreach ($response as $value) {
            if (is_array($value) && ($status = self::extractStatus($value))) {
                return $status;
            }
        }
        return null;
    }
}
