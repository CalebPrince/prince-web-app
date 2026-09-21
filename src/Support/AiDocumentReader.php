<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Reads a PDF or image with a vision-capable model and returns its text.
 * Ada's document intake used to call Gemini directly, so one Gemini outage
 * or quota hit meant no document could be read at all. This tries Gemini,
 * then Anthropic, then OpenAI, skipping any provider without a key, using
 * the same settings keys as AiText/AiAgentEngine.
 */
final class AiDocumentReader
{
    private const CONNECT_TIMEOUT = 8;

    private static ?string $lastError = null;

    public static function lastError(): ?string
    {
        return self::$lastError;
    }

    /**
     * @param string $mime   e.g. application/pdf, image/png
     * @param string $base64 the file's bytes, base64-encoded
     * @return string|null null when no configured provider could read it
     */
    public static function transcribe(string $mime, string $base64, string $prompt, int $timeout = 45): ?string
    {
        self::$lastError = null;
        $legs = [
            ['Gemini', 'gemini_api_key', fn(string $k) => self::gemini($k, $mime, $base64, $prompt, $timeout)],
            ['Anthropic', 'anthropic_api_key', fn(string $k) => self::anthropic($k, $mime, $base64, $prompt, $timeout)],
            ['OpenAI', 'openai_api_key', fn(string $k) => self::openai($k, $mime, $base64, $prompt, $timeout)],
        ];

        $failures = [];
        foreach ($legs as [$name, $setting, $call]) {
            $key = trim((string) Settings::get($setting));
            if ($key === '') {
                continue;
            }
            $text = $call($key);
            if ($text !== null && trim($text) !== '') {
                return trim($text);
            }
            $failures[] = $name;
        }

        self::$lastError = $failures === []
            ? 'no vision-capable AI provider is configured (add a Gemini, Anthropic or OpenAI key in Settings)'
            : 'every provider failed to read it: ' . implode(', ', $failures);
        return null;
    }

    /** @return array<string,mixed>|null decoded JSON on HTTP 200, else null */
    private static function post(string $label, string $url, array $headers, array $payload, int $timeout): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => min(self::CONNECT_TIMEOUT, $timeout),
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($body === false || $status !== 200) {
            error_log(sprintf(
                'AiDocumentReader: %s failed: status=%d body=%s',
                $label,
                $status,
                is_string($body) ? substr($body, 0, 400) : 'n/a'
            ));
            return null;
        }
        $decoded = json_decode($body, true);
        return is_array($decoded) ? $decoded : null;
    }

    private static function gemini(string $key, string $mime, string $base64, string $prompt, int $timeout): ?string
    {
        $json = self::post(
            'Gemini',
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' . urlencode($key),
            [],
            ['contents' => [['role' => 'user', 'parts' => [
                ['inline_data' => ['mime_type' => $mime, 'data' => $base64]],
                ['text' => $prompt],
            ]]]],
            $timeout
        );
        $text = '';
        foreach ($json['candidates'][0]['content']['parts'] ?? [] as $part) {
            $text .= $part['text'] ?? '';
        }
        return $text !== '' ? $text : null;
    }

    private static function anthropic(string $key, string $mime, string $base64, string $prompt, int $timeout): ?string
    {
        $block = $mime === 'application/pdf'
            ? ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => $mime, 'data' => $base64]]
            : ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $mime, 'data' => $base64]];

        $json = self::post(
            'Anthropic',
            'https://api.anthropic.com/v1/messages',
            ['x-api-key: ' . $key, 'anthropic-version: 2023-06-01'],
            [
                'model' => Settings::get('anthropic_model') ?: 'claude-sonnet-4-5-20250929',
                'max_tokens' => 8000,
                'messages' => [['role' => 'user', 'content' => [$block, ['type' => 'text', 'text' => $prompt]]]],
            ],
            $timeout
        );
        foreach ($json['content'] ?? [] as $part) {
            if (($part['type'] ?? '') === 'text' && !empty($part['text'])) {
                return (string) $part['text'];
            }
        }
        return null;
    }

    private static function openai(string $key, string $mime, string $base64, string $prompt, int $timeout): ?string
    {
        $dataUrl = 'data:' . $mime . ';base64,' . $base64;
        $block = $mime === 'application/pdf'
            ? ['type' => 'file', 'file' => ['filename' => 'document.pdf', 'file_data' => $dataUrl]]
            : ['type' => 'image_url', 'image_url' => ['url' => $dataUrl]];

        $json = self::post(
            'OpenAI',
            'https://api.openai.com/v1/chat/completions',
            ['Authorization: Bearer ' . $key],
            [
                'model' => Settings::get('openai_model') ?: 'gpt-4o-mini',
                'max_tokens' => 8000,
                'messages' => [['role' => 'user', 'content' => [['type' => 'text', 'text' => $prompt], $block]]],
            ],
            $timeout
        );
        $text = $json['choices'][0]['message']['content'] ?? null;
        return is_string($text) && $text !== '' ? $text : null;
    }
}
