<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Composio;
use App\Support\Response;
use App\Support\Settings;

/**
 * Admin-only management of Composio "connected accounts" — the one-time
 * OAuth hand-off each toolkit (Google Calendar, Gmail, etc.) needs
 * before Composio::executeTool()/executeProxy() can act on it. New
 * toolkits are added by extending TOOLKITS below; no other code changes
 * needed here. Connecting a toolkit here only proves the OAuth link
 * works — actually wiring a capability to it (e.g. syncing a booking to
 * Google Calendar) is separate work per toolkit.
 *
 */
class ComposioController
{
    /** toolkit slug => human label, shown in the admin Connected Accounts UI */
    private const TOOLKITS = [
        'google_calendar' => 'Google Calendar',
        'gmail' => 'Gmail',
        'slack' => 'Slack',
        'whatsapp' => 'WhatsApp Business',
    ];

    /** GET /api/v1/admin/composio/status */
    public static function status(): void
    {
        AuthMiddleware::requireAuth();

        $out = [];
        foreach (self::TOOLKITS as $slug => $label) {
            $accountId = Settings::get("composio_{$slug}_account_id");
            $authConfigId = Settings::get("composio_{$slug}_auth_config_id");
            $status = null;
            if (!empty($accountId)) {
                $status = Composio::getConnectedAccountStatus($accountId);
            }
            $out[$slug] = [
                'label' => $label,
                'auth_config_id' => $authConfigId ?: null,
                'account_id' => $accountId ?: null,
                'status' => $status, // null: not connected yet, or status lookup failed
            ];
        }

        Response::json($out);
    }

    /** POST /api/v1/admin/composio/connect — body: {toolkit} */
    public static function connect(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $toolkit = (string) ($data['toolkit'] ?? '');

        if (!isset(self::TOOLKITS[$toolkit])) {
            Response::error('Unknown toolkit.', 422);
        }
        if (empty(Settings::get('composio_api_key'))) {
            Response::error('Add your Composio API key in Settings first.', 422);
        }
        $authConfigId = Settings::get("composio_{$toolkit}_auth_config_id");
        if (empty($authConfigId)) {
            Response::error('Add an Auth Config ID for this toolkit first — create one in your Composio dashboard.', 422);
        }

        $result = Composio::createConnectedAccount($authConfigId);
        if ($result === null) {
            Response::error('Could not start the connection — check the API key and Auth Config ID are correct.', 502);
        }

        Settings::set("composio_{$toolkit}_account_id", $result['id']);
        ActivityLog::log($user, 'connected', 'composio_account', $toolkit, self::TOOLKITS[$toolkit]);

        Response::json(['redirect_url' => $result['redirectUrl'], 'account_id' => $result['id']]);
    }

    /** POST /api/v1/admin/composio/disconnect — body: {toolkit} */
    public static function disconnect(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $toolkit = (string) ($data['toolkit'] ?? '');

        if (!isset(self::TOOLKITS[$toolkit])) {
            Response::error('Unknown toolkit.', 422);
        }

        Settings::set("composio_{$toolkit}_account_id", '');
        ActivityLog::log($user, 'disconnected', 'composio_account', $toolkit, self::TOOLKITS[$toolkit]);

        Response::json(['status' => 'disconnected']);
    }
}
