<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\RateLimitMiddleware;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;

class LiveAvatarController
{
    public static function sdkStart(): void { self::proxySdkRequest('/v1/sessions/start'); }
    public static function sdkStop(): void { self::proxySdkRequest('/v1/sessions/stop'); }
    public static function sdkKeepAlive(): void { self::proxySdkRequest('/v1/sessions/keep-alive'); }

    /** POST /api/v1/liveavatar/session-token — issues a short-lived SDK token. */
    public static function createSessionToken(): void
    {
        RateLimitMiddleware::enforce('liveavatar_session_token', 60);
        if (Settings::get('liveavatar_enabled') !== '1') Response::error('Lisa video is not available at the moment.', 503);

        $apiKey = Settings::get('liveavatar_api_key');
        $avatarId = Settings::get('liveavatar_avatar_id');
        $contextId = Settings::get('liveavatar_context_id');
        $voiceId = Settings::get('liveavatar_voice_id') ?: '62bbb4b2-bb26-4727-bc87-cfb2bd4e0cc8';
        if (!$apiKey || !$avatarId || !$contextId) Response::error('Lisa video is not fully configured.', 503);

        $payload = [
            'mode' => 'FULL',
            'avatar_id' => $avatarId,
            'avatar_persona' => [
                'voice_id' => $voiceId,
                'context_id' => $contextId,
                'language' => 'en',
            ],
            'is_sandbox' => true,
        ];
        // When set (see scripts/setup_liveavatar_llm.php), routes the conversation
        // through our own /api/v1/liveavatar/chat/completions bridge — the same
        // generateReply() brain and tools as the web widget and WhatsApp — instead
        // of LiveAvatar's internal LLM answering only from context_id.
        $llmConfigurationId = Settings::get('liveavatar_llm_configuration_id');
        if ($llmConfigurationId) {
            $payload['llm_configuration_id'] = $llmConfigurationId;
        }

        $result = self::request('https://api.liveavatar.com/v1/sessions/token', $apiKey, $payload);

        $token = (string) ($result['data']['session_token'] ?? '');
        if ($token === '') Response::error('LiveAvatar returned no session token.', 502);
        Response::json(['session_token' => $token, 'sandbox' => true]);
    }

    /**
     * POST /api/v1/liveavatar/chat/completions — the custom-LLM bridge LiveAvatar
     * calls (per llm_configuration_id, set up by scripts/setup_liveavatar_llm.php)
     * instead of its own internal model. OpenAI-compatible request/response shape
     * is the only contract LiveAvatar requires; underneath, this just forwards
     * into LiveChatController::generateReply() — the exact same brain and tools
     * (log_inquiry, check_availability, book_appointment, signal_handoff, ...)
     * the public web widget and WhatsApp already use, running in public
     * (non-owner) mode.
     *
     * Authenticated with a static shared secret (liveavatar_llm_bridge_secret)
     * sent as a Bearer token — this is a credential we mint ourselves and
     * register with LiveAvatar as the secret_value for this llm_configuration,
     * NOT the liveavatar_api_key used for the calls above.
     *
     * generateReply() is fully blocking (no token streaming exists anywhere in
     * AiAgentEngine today), so a requested stream:true is faked as two SSE
     * chat.completion.chunk frames around the complete reply rather than true
     * incremental streaming — functionally correct, just not lower-latency.
     */
    public static function chatCompletions(): void
    {
        set_time_limit(135); // same worst-case provider-fallback budget as LiveChatController::message()
        RateLimitMiddleware::enforce('liveavatar_llm_bridge', 300);

        $expectedSecret = Settings::get('liveavatar_llm_bridge_secret');
        $providedSecret = self::bearerToken();
        if (!$expectedSecret || !$providedSecret || !hash_equals($expectedSecret, $providedSecret)) {
            Response::error('Unauthorized', 401);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $incoming = is_array($data['messages'] ?? null) ? $data['messages'] : [];

        $transcript = [];
        foreach ($incoming as $entry) {
            $role = (string) ($entry['role'] ?? '');
            $content = trim((string) ($entry['content'] ?? ''));
            // generateReply() builds its own system prompt (buildSystemPrompt());
            // a system entry here would just be LiveAvatar/OpenAI-client boilerplate.
            if ($role !== 'user' && $role !== 'assistant') continue;
            if ($content === '') continue;
            $transcript[] = ['role' => $role, 'text' => $content];
        }
        if (empty($transcript) || end($transcript)['role'] !== 'user') {
            Response::error('The last message must be from the user.', 422);
        }
        $message = end($transcript)['text'];

        $pdo = Database::get();
        $projects = LiveChatController::projectCatalog($pdo);
        $result = LiveChatController::generateReply($message, $transcript, $projects, $pdo, false, []);
        // Video Lisa's reply is spoken by LiveAvatar's TTS, not read as chat
        // copy — expand currency codes etc. the same way the web widget's
        // read-aloud button already does (TextToSpeechController).
        $reply = TextToSpeechController::normalizeForSpeech($result['reply']);

        $completionId = 'chatcmpl-' . bin2hex(random_bytes(8));
        $model = (string) ($data['model'] ?? 'lisa');

        if (!empty($data['stream'])) {
            self::streamChatCompletion($completionId, $model, $reply);
            return;
        }

        Response::json([
            'id' => $completionId,
            'object' => 'chat.completion',
            'created' => time(),
            'model' => $model,
            'choices' => [[
                'index' => 0,
                'message' => ['role' => 'assistant', 'content' => $reply],
                'finish_reason' => 'stop',
            ]],
        ]);
    }

    /** Two-frame SSE fake-stream: the whole reply as one delta, then a closing chunk. See chatCompletions() doc. */
    private static function streamChatCompletion(string $id, string $model, string $reply): void
    {
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('X-Accel-Buffering: no');
        while (ob_get_level() > 0) ob_end_flush();

        $base = ['id' => $id, 'object' => 'chat.completion.chunk', 'created' => time(), 'model' => $model];
        echo 'data: ' . json_encode($base + ['choices' => [['index' => 0, 'delta' => ['role' => 'assistant', 'content' => $reply], 'finish_reason' => null]]]) . "\n\n";
        flush();
        echo 'data: ' . json_encode($base + ['choices' => [['index' => 0, 'delta' => new \stdClass(), 'finish_reason' => 'stop']]]) . "\n\n";
        flush();
        echo "data: [DONE]\n\n";
        flush();
    }

    private static function bearerToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($header, 'Bearer ')) {
            return substr($header, 7);
        }
        return null;
    }

    public static function createEmbed(): void
    {
        // Embed URLs are short-lived, so page reloads and failed connection retries
        // legitimately create more sessions than a normal form submission.
        RateLimitMiddleware::enforce('liveavatar_embed', 60);
        if (Settings::get('liveavatar_enabled') !== '1') Response::error('Lisa video is not available at the moment.', 503);

        $apiKey = Settings::get('liveavatar_api_key');
        $avatarId = Settings::get('liveavatar_avatar_id');
        $contextId = Settings::get('liveavatar_context_id');
        if (!$apiKey || !$avatarId || !$contextId) Response::error('Lisa video is not fully configured.', 503);

        $payload = json_encode(['avatar_id' => $avatarId, 'context_id' => $contextId, 'is_sandbox' => true]);
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "X-API-KEY: {$apiKey}\r\nContent-Type: application/json\r\nAccept: application/json\r\n",
            'content' => $payload,
            'ignore_errors' => true,
            'timeout' => 25,
        ]]);

        $body = @file_get_contents('https://api.liveavatar.com/v2/embeddings', false, $context);
        $statusLine = $http_response_header[0] ?? '';
        $status = preg_match('/\s(\d{3})\s/', $statusLine, $match) ? (int) $match[1] : 0;
        $decoded = is_string($body) ? json_decode($body, true) : null;
        if ($status < 200 || $status >= 300 || !is_array($decoded)) {
            error_log('LiveAvatar embed request failed with HTTP ' . $status);
            Response::error('Lisa could not start the video call. Please try again shortly.', 502);
        }

        $url = (string) ($decoded['data']['url'] ?? '');
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($url === '' || $host !== 'embed.liveavatar.com' || !str_starts_with($url, 'https://')) {
            error_log('LiveAvatar returned an invalid embed URL.');
            Response::error('Lisa returned an invalid video session.', 502);
        }
        Response::json(['url' => $url, 'sandbox' => true]);
    }

    private static function request(string $url, string $apiKey, array $payload): array
    {
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "X-API-KEY: {$apiKey}\r\nContent-Type: application/json\r\nAccept: application/json\r\n",
            'content' => json_encode($payload, JSON_UNESCAPED_SLASHES),
            'ignore_errors' => true,
            'timeout' => 25,
        ]]);
        $body = @file_get_contents($url, false, $context);
        $statusLine = $http_response_header[0] ?? '';
        $status = preg_match('/\s(\d{3})\s/', $statusLine, $match) ? (int) $match[1] : 0;
        $decoded = is_string($body) ? json_decode($body, true) : null;
        if ($status < 200 || $status >= 300 || !is_array($decoded)) {
            $providerMessage = is_array($decoded) ? (string) ($decoded['message'] ?? $decoded['error'] ?? '') : '';
            error_log('LiveAvatar request failed with HTTP ' . $status . ($providerMessage ? ': ' . $providerMessage : ''));
            Response::error('Lisa could not start the video call. Please try again shortly.', 502);
        }
        return $decoded;
    }

    private static function proxySdkRequest(string $path): void
    {
        RateLimitMiddleware::enforce('liveavatar_sdk_proxy', 180);
        $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
        if (!preg_match('/^Bearer\s+[A-Za-z0-9._-]+$/', $authorization)) {
            Response::error('A valid LiveAvatar session token is required.', 401);
        }
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Authorization: {$authorization}\r\nContent-Type: application/json\r\nAccept: application/json\r\n",
            'content' => '{}',
            'ignore_errors' => true,
            'timeout' => 30,
        ]]);
        $body = @file_get_contents('https://api.liveavatar.com' . $path, false, $context);
        $statusLine = $http_response_header[0] ?? '';
        $status = preg_match('/\s(\d{3})\s/', $statusLine, $match) ? (int) $match[1] : 502;
        $decoded = is_string($body) ? json_decode($body, true) : null;
        if (!is_array($decoded)) {
            error_log('LiveAvatar SDK proxy returned an invalid response for ' . $path);
            Response::error('LiveAvatar did not return a valid response.', 502);
        }
        Response::json($decoded, $status);
    }
}
