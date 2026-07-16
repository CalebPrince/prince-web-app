<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Sends a plain-text (mrkdwn) message to the admin-configured Slack
 * incoming webhook. Lifted out of database/process_webhooks.php's inline
 * curl call (still there, untouched) once a second consumer
 * (database/run_beacon_discovery.php's qualified-lead digest) needed the
 * same thing — matches this codebase's "extract at the second consumer"
 * pattern (see AiAgentEngine, SharedAgentTools).
 */
class SlackNotifier
{
    /** @return bool true only on a real 200 from Slack; false if no webhook is configured or the request failed. */
    public static function send(string $text): bool
    {
        $url = Settings::get('slack_webhook_url');
        if (empty($url)) {
            return false;
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode(['text' => $text]),
            CURLOPT_TIMEOUT => 10,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return $response !== false && $status === 200;
    }
}
