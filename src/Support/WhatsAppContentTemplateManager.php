<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Shared machinery for a Twilio Content API template that Meta must approve
 * before it can go out as a business-initiated WhatsApp message: create the
 * content, submit it for approval, and poll where that approval got to.
 * Concrete subclasses just declare what the template says and which settings
 * keys track its SID/status — see WhatsAppTemplateManager (Lisa's intro) and
 * WhatsAppAssetRequestTemplateManager (asking a client for project assets).
 */
abstract class WhatsAppContentTemplateManager
{
    protected const NAME = '';
    protected const LANGUAGE = 'en';
    protected const CATEGORY = 'MARKETING';
    protected const BODY = '';
    /** @var array<string,string> Sample values Twilio shows Meta in the approval preview. */
    protected const SAMPLE_VARIABLES = [];
    protected const SID_SETTING = '';
    protected const STATUS_SETTING = '';

    /**
     * Optional WhatsApp URL button — set both to submit as a
     * "twilio/call-to-action" template instead of plain "twilio/text".
     * Meta's business-initiated review rejects a raw link pasted into body
     * text (it matches how phishing templates look); a link has to go
     * through a proper URL button, whose target must be a fixed base URL
     * with only a {{n}} suffix, not an entire variable URL.
     */
    protected const BUTTON_TEXT = '';
    protected const BUTTON_URL = '';

    /** @return array<string,mixed> */
    public static function createAndSubmit(): array
    {
        $existingSid = trim((string) Settings::get(static::SID_SETTING));
        if (self::isContentSid($existingSid)) {
            if (self::contentStillExists($existingSid)) {
                throw new \RuntimeException('This template already exists. Refresh its approval status instead.');
            }
            // The saved SID was deleted on Twilio's side (e.g. after a
            // rejection) — clear the stale settings so a fresh one can be
            // created instead of refusing forever.
            Settings::set(static::SID_SETTING, '');
            Settings::set(static::STATUS_SETTING, '');
        }

        $created = self::request('POST', 'https://content.twilio.com/v1/Content', [
            'friendly_name' => static::NAME,
            'language' => static::LANGUAGE,
            'variables' => static::SAMPLE_VARIABLES,
            'types' => self::buildTypes(),
        ], true);

        $sid = (string) ($created['sid'] ?? '');
        if (!self::isContentSid($sid)) {
            throw new \RuntimeException((string) ($created['message'] ?? 'Twilio did not create the template.'));
        }

        // Store the SID before submitting for approval: if the approval call
        // fails, the content still exists on Twilio's side, and losing the SID
        // here would strand it and block a retry with "already exists".
        Settings::set(static::SID_SETTING, $sid);
        Settings::set(static::STATUS_SETTING, 'pending');

        $approval = self::request(
            'POST',
            "https://content.twilio.com/v1/Content/{$sid}/ApprovalRequests/whatsapp",
            ['name' => static::NAME, 'category' => static::CATEGORY],
            true
        );
        Settings::set(static::STATUS_SETTING, strtolower((string) ($approval['status'] ?? 'pending')));

        return static::status();
    }

    /** @return array<string,mixed> */
    public static function refresh(): array
    {
        $sid = trim((string) Settings::get(static::SID_SETTING));
        if ($sid === '') {
            return static::status();
        }

        try {
            $response = self::request('GET', "https://content.twilio.com/v1/Content/{$sid}/ApprovalRequests");
        } catch (\RuntimeException $e) {
            if (!self::contentStillExists($sid)) {
                // Deleted on Twilio's side (e.g. after a rejection) — clear
                // the stale settings instead of surfacing a 404 forever.
                Settings::set(static::SID_SETTING, '');
                Settings::set(static::STATUS_SETTING, '');
                return static::status();
            }
            throw $e;
        }
        Settings::set(static::STATUS_SETTING, self::extractStatus($response) ?: 'pending');

        return static::status();
    }

    /**
     * The template's real body with {{n}} placeholders filled in — used to
     * seed the WhatsApp chat_sessions thread with the actual outbound text
     * at send time (LiveChatController::seedOutboundTemplate), so the
     * message shows up in Inbox rather than only in the whatsapp_intros log.
     *
     * @param array<string,string> $vars Keyed "1", "2", ... matching the template's own placeholders.
     */
    public static function renderBody(array $vars): string
    {
        $body = static::BODY;
        foreach ($vars as $key => $value) {
            $body = str_replace('{{' . $key . '}}', $value, $body);
        }
        if (static::BUTTON_URL !== '') {
            $url = static::BUTTON_URL;
            foreach ($vars as $key => $value) {
                $url = str_replace('{{' . $key . '}}', $value, $url);
            }
            $body .= "\n" . $url;
        }
        return $body;
    }

    /** @return array<string,mixed> */
    public static function status(): array
    {
        $sid = trim((string) Settings::get(static::SID_SETTING));
        return [
            'content_sid' => $sid !== '' ? $sid : null,
            'status' => $sid === '' ? 'not_created' : (Settings::get(static::STATUS_SETTING) ?: 'pending'),
            'template_name' => static::NAME,
            'language' => static::LANGUAGE,
            'category' => static::CATEGORY,
            'body' => static::BODY,
            'provider' => (string) Settings::get('whatsapp_provider'),
        ];
    }

    /** @return array<string,mixed> */
    private static function buildTypes(): array
    {
        if (static::BUTTON_TEXT === '' || static::BUTTON_URL === '') {
            return ['twilio/text' => ['body' => static::BODY]];
        }

        return [
            'twilio/call-to-action' => [
                'body' => static::BODY,
                'actions' => [
                    ['type' => 'URL', 'title' => static::BUTTON_TEXT, 'url' => static::BUTTON_URL],
                ],
            ],
        ];
    }

    private static function isContentSid(string $value): bool
    {
        return (bool) preg_match('/^HX[0-9a-fA-F]{32}$/', $value);
    }

    private static function contentStillExists(string $sid): bool
    {
        try {
            self::request('GET', "https://content.twilio.com/v1/Content/{$sid}");
            return true;
        } catch (\RuntimeException $e) {
            return false;
        }
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
