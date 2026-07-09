<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Thin plain-cURL wrapper around Composio's REST API (no SDK — this app has
 * no Composer/build step, same reasoning as the direct-cURL Gemini/OpenRouter/
 * Paystack integrations). Composio exposes third-party apps (Google Calendar,
 * Gmail, Slack, WhatsApp, etc.) as OAuth-authenticated "tools" an
 * app can call on a connected user's behalf — unlike those single-secret-key
 * integrations, every toolkit here needs its own one-time OAuth "connect"
 * flow (see ComposioController) before executeTool()/executeProxy() will
 * work for it.
 *
 * Exact response field names for connected-account creation and tool
 * execution are confirmed only from a handful of published examples (no
 * live account to test against yet) — expect to adjust parsing here once
 * exercised against a real API key, the same way Gemini/OpenRouter parsing
 * was refined against real responses.
 */
class Composio
{
    private const API_BASE = 'https://backend.composio.dev/api/v3';
    private const API_BASE_V31 = 'https://backend.composio.dev/api/v3.1';
    private static ?string $lastError = null;

    /**
     * Starts the OAuth connect flow for a toolkit. The caller should send
     * the visitor (admin) to the returned redirect URL to complete
     * authorization; the connection only becomes usable once that finishes.
     *
     * @return array{id:string,redirectUrl:?string}|null
     */
    public static function createConnectedAccount(string $authConfigId): ?array
    {
        self::$lastError = null;
        $apiKey = Settings::get('composio_api_key');
        if (empty($apiKey) || $authConfigId === '') {
            self::$lastError = 'Missing Composio API key or Auth Config ID.';
            return null;
        }

        $response = self::request('POST', self::API_BASE_V31 . '/connected_accounts/link', $apiKey, [
            'auth_config_id' => $authConfigId,
            'user_id' => self::adminUserId(),
        ]);

        if ($response !== null) {
            $id = $response['connected_account_id'] ?? $response['connectedAccountId'] ?? null;
            $redirectUrl = $response['redirect_url'] ?? $response['redirectUrl'] ?? null;
            if ($id !== null || $redirectUrl !== null) {
                return ['id' => (string) ($id ?? $response['link_token'] ?? ''), 'redirectUrl' => $redirectUrl];
            }
            self::rememberError('Auth link succeeded but no connected_account_id/redirect_url in response: ' . json_encode($response));
        }

        // Fallback for custom auth configs and non-OAuth schemes. Composio's
        // managed OAuth configs now prefer /connected_accounts/link.
        $response = self::request('POST', self::API_BASE_V31 . '/connected_accounts', $apiKey, [
            'auth_config' => ['id' => $authConfigId],
            'connection' => [],
        ]);
        if ($response === null) {
            return null;
        }

        $id = $response['id'] ?? $response['connectedAccountId'] ?? null;
        if ($id === null) {
            self::rememberError('createConnectedAccount succeeded but no id in response: ' . json_encode($response));
            return null;
        }

        $redirectUrl = $response['redirectUrl'] ?? $response['redirect_url']
            ?? $response['connectionData']['redirectUrl'] ?? null;

        return ['id' => (string) $id, 'redirectUrl' => $redirectUrl];
    }

    private static function adminUserId(): string
    {
        return Settings::get('composio_user_id') ?: 'prince-web-app-admin';
    }

    /** @return string|null e.g. 'ACTIVE', 'INITIATED', 'FAILED' — null if the lookup itself failed */
    public static function getConnectedAccountStatus(string $connectedAccountId): ?string
    {
        $apiKey = Settings::get('composio_api_key');
        if (empty($apiKey) || $connectedAccountId === '') {
            return null;
        }

        $response = self::request('GET', self::API_BASE . '/connected_accounts/' . rawurlencode($connectedAccountId), $apiKey);
        if ($response === null) {
            return null;
        }

        return $response['status'] ?? $response['connectionStatus'] ?? null;
    }

    /**
     * Calls a named Composio tool/action against a connected account.
     * Endpoint/payload shape is a
     * best-effort guess pending live confirmation — see class docblock.
     *
     * @return array<string,mixed>|null null on any failure (network, auth, tool error)
     */
    public static function executeTool(string $toolSlug, string $connectedAccountId, array $params = []): ?array
    {
        self::$lastError = null;
        $apiKey = Settings::get('composio_api_key');
        if (empty($apiKey)) {
            self::$lastError = 'Missing Composio API key.';
            return null;
        }

        $payloads = [
            [
                'user_id' => self::adminUserId(),
                'entity_id' => self::adminUserId(),
                'connected_account_id' => $connectedAccountId,
                'arguments' => $params,
            ],
            [
                'user_id' => self::adminUserId(),
                'entity_id' => self::adminUserId(),
                'arguments' => $params,
            ],
            [
                'entity_id' => self::adminUserId(),
                'connected_account_id' => $connectedAccountId,
                'arguments' => $params,
            ],
        ];
        $urls = [
            self::API_BASE_V31 . '/tools/execute/' . rawurlencode($toolSlug),
            self::API_BASE . '/tools/execute/' . rawurlencode($toolSlug),
        ];

        foreach ($urls as $url) {
            foreach ($payloads as $payload) {
                $response = self::request('POST', $url, $apiKey, $payload);
                if ($response === null) {
                    continue;
                }
                if (isset($response['successful']) && $response['successful'] === false) {
                    self::rememberError('Tool execution returned unsuccessful: ' . json_encode($response));
                    continue;
                }
                if (isset($response['error'])) {
                    self::rememberError('Tool execution returned error: ' . json_encode($response));
                    continue;
                }
                return $response;
            }
        }

        return null;
    }

    public static function lastError(): ?string
    {
        return self::$lastError;
    }

    /**
     * Confirmed-real fallback: proxies a raw HTTP call straight through to
     * the third-party API (e.g. LinkedIn's own REST endpoints), using
     * Composio-managed OAuth credentials for the given connected account.
     * Prefer this if executeTool()'s named-action shape doesn't match once
     * tested live — it only requires knowing the target API's own request
     * shape, not Composio's tool schema for it.
     *
     * @param array<int,array{name:string,value:string,type:string}> $parameters query/header/path params, Composio's documented shape
     */
    public static function executeProxy(string $connectedAccountId, string $endpoint, string $method, array $parameters = [], ?array $body = null): ?array
    {
        $apiKey = Settings::get('composio_api_key');
        if (empty($apiKey)) {
            return null;
        }

        $payload = [
            'endpoint' => $endpoint,
            'method' => strtoupper($method),
            'connected_account_id' => $connectedAccountId,
            'parameters' => $parameters,
        ];
        if ($body !== null) {
            $payload['body'] = $body;
        }

        return self::request('POST', self::API_BASE_V31 . '/tools/execute/proxy', $apiKey, $payload);
    }

    /** @return array<string,mixed>|null decoded JSON body on 2xx, null on any transport/HTTP failure */
    private static function request(string $method, string $url, string $apiKey, ?array $body = null): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $ch = curl_init($url);
        $options = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'x-api-key: ' . $apiKey,
            ],
            CURLOPT_TIMEOUT => 20,
        ];
        if ($body !== null) {
            $options[CURLOPT_POSTFIELDS] = json_encode($body);
        }
        curl_setopt_array($ch, $options);

        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        // No curl_close() — deprecated since PHP 8.0 (handles auto-free), and
        // calling it on 8.5 emits a deprecation notice that leaks raw HTML
        // into this JSON response (bit this codebase twice already).

        if ($response === false || $status < 200 || $status >= 300) {
            self::rememberError(sprintf(
                '%s %s failed: status=%s curl_error=%s body=%s',
                $method,
                $url,
                $status,
                $curlError !== '' ? $curlError : 'none',
                is_string($response) ? substr($response, 0, 800) : 'n/a'
            ));
            return null;
        }

        return json_decode($response, true);
    }

    private static function rememberError(string $message): void
    {
        self::$lastError = mb_substr($message, 0, 1800);
        error_log('Composio: ' . self::$lastError);
    }
}
