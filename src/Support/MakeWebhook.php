<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Push + log for marketing-automation events (Make.com or any generic
 * webhook consumer) — social post drafts, CRM sync, nurture sequences.
 *
 * Every event is both pushed live (short-timeout curl, best-effort — not
 * safety-critical like the Slack/email inquiry notifications, so no queue)
 * and logged to integration_events regardless of whether the push
 * succeeded. That log is what GET /api/v1/integrations/events serves, so a
 * Make.com scenario that was paused, down, or not yet configured when an
 * event fired can pull it later instead of losing it outright.
 */
class MakeWebhook
{
    public static function send(string $event, array $data): bool
    {
        $delivered = self::push($event, $data);
        self::log($event, $data, $delivered);

        return $delivered;
    }

    private static function push(string $event, array $data): bool
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

    private static function log(string $event, array $data, bool $delivered): void
    {
        Database::get()->prepare(
            'INSERT INTO integration_events (event, data, push_delivered) VALUES (?, ?, ?)'
        )->execute([$event, json_encode($data), $delivered ? 1 : 0]);
    }
}
