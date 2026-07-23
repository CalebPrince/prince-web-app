<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Shared tool-calling engine for AI agents: given a system prompt, a set of
 * tool declarations (Gemini functionDeclarations shape), and a tool
 * executor, runs the same three-provider fallback (Gemini -> OpenRouter ->
 * Groq, each only if its key is configured) and tool-calling round-trip
 * loop that Live Chat's "Lisa" agent originally had built in directly.
 * Extracted so a second, differently-configured agent (different persona,
 * different tools) can reuse this machinery instead of duplicating it.
 *
 * Deliberately generic about *what* the agent is — callers own their own
 * system prompt, tool declarations, and tool dispatch (via $toolExecutor).
 * Two optional hooks exist purely because Live Chat's booking flow needs
 * them and a generic engine can't hardcode that business logic:
 *  - $onExhaustedFallback: called instead of returning null whenever a
 *    provider call hard-fails or a turn's tool-call rounds run out without
 *    final text — lets a caller substitute a reply built from a tool result
 *    it already knows succeeded (e.g. a confirmed booking), tracked via its
 *    own $toolExecutor closure. Return null from it to signal "no override".
 *  - $onGroqFailedGeneration: Groq occasionally rejects a tool call before
 *    returning normal tool_calls; this receives the raw failed_generation
 *    text so a caller can attempt its own safe recovery. Return null to
 *    treat it as a hard failure.
 *
 * For plain (non-tool-calling) generation, use AiText instead — this class
 * exists because the two providers' tool-calling shapes (Gemini's
 * functionCall/functionResponse vs. OpenAI-style tools/tool_calls) differ
 * enough that a shared abstraction wasn't worth it for plain text.
 */
class AiAgentEngine
{
    private const GEMINI_CHAT_TIMEOUT_SECONDS = 12;
    // Free-tier OpenRouter models are often slower than Gemini — reusing
    // Gemini's 12s budget here was cutting the fallback off mid-response
    // (curl reports the 200 status from the headers it did receive, but
    // returns false because the body never finished downloading in time).
    // Confirmed live in production: even 18s wasn't enough (same "status=200
    // body=n/a" signature), so this needs real headroom for a free-tier model.
    private const OPENROUTER_CHAT_TIMEOUT_SECONDS = 30;
    // Groq's own infrastructure is fast, but this still needs headroom for
    // a cold key/model or a transient slowdown rather than assuming best case.
    private const GROQ_CHAT_TIMEOUT_SECONDS = 20;

    /**
     * @param array<int,array<string,mixed>> $toolDeclarations Gemini functionDeclarations shape; translated internally for OpenRouter/Groq.
     * @param callable $toolExecutor fn(string $name, array $args): array
     * @param array<int,array{role:string,text:string}> $transcript
     * @param ?callable $onExhaustedFallback fn(): ?array{reply:string,ready:bool}
     * @param ?callable $onGroqFailedGeneration fn(string $failedGeneration): ?array{reply:string,ready:bool}
     * @return array{reply: ?string, mode: 'ai'|'fallback', provider: ?string, ready: bool}
     */
    public static function run(
        string $systemPrompt,
        array $toolDeclarations,
        callable $toolExecutor,
        array $transcript,
        ?callable $onExhaustedFallback = null,
        ?callable $onGroqFailedGeneration = null,
        int $maxToolRounds = 2
    ): array {
        $reply = null;
        $mode = 'fallback';
        $provider = null;
        $ready = false;

        $geminiKey = Settings::get('gemini_api_key');
        if (!empty($geminiKey)) {
            $result = self::chatWithGemini(
                $geminiKey, $systemPrompt, $toolDeclarations, $toolExecutor, $transcript, $onExhaustedFallback, $maxToolRounds
            );
            if ($result !== null) {
                $ready = $ready || $result['ready'];
                if ($result['reply'] !== null) {
                    $reply = $result['reply'];
                    $mode = 'ai';
                    $provider = 'gemini';
                }
            }
        }

        // Gemini failed outright, or produced no usable reply text — retry
        // the whole turn against OpenRouter. This is a fresh, independent
        // turn on the other provider, not a mid-conversation handoff.
        if ($reply === null) {
            $openRouterKey = Settings::get('openrouter_api_key');
            if (!empty($openRouterKey)) {
                $result = self::chatWithOpenRouter(
                    $openRouterKey, $systemPrompt, $toolDeclarations, $toolExecutor, $transcript, $onExhaustedFallback, $maxToolRounds
                );
                if ($result !== null) {
                    $ready = $ready || $result['ready'];
                    if ($result['reply'] !== null) {
                        $reply = $result['reply'];
                        $mode = 'ai';
                        $provider = 'openrouter';
                    }
                }
            }
        }

        // Gemini and OpenRouter both failed (or neither is configured) —
        // last AI attempt. Groq has its own independent quota/billing, so
        // it's the one leg still standing when the other two are both out
        // of credit at once.
        if ($reply === null) {
            $groqKey = Settings::get('groq_api_key');
            if (!empty($groqKey)) {
                $result = self::chatWithGroq(
                    $groqKey, $systemPrompt, $toolDeclarations, $toolExecutor, $transcript,
                    $onExhaustedFallback, $onGroqFailedGeneration, $maxToolRounds
                );
                if ($result !== null) {
                    $ready = $ready || $result['ready'];
                    if ($result['reply'] !== null) {
                        $reply = $result['reply'];
                        $mode = 'ai';
                        $provider = 'groq';
                    }
                }
            }
        }

        return ['reply' => $reply, 'mode' => $mode, 'provider' => $provider, 'ready' => $ready];
    }

    /** @return array{reply: ?string, ready: bool}|null null only on a hard failure (caller falls back to the next provider) */
    private static function chatWithGemini(
        string $apiKey,
        string $system,
        array $toolDeclarations,
        callable $toolExecutor,
        array $transcript,
        ?callable $onExhaustedFallback,
        int $maxToolRounds
    ): ?array {
        // The full transcript is sent, not a truncated tail — messages here
        // are short and providers' context windows are enormous, so there's
        // no real cost reason to trim, and a visitor's early project
        // description is exactly what the model needs to still see turns
        // later in a longer conversation.
        $contents = [];
        foreach ($transcript as $turn) {
            $contents[] = [
                'role' => $turn['role'] === 'user' ? 'user' : 'model',
                'parts' => [['text' => $turn['text']]],
            ];
        }

        $tools = [['functionDeclarations' => $toolDeclarations]];
        $ready = false;

        for ($round = 0; $round < $maxToolRounds; $round++) {
            $payload = [
                'system_instruction' => ['parts' => [['text' => $system]]],
                'contents' => $contents,
                'generationConfig' => ['maxOutputTokens' => 2048],
            ];
            // On the last allowed round, don't offer tools at all — otherwise
            // a model that wants a second sequential tool call (e.g. search
            // one thing, then decide to call another tool) uses up every
            // round on functionCalls and never emits final text, which
            // surfaced as the whole turn silently falling through to keyword
            // matching. Forcing text here guarantees a real reply using
            // whatever tool results are already in hand.
            if ($round < $maxToolRounds - 1) {
                $payload['tools'] = $tools;
            }
            $body = json_encode($payload);

            $result = self::callGeminiRaw($apiKey, $body, self::GEMINI_CHAT_TIMEOUT_SECONDS);
            $parts = $result['candidates'][0]['content']['parts'] ?? null;
            if (!is_array($parts)) {
                error_log(sprintf(
                    'Gemini chat returned no usable content (round %d): finishReason=%s promptFeedback=%s',
                    $round,
                    $result['candidates'][0]['finishReason'] ?? 'none',
                    json_encode($result['promptFeedback'] ?? null)
                ));
                return $onExhaustedFallback !== null ? $onExhaustedFallback() : null;
            }

            $functionCalls = [];
            $text = '';
            foreach ($parts as $part) {
                if (isset($part['functionCall']['name'])) {
                    $functionCalls[] = $part['functionCall'];
                }
                // A thinking-enabled model can return its reasoning as its own
                // text part (marked `thought: true`), ahead of the real answer
                // part. Concatenating it in would glue an internal paraphrase
                // straight onto the final reply with no separator — read back
                // as the same fact stated twice in slightly different words.
                if (isset($part['text']) && empty($part['thought'])) {
                    $text .= $part['text'];
                }
            }

            if (!$functionCalls) {
                if ($text === '') {
                    error_log(sprintf(
                        'Gemini chat returned parts with no text/functionCall (round %d): finishReason=%s parts=%s',
                        $round,
                        $result['candidates'][0]['finishReason'] ?? 'none',
                        json_encode($parts)
                    ));
                }
                return ['reply' => $text !== '' ? $text : null, 'ready' => $ready];
            }

            // Echo the model's turn back exactly as received — thinking-enabled
            // models attach an opaque thoughtSignature alongside each
            // functionCall part that must be round-tripped verbatim, or the
            // model can't correctly process the tool result on the next turn.
            // Reconstructing a stripped-down {functionCall} part here (as an
            // earlier version of this code did) silently breaks every
            // tool-using turn while plain text turns keep working fine.
            //
            // Also: json_decode(..., true) turns Gemini's empty `{}` (e.g. a
            // no-arg tool's args) into a PHP `[]`, which json_encode then
            // re-serializes as a JSON *array*, not the object Gemini sent —
            // it rejects that on the next call. Restore `{}` before echoing.
            $echoParts = $parts;
            foreach ($echoParts as &$p) {
                if (($p['functionCall']['args'] ?? null) === []) {
                    $p['functionCall']['args'] = (object) [];
                }
            }
            unset($p);
            $contents[] = ['role' => 'model', 'parts' => $echoParts];

            // One functionResponse part per call, in the same order (required
            // for parallel/multi function calls in a single turn).
            $responseParts = [];
            foreach ($functionCalls as $call) {
                $toolResponse = $toolExecutor($call['name'], $call['args'] ?? []);
                if ($toolResponse === []) {
                    $toolResponse = (object) []; // same empty-object-vs-array fix, for no-data tool results
                }
                $responsePart = ['functionResponse' => ['name' => $call['name'], 'response' => $toolResponse]];
                if (isset($call['id'])) {
                    $responsePart['functionResponse']['id'] = $call['id'];
                }
                $responseParts[] = $responsePart;
            }
            $contents[] = ['role' => 'user', 'parts' => $responseParts];
        }

        return $onExhaustedFallback !== null ? $onExhaustedFallback() : null;
    }

    /**
     * Fallback for when Gemini fails entirely (quota, outage, bad response):
     * runs the same tool-calling conversation against OpenRouter instead,
     * using OpenAI-style tools/tool_calls. This is a whole separate,
     * self-contained turn (not a mid-conversation provider swap) — Gemini's
     * thoughtSignature and OpenAI's tool_call_id have no equivalent in the
     * other format, so there's no safe way to hand off partway through a
     * round; either the whole turn runs on one provider or the other.
     *
     * @return array{reply: ?string, ready: bool}|null null only on a hard failure (caller falls back to the next provider)
     */
    private static function chatWithOpenRouter(
        string $apiKey,
        string $system,
        array $toolDeclarations,
        callable $toolExecutor,
        array $transcript,
        ?callable $onExhaustedFallback,
        int $maxToolRounds
    ): ?array {
        $messages = [['role' => 'system', 'content' => $system]];
        // See chatWithGemini — full transcript, not a truncated tail.
        foreach ($transcript as $turn) {
            $messages[] = ['role' => $turn['role'] === 'user' ? 'user' : 'assistant', 'content' => $turn['text']];
        }

        $tools = self::toolDeclarationsOpenAiFormat($toolDeclarations);
        $model = Settings::get('openrouter_model') ?: 'openrouter/free';
        $ready = false;

        for ($round = 0; $round < $maxToolRounds; $round++) {
            // Without an explicit cap, OpenRouter prices the request against the
            // model's full context window (seen live: "requested up to 64000
            // tokens") regardless of how much text actually comes back — which
            // can 402 an account that has real credits, just not 64k-tokens'
            // worth. Chat replies are short per the system prompt, so this
            // mirrors Gemini's maxOutputTokens cap above at no real cost.
            // Kept well under 2048 (also seen live: a 402 for lacking the last
            // ~80 tokens of that budget on a low/near-zero balance) since a
            // real chat reply never needs anywhere close to it.
            $payload = ['model' => $model, 'messages' => $messages, 'max_tokens' => 1024];
            // See chatWithGemini — force text on the last round so a model
            // wanting a second sequential tool call can't run out the clock
            // on functionCalls and never produce a reply.
            if ($round < $maxToolRounds - 1) {
                $payload['tools'] = $tools;
            }
            $result = self::callOpenRouterRaw($apiKey, $payload, self::OPENROUTER_CHAT_TIMEOUT_SECONDS);
            if ($result === null) {
                return $onExhaustedFallback !== null ? $onExhaustedFallback() : null;
            }

            $message = $result['choices'][0]['message'] ?? null;
            if (!is_array($message)) {
                error_log('OpenRouter chat: no message in response: ' . json_encode($result));
                return $onExhaustedFallback !== null ? $onExhaustedFallback() : null;
            }

            $toolCalls = $message['tool_calls'] ?? null;
            if (!$toolCalls) {
                $text = $message['content'] ?? null;
                return ['reply' => $text !== null && $text !== '' ? $text : null, 'ready' => $ready];
            }

            // Echo the assistant's own tool-call turn back verbatim (OpenAI
            // format requires this preceding message to carry the same
            // tool_calls the model just made), then one "tool" message per
            // call carrying that tool's result, matched by tool_call_id.
            $messages[] = $message;
            foreach ($toolCalls as $call) {
                $name = $call['function']['name'] ?? '';
                $args = json_decode($call['function']['arguments'] ?? '{}', true) ?: [];
                $toolResult = $toolExecutor($name, $args);
                $messages[] = [
                    'role' => 'tool',
                    'tool_call_id' => $call['id'] ?? '',
                    'content' => json_encode($toolResult),
                ];
            }
        }

        return $onExhaustedFallback !== null ? $onExhaustedFallback() : null;
    }

    /**
     * Second fallback, tried only after both Gemini and OpenRouter have
     * failed: same tool-calling conversation, same OpenAI-style
     * tools/tool_calls shape as chatWithOpenRouter (Groq's API is
     * OpenAI-compatible), just a different endpoint/key/model. Kept as its
     * own method rather than parameterizing chatWithOpenRouter because the
     * two providers may drift in header/quirk requirements over time, and
     * this stays a straight copy-and-adjust if that happens.
     *
     * @return array{reply: ?string, ready: bool}|null null only on a hard failure (caller falls back to keywords)
     */
    private static function chatWithGroq(
        string $apiKey,
        string $system,
        array $toolDeclarations,
        callable $toolExecutor,
        array $transcript,
        ?callable $onExhaustedFallback,
        ?callable $onGroqFailedGeneration,
        int $maxToolRounds
    ): ?array {
        $messages = [['role' => 'system', 'content' => $system]];
        foreach ($transcript as $turn) {
            $messages[] = ['role' => $turn['role'] === 'user' ? 'user' : 'assistant', 'content' => $turn['text']];
        }

        $tools = self::toolDeclarationsOpenAiFormat($toolDeclarations);
        $model = Settings::get('groq_model') ?: 'llama-3.3-70b-versatile';
        $ready = false;

        for ($round = 0; $round < $maxToolRounds; $round++) {
            // See chatWithOpenRouter — same reasoning: cap output tokens to what
            // a short chat reply actually needs, both to avoid an affordability
            // rejection and to stop padding the daily token budget unnecessarily.
            $payload = ['model' => $model, 'messages' => $messages, 'max_tokens' => 2048];
            if ($round < $maxToolRounds - 1) {
                $payload['tools'] = $tools;
                $payload['tool_choice'] = 'auto';
                $payload['parallel_tool_calls'] = false;
            }
            $result = self::callGroqRaw($apiKey, $payload, self::GROQ_CHAT_TIMEOUT_SECONDS);
            if ($result === null) {
                return $onExhaustedFallback !== null ? $onExhaustedFallback() : null;
            }
            if (isset($result['_groq_failed_generation'])) {
                $recovered = $onGroqFailedGeneration !== null
                    ? $onGroqFailedGeneration((string) $result['_groq_failed_generation'])
                    : null;
                if ($recovered !== null) {
                    return $recovered;
                }
                return $onExhaustedFallback !== null ? $onExhaustedFallback() : null;
            }

            $message = $result['choices'][0]['message'] ?? null;
            if (!is_array($message)) {
                error_log('Groq chat: no message in response: ' . json_encode($result));
                return $onExhaustedFallback !== null ? $onExhaustedFallback() : null;
            }

            $toolCalls = $message['tool_calls'] ?? null;
            if (!$toolCalls) {
                $text = $message['content'] ?? null;
                return ['reply' => $text !== null && $text !== '' ? $text : null, 'ready' => $ready];
            }

            $messages[] = $message;
            foreach ($toolCalls as $call) {
                $name = $call['function']['name'] ?? '';
                $args = json_decode($call['function']['arguments'] ?? '{}', true) ?: [];
                $toolResult = $toolExecutor($name, $args);
                $messages[] = [
                    'role' => 'tool',
                    'tool_call_id' => $call['id'] ?? '',
                    'content' => json_encode($toolResult),
                ];
            }
        }

        return $onExhaustedFallback !== null ? $onExhaustedFallback() : null;
    }

    private static function callGeminiRaw(string $apiKey, string $body, int $timeout): array
    {
        if (!function_exists('curl_init')) {
            return []; // no curl on this host — callers fall back gracefully
        }
        // Pinned, and configurable like openrouter_model/groq_model — this was
        // hardcoded to gemini-flash-latest, a rolling alias that tracks Google's
        // newest Flash and therefore the most contended one. It returned a steady
        // stream of "503 This model is currently experiencing high demand", which
        // no amount of credit fixes: 503 is Google's capacity, not your quota
        // (that's 429) or your billing (403). A pinned mature model has settled
        // capacity, and Beacon/Lisa only need snippet-level judgement anyway.
        $model = Settings::get('gemini_model') ?: 'gemini-2.5-flash';
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            . rawurlencode($model) . ':generateContent?key=' . $apiKey;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_TIMEOUT => $timeout,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            // Silent failures here are indistinguishable from "model declined to
            // answer" without this — log enough to diagnose a bad request shape
            // (e.g. a malformed tool-response turn) versus a real outage.
            error_log(sprintf(
                'Gemini API call failed: status=%s curl_error=%s body=%s',
                $status,
                $curlError !== '' ? $curlError : 'none',
                $response !== false ? substr($response, 0, 800) : 'n/a'
            ));
            return [];
        }
        return json_decode($response, true) ?? [];
    }

    private static function callOpenRouterRaw(string $apiKey, array $payload, int $timeout): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $ch = curl_init('https://openrouter.ai/api/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
                'HTTP-Referer: https://princecaleb.dev',
                'X-Title: Prince Caleb Portfolio',
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => $timeout,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'Live Chat OpenRouter fallback failed: status=%s body=%s',
                $status,
                is_string($response) ? substr($response, 0, 800) : 'n/a'
            ));
            return null;
        }

        return json_decode($response, true);
    }

    private static function callGroqRaw(string $apiKey, array $payload, int $timeout): ?array
    {
        if (!function_exists('curl_init')) {
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
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => $timeout,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            $decoded = is_string($response) ? json_decode($response, true) : null;
            if (is_array($decoded)
                && ($decoded['error']['code'] ?? '') === 'tool_use_failed'
                && !empty($decoded['error']['failed_generation'])) {
                error_log('Live Chat Groq tool-use failed; attempting backend recovery from failed_generation.');
                return ['_groq_failed_generation' => (string) $decoded['error']['failed_generation']];
            }
            error_log(sprintf(
                'Live Chat Groq fallback failed: status=%s body=%s',
                $status,
                is_string($response) ? substr($response, 0, 800) : 'n/a'
            ));
            return null;
        }

        return json_decode($response, true);
    }

    /** Translates Gemini-format tool declarations to OpenAI-style tools/functions — one source of truth for both. */
    private static function toolDeclarationsOpenAiFormat(array $toolDeclarations): array
    {
        $tools = [];
        foreach ($toolDeclarations as $decl) {
            $params = $decl['parameters'];
            $params['type'] = strtolower($params['type']);
            if (isset($params['properties']) && is_array($params['properties'])) {
                foreach ($params['properties'] as &$prop) {
                    if (isset($prop['type'])) {
                        $prop['type'] = strtolower($prop['type']);
                    }
                }
                unset($prop);
            }
            $tools[] = [
                'type' => 'function',
                'function' => [
                    'name' => $decl['name'],
                    'description' => $decl['description'],
                    'parameters' => $params,
                ],
            ];
        }
        return $tools;
    }
}
