<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Best-effort event push to a Make.com (or any generic) webhook URL, for
 * marketing automation — social post drafts, CRM sync, nurture sequences.
 * Fires inline within the request with a short timeout rather than a queue:
 * unlike the Slack/email inquiry notifications this isn't safety-critical,
 * so the extra queue/retry infrastructure isn't worth it here. A single
 * webhook URL is used for every event; the `event` field lets one Make.com
 * scenario route to different actions with a Router module.
 */
class MakeWebhook
{
    public static function send(string $event, array $data): bool
    {
        $url = Settings::get('makecom_webhook_url');
        if (!$url) {
            return false;
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode(['event' => $event, 'data' => $data, 'timestamp' => gmdate('c')]),
            CURLOPT_TIMEOUT => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
        ]);
        $response = @curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        return $response !== false && $status >= 200 && $status < 300;
    }
}
