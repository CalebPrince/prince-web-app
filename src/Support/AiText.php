<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Single-shot "prompt in, text out" generation with automatic fallback:
 * tries Gemini first, then OpenRouter, then Groq — each only if a key is
 * configured — stopping at the first one that returns usable text. A third
 * provider matters because Gemini and OpenRouter going down (or out of
 * quota/credit) at the same time isn't hypothetical — it's happened in
 * production. Groq is the third leg because it has its own independent
 * quota (no shared billing with either of the other two) and a free tier.
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
    /** @return string|null null only if every configured provider failed, or none is configured */
    public static function generate(string $prompt, ?string $systemInstruction = null, int $timeoutSeconds = 20): ?string
    {
        $result = self::generateWithProvider($prompt, $systemInstruction, $timeoutSeconds);
        return $result['text'] ?? null;
    }

    /**
     * Same as generate(), but also reports which provider actually produced
     * the text — useful anywhere the caller wants to record/display that
     * (e.g. a per-item "generated with Gemini/OpenRouter/Groq" label).
     *
     * @return array{text:string,provider:string}|null
     */
    public static function generateWithProvider(string $prompt, ?string $systemInstruction = null, int $timeoutSeconds = 20): ?array
    {
        $geminiKey = Settings::get('gemini_api_key');
        if (!empty($geminiKey)) {
            $text = self::callGemini($geminiKey, $prompt, $systemInstruction, $timeoutSeconds);
            if ($text !== null) {
                return ['text' => $text, 'provider' => 'gemini'];
            }
        }

        $openRouterKey = Settings::get('openrouter_api_key');
        if (!empty($openRouterKey)) {
            $text = self::callOpenRouter($openRouterKey, $prompt, $systemInstruction, $timeoutSeconds);
            if ($text !== null) {
                // OpenRouter routes to many underlying model providers behind
                // one API — reporting the actual configured model (rather
                // than a generic "openrouter" label) makes it visible in the
                // admin UI which model actually generated a given draft,
                // whatever it's set to (Claude, GPT, Llama, etc.).
                $model = Settings::get('openrouter_model') ?: 'openrouter/free';
                return ['text' => $text, 'provider' => $model];
            }
        }

        $groqKey = Settings::get('groq_api_key');
        if (!empty($groqKey)) {
            $text = self::callGroq($groqKey, $prompt, $systemInstruction, $timeoutSeconds);
            if ($text !== null) {
                return ['text' => $text, 'provider' => 'groq'];
            }
        }

        return null;
    }

    private static function callGemini(string $apiKey, string $prompt, ?string $system, int $timeout): ?string
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $payload = ['contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]]];
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
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'AiText: Gemini call failed (falling back to OpenRouter if configured): status=%s body=%s',
                $status,
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
        }
        return $text;
    }

    private static function callOpenRouter(string $apiKey, string $prompt, ?string $system, int $timeout): ?string
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
            CURLOPT_POSTFIELDS => json_encode(['model' => $model, 'messages' => $messages]),
            CURLOPT_TIMEOUT => $timeout,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'AiText: OpenRouter fallback also failed: status=%s body=%s',
                $status,
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
        }
        return $text;
    }

    private static function callGroq(string $apiKey, string $prompt, ?string $system, int $timeout): ?string
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $messages = [];
        if ($system !== null) {
            $messages[] = ['role' => 'system', 'content' => $system];
        }
        $messages[] = ['role' => 'user', 'content' => $prompt];

        $model = Settings::get('groq_model') ?: 'llama-3.3-70b-versatile';

        $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode(['model' => $model, 'messages' => $messages]),
            CURLOPT_TIMEOUT => $timeout,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'AiText: Groq fallback also failed: status=%s body=%s',
                $status,
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
        }
        return $text;
    }
}
