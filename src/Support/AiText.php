<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Single-shot "prompt in, text out" generation with automatic fallback:
 * tries DeepSeek first, then Gemini, then OpenRouter, then Groq — each only
 * if a key is configured — stopping at the first one that returns usable
 * text. DeepSeek leads for cost (cheap, paid-from-first-token, versus
 * Gemini's paid tier once its free quota is exhausted), not reliability —
 * everything below it exists because Gemini and OpenRouter going down (or
 * out of quota/credit) at the same time isn't hypothetical, it's happened
 * in production. Groq is the last leg because it has its own independent
 * quota (no shared billing with the others) and a free tier.
 * Centralized here (rather than duplicated per controller) because this
 * exact retry logic is now needed in three places, and the Gemini call
 * itself has already been the source of several subtle bugs this project
 * has had to debug — one implementation, not three.
 *
 * Deliberately plain text only — no function/tool calling support, since
 * providers differ enough there (Gemini's functionCall/functionResponse vs.
 * OpenAI-style tools/tool_calls) that a shared abstraction isn't worth it.
 * Live Chat's tool-calling loop (LiveChatController::chatWithGemini/
 * chatWithOpenRouter/chatWithGroq) has its own separate three-way fallback
 * for that reason, rather than reusing this class.
 */
class AiText
{
    /** Generous enough for every current caller's output (a 30-day content
     * plan, a full single-file HTML concept, a report) while staying well
     * under the huge default ceilings that broke OpenRouter's affordability
     * check — it was quoting "up to 64000 tokens" with none passed, which
     * fails a low-balance account even though the actual reply needs a
     * fraction of that. */
    private const DEFAULT_MAX_TOKENS = 8192;

    /** Longest wait for a provider's TCP/TLS handshake before moving on. */
    private const CONNECT_TIMEOUT = 6;

    /** Smallest window worth giving a provider once the budget is shared out. */
    private const MIN_PROVIDER_TIMEOUT = 8;

    /** Groq's free/on-demand tokens-per-minute cap for openai/gpt-oss-120b, as of 2026-08. */
    private const GROQ_TPM_LIMIT = 8000;

    private static ?string $lastError = null;

    /** @return string|null null only if every configured provider failed, or none is configured */
    public static function generate(string $prompt, ?string $systemInstruction = null, int $timeoutSeconds = 20, int $maxTokens = self::DEFAULT_MAX_TOKENS): ?string
    {
        $result = self::generateWithProvider($prompt, $systemInstruction, $timeoutSeconds, $maxTokens);
        return $result['text'] ?? null;
    }

    /**
     * Same as generate(), but also reports which provider actually produced
     * the text — useful anywhere the caller wants to record/display that
     * (e.g. a per-item "generated with Gemini/OpenRouter/Groq" label).
     *
     * @return array{text:string,provider:string}|null
     */
    public static function generateWithProvider(string $prompt, ?string $systemInstruction = null, int $timeoutSeconds = 20, int $maxTokens = self::DEFAULT_MAX_TOKENS): ?array
    {
        self::$lastError = null;

        // DeepSeek is tried first as a cost-cutting move — it is a cheap,
        // paid-from-first-token API, so resolving here means most calls never
        // touch Gemini's paid tier once its free quota is exhausted. Every leg
        // falls through to the next on any failure.
        $chain = [
            ['deepseek', Settings::get('deepseek_api_key'), fn($k, $t) => self::callDeepSeek($k, $prompt, $systemInstruction, $t, $maxTokens)],
            ['gemini', Settings::get('gemini_api_key'), fn($k, $t) => self::callGemini($k, $prompt, $systemInstruction, $t, $maxTokens)],
            ['openrouter', Settings::get('openrouter_api_key'), fn($k, $t) => self::callOpenRouter($k, $prompt, $systemInstruction, $t, $maxTokens)],
            ['groq', Settings::get('groq_api_key'), fn($k, $t) => self::callGroq($k, $prompt, $systemInstruction, $t, $maxTokens)],
        ];

        $configured = array_values(array_filter($chain, static fn(array $leg) => !empty($leg[1])));
        if ($configured === []) {
            self::$lastError = 'no AI provider is configured';
            return null;
        }

        // The timeout is a budget for the whole chain, not for each leg. Giving
        // every provider the full window meant one unreachable host could burn
        // the entire request — PHP's execution limit would kill it before the
        // fallback was ever tried, and the caller could only report that
        // nothing answered.
        $perCall = max(self::MIN_PROVIDER_TIMEOUT, intdiv($timeoutSeconds, count($configured)));
        $deadline = microtime(true) + $timeoutSeconds;
        // Every attempted leg's failure reason is kept, not just the last —
        // otherwise a later provider's failure silently overwrites an
        // earlier one's, hiding exactly the "why did the first, cheaper
        // provider also fail" detail an admin needs to diagnose a double
        // outage.
        $failures = [];

        foreach ($configured as [$name, $key, $call]) {
            $remaining = (int) floor($deadline - microtime(true));
            if ($remaining < self::MIN_PROVIDER_TIMEOUT) {
                $failures[] = sprintf('ran out of time before trying %s (%ds budget)', $name, $timeoutSeconds);
                break;
            }

            $startedAt = microtime(true);
            self::$lastError = null;
            $text = $call($key, min($perCall, $remaining));

            if ($text !== null) {
                // OpenRouter fronts many underlying models, so report the
                // configured model rather than a generic label — that is what
                // makes it visible in the admin which model wrote a given draft.
                $provider = $name === 'openrouter'
                    ? (Settings::get('openrouter_model') ?: 'openrouter/free')
                    : $name;
                return ['text' => $text, 'provider' => $provider];
            }

            $failures[] = self::$lastError ?? sprintf(
                '%s failed after %.1fs (see the error log for the provider response)',
                $name,
                microtime(true) - $startedAt
            );
        }

        self::$lastError = implode('; ', $failures);

        return null;
    }

    /** Why the last generate() call produced nothing, for surfacing to the admin. */
    public static function lastError(): ?string
    {
        return self::$lastError;
    }

    private static function callDeepSeek(string $apiKey, string $prompt, ?string $system, int $timeout, int $maxTokens): ?string
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $messages = [];
        if ($system !== null) {
            $messages[] = ['role' => 'system', 'content' => $system];
        }
        $messages[] = ['role' => 'user', 'content' => $prompt];

        $model = Settings::get('deepseek_model') ?: 'deepseek-v4-flash';

        $ch = curl_init('https://api.deepseek.com/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode(['model' => $model, 'messages' => $messages, 'max_tokens' => $maxTokens]),
            CURLOPT_TIMEOUT => $timeout,
            // A host that will not answer at all should not spend this leg's
            // whole share of the chain's budget failing to connect.
            CURLOPT_CONNECTTIMEOUT => min(self::CONNECT_TIMEOUT, $timeout),
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'AiText: DeepSeek call failed (falling back to Gemini if configured): status=%s curl_error=%s body=%s',
                $status,
                $curlError !== '' ? $curlError : 'none',
                is_string($response) ? substr($response, 0, 500) : 'n/a'
            ));
            return null;
        }

        $decoded = json_decode($response, true);
        $text = $decoded['choices'][0]['message']['content'] ?? null;
        if ($text === null) {
            error_log(sprintf(
                'AiText: DeepSeek returned 200 but no usable text: finishReason=%s body=%s',
                $decoded['choices'][0]['finish_reason'] ?? 'none',
                substr($response, 0, 500)
            ));
            self::$lastError = sprintf(
                'DeepSeek returned no text (finishReason=%s) — the model may have spent the token budget before answering.',
                $decoded['candidates'][0]['finishReason'] ?? $decoded['choices'][0]['finish_reason'] ?? 'unknown'
            );
        }
        return $text;
    }

    private static function callGemini(string $apiKey, string $prompt, ?string $system, int $timeout, int $maxTokens): ?string
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $payload = [
            'contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
            'generationConfig' => ['maxOutputTokens' => $maxTokens],
        ];
        if ($system !== null) {
            $payload['system_instruction'] = ['parts' => [['text' => $system]]];
        }

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' . $apiKey;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => $timeout,
            // A host that will not answer at all should not spend this leg's
            // whole share of the chain's budget failing to connect.
            CURLOPT_CONNECTTIMEOUT => min(self::CONNECT_TIMEOUT, $timeout),
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'AiText: Gemini call failed (falling back to OpenRouter if configured): status=%s curl_error=%s body=%s',
                $status,
                $curlError !== '' ? $curlError : 'none',
                is_string($response) ? substr($response, 0, 500) : 'n/a'
            ));
            return null;
        }

        $decoded = json_decode($response, true);
        $text = $decoded['candidates'][0]['content']['parts'][0]['text'] ?? null;
        if ($text === null) {
            // A 200 with no usable text (safety block, empty candidates,
            // truncation) is otherwise indistinguishable from "model declined"
            // with no way to diagnose it after the fact.
            error_log(sprintf(
                'AiText: Gemini returned 200 but no usable text: finishReason=%s promptFeedback=%s',
                $decoded['candidates'][0]['finishReason'] ?? 'none',
                json_encode($decoded['promptFeedback'] ?? null)
            ));
            self::$lastError = sprintf(
                'Gemini returned no text (finishReason=%s) — the model may have spent the token budget before answering.',
                $decoded['candidates'][0]['finishReason'] ?? $decoded['choices'][0]['finish_reason'] ?? 'unknown'
            );
        }
        return $text;
    }

    private static function callOpenRouter(string $apiKey, string $prompt, ?string $system, int $timeout, int $maxTokens): ?string
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $messages = [];
        if ($system !== null) {
            $messages[] = ['role' => 'system', 'content' => $system];
        }
        $messages[] = ['role' => 'user', 'content' => $prompt];

        $model = Settings::get('openrouter_model') ?: 'openrouter/free';

        $ch = curl_init('https://openrouter.ai/api/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
                // Required by OpenRouter for attribution — harmless, no secrets.
                'HTTP-Referer: https://princecaleb.dev',
                'X-Title: Prince Caleb Portfolio',
            ],
            CURLOPT_POSTFIELDS => json_encode(['model' => $model, 'messages' => $messages, 'max_tokens' => $maxTokens]),
            CURLOPT_TIMEOUT => $timeout,
            // A host that will not answer at all should not spend this leg's
            // whole share of the chain's budget failing to connect.
            CURLOPT_CONNECTTIMEOUT => min(self::CONNECT_TIMEOUT, $timeout),
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'AiText: OpenRouter fallback also failed: status=%s curl_error=%s body=%s',
                $status,
                $curlError !== '' ? $curlError : 'none',
                is_string($response) ? substr($response, 0, 500) : 'n/a'
            ));
            return null;
        }

        $decoded = json_decode($response, true);
        $text = $decoded['choices'][0]['message']['content'] ?? null;
        if ($text === null) {
            error_log(sprintf(
                'AiText: OpenRouter returned 200 but no usable text: finishReason=%s body=%s',
                $decoded['choices'][0]['finish_reason'] ?? 'none',
                substr($response, 0, 500)
            ));
            self::$lastError = sprintf(
                'OpenRouter returned no text (finishReason=%s) — the model may have spent the token budget before answering.',
                $decoded['candidates'][0]['finishReason'] ?? $decoded['choices'][0]['finish_reason'] ?? 'unknown'
            );
        }
        return $text;
    }

    private static function callGroq(string $apiKey, string $prompt, ?string $system, int $timeout, int $maxTokens): ?string
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $messages = [];
        if ($system !== null) {
            $messages[] = ['role' => 'system', 'content' => $system];
        }
        $messages[] = ['role' => 'user', 'content' => $prompt];

        // llama-3.3-70b-versatile was deprecated by Groq on 2026-06-17;
        // openai/gpt-oss-120b is Groq's recommended replacement.
        $model = Settings::get('groq_model') ?: 'openai/gpt-oss-120b';

        // Groq's free/on-demand tier caps openai/gpt-oss-120b at 8000 tokens
        // per minute, counting the prompt AND the requested max_tokens
        // together — a large prompt plus the shared chain-wide $maxTokens
        // ceiling can ask for more than that in one call and get a 413
        // before the model runs at all. Estimate the prompt's size
        // (~4 chars/token, the usual rule of thumb for English) and shrink
        // the completion budget to fit what the TPM cap has left; if the
        // prompt alone is already too big, skip the call rather than send
        // one that cannot succeed.
        $estimatedPromptTokens = (int) ceil((strlen($prompt) + strlen((string) $system)) / 4);
        $groqMaxTokens = min($maxTokens, self::GROQ_TPM_LIMIT - $estimatedPromptTokens - 200);
        if ($groqMaxTokens < 256) {
            return null;
        }

        $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode(['model' => $model, 'messages' => $messages, 'max_tokens' => $groqMaxTokens]),
            CURLOPT_TIMEOUT => $timeout,
            // A host that will not answer at all should not spend this leg's
            // whole share of the chain's budget failing to connect.
            CURLOPT_CONNECTTIMEOUT => min(self::CONNECT_TIMEOUT, $timeout),
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'AiText: Groq fallback also failed: status=%s curl_error=%s body=%s',
                $status,
                $curlError !== '' ? $curlError : 'none',
                is_string($response) ? substr($response, 0, 500) : 'n/a'
            ));
            return null;
        }

        $decoded = json_decode($response, true);
        $text = $decoded['choices'][0]['message']['content'] ?? null;
        if ($text === null) {
            error_log(sprintf(
                'AiText: Groq returned 200 but no usable text: finishReason=%s body=%s',
                $decoded['choices'][0]['finish_reason'] ?? 'none',
                substr($response, 0, 500)
            ));
            self::$lastError = sprintf(
                'Groq returned no text (finishReason=%s) — the model may have spent the token budget before answering.',
                $decoded['candidates'][0]['finishReason'] ?? $decoded['choices'][0]['finish_reason'] ?? 'unknown'
            );
        }
        return $text;
    }
}
