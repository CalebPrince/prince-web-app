<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\WhatsAppNotifier;

/**
 * Sends a WhatsApp alert for one of Prince's own client apps (first user:
 * Church Power Tracker) through this site's configured WhatsApp provider, so
 * the provider credentials and the approved owner-alert template stay in one
 * place and a provider switch here covers every app.
 *
 * Not an admin session endpoint: callers send a dedicated static key
 * (Settings::whatsapp_relay_api_key) as a Bearer token. It is deliberately
 * separate from integration_api_key, so a leaked relay key cannot read the
 * integration events feed and vice versa.
 *
 * Because a leaked key would let anyone message strangers from the business
 * number, sends are capped per rolling 24 hours: DAILY_CAP messages in total,
 * to at most RECIPIENT_CAP distinct numbers. Every attempt is logged in
 * whatsapp_relay_log.
 */
class WhatsAppRelayController
{
    private const DAILY_CAP = 40;
    private const RECIPIENT_CAP = 5;

    /** POST /api/v1/relay/whatsapp-alert  {to, source, title, details} */
    public static function send(): void
    {
        $expected = Settings::get('whatsapp_relay_api_key');
        $provided = self::bearerToken();
        if (!$expected || !$provided || !hash_equals($expected, $provided)) {
            Response::error('Unauthorized', 401);
        }

        $input = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($input)) {
            Response::error('Invalid JSON body.', 400);
        }

        $address = WhatsAppNotifier::address((string) ($input['to'] ?? ''));
        if ($address === null) {
            Response::error('"to" must be an international number such as +233241234567.', 422);
        }
        $recipient = substr($address, strlen('whatsapp:'));

        $source = self::clean($input['source'] ?? '', 60);
        $title = rtrim(self::clean($input['title'] ?? '', 120), '.!? ');
        $details = self::clean($input['details'] ?? '', 500);
        if ($source === '' || $title === '' || $details === '') {
            Response::error('"source", "title" and "details" are required.', 422);
        }

        $pdo = Database::get();
        self::ensureLogTable($pdo);
        $since = gmdate('Y-m-d H:i:s', time() - 86400);
        $count = $pdo->prepare('SELECT COUNT(*) FROM whatsapp_relay_log WHERE created_at > ?');
        $count->execute([$since]);
        if ((int) $count->fetchColumn() >= self::DAILY_CAP) {
            Response::error('Daily WhatsApp relay limit reached. Try again later.', 429);
        }
        $known = $pdo->prepare('SELECT COUNT(*) FROM whatsapp_relay_log WHERE created_at > ? AND recipient = ?');
        $known->execute([$since, $recipient]);
        if ((int) $known->fetchColumn() === 0) {
            $distinct = $pdo->prepare('SELECT COUNT(DISTINCT recipient) FROM whatsapp_relay_log WHERE created_at > ?');
            $distinct->execute([$since]);
            if ((int) $distinct->fetchColumn() >= self::RECIPIENT_CAP) {
                Response::error('Too many different recipients in 24 hours.', 429);
            }
        }

        // Prose for free-text providers; fields for the approved template
        // ("Update from {{1}}: {{2}}. Details: {{3}} Open your admin dashboard to review.").
        $body = "Update from {$source}: {$title}. Details: {$details}";
        $ok = WhatsAppNotifier::sendAlertTo($recipient, $body, [
            'name' => $source,
            'reason' => $title,
            'summary' => $details,
            'message' => $body,
        ]);

        $pdo->prepare(
            'INSERT INTO whatsapp_relay_log (recipient, source, title, provider, ok, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$recipient, $source, $title, WhatsAppNotifier::provider(), $ok ? 1 : 0, gmdate('Y-m-d H:i:s')]);

        if (!$ok) {
            Response::json(['ok' => false, 'error' => 'The WhatsApp provider did not accept the message. Check the provider settings and logs.'], 502);
        }
        Response::json(['ok' => true, 'provider' => WhatsAppNotifier::provider()]);
    }

    /** Created on first use, so the relay needs no separate migration step. */
    private static function ensureLogTable(\PDO $pdo): void
    {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS whatsapp_relay_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipient TEXT NOT NULL,
                source TEXT NOT NULL,
                title TEXT NOT NULL,
                provider TEXT NOT NULL,
                ok INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_whatsapp_relay_log_created ON whatsapp_relay_log(created_at)');
    }

    /** Template variables can't hold newlines or long runs of spaces. */
    private static function clean(mixed $value, int $max): string
    {
        $value = trim(preg_replace('/\s+/u', ' ', is_string($value) ? $value : '') ?? '');
        return mb_strlen($value) > $max ? rtrim(mb_substr($value, 0, $max - 1)) . '…' : $value;
    }

    private static function bearerToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($header, 'Bearer ')) {
            return substr($header, 7);
        }
        return null;
    }
}
