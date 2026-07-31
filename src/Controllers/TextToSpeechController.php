<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\Response;
use App\Support\Settings;

class TextToSpeechController
{
    /**
     * Every agent that gets a real ElevenLabs voice, mapped to the Settings
     * key holding its voice ID. Lisa is the original/default; Scout is the
     * only other agent with a dedicated voice so far — everyone else still
     * uses the browser's own speechSynthesis (see admin-agent-chat.js).
     */
    private const AGENT_VOICE_SETTING = [
        'lisa' => 'elevenlabs_voice_id',
        'scout' => 'scout_elevenlabs_voice_id',
    ];

    /**
     * Max characters synthesized per agent. Lisa's 700 is a deliberate public-
     * abuse guard (this endpoint has no auth check for her — the public
     * widget calls it directly), sized for her short conversational replies.
     * Scout's admin-console answers run much longer (a brainstormed list with
     * reasoning easily clears 700 chars), so a text cut off at 700 played as
     * audio that just stopped mid-sentence — the actual bug reported. Scout
     * gets a real admin-auth check below instead, so the higher cap can't be
     * hit by an anonymous caller racking up ElevenLabs cost.
     */
    private const MAX_TEXT_LENGTH = [
        'lisa' => 700,
        'scout' => 3000,
    ];

    /**
     * Turn a short agent reply into audio without ever exposing the
     * ElevenLabs API key to the browser. Lisa's path is intentionally rate-
     * and length-limited and stays open to the public widget; every other
     * agent requires an authenticated admin session (see MAX_TEXT_LENGTH).
     */
    public static function speak(): void
    {
        RateLimitMiddleware::enforce('elevenlabs_tts', 50);

        if (Settings::get('elevenlabs_tts_enabled') !== '1') {
            Response::error('Natural website speech is not enabled.', 503);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $agent = trim((string) ($data['agent'] ?? 'lisa'));
        if ($agent !== 'lisa') {
            AuthMiddleware::requireAuth();
        }
        $voiceSettingKey = self::AGENT_VOICE_SETTING[$agent] ?? self::AGENT_VOICE_SETTING['lisa'];
        $maxLength = self::MAX_TEXT_LENGTH[$agent] ?? self::MAX_TEXT_LENGTH['lisa'];

        $apiKey = trim((string) Settings::get('elevenlabs_api_key'));
        // Scout falls back to Lisa's voice ID until an admin sets its own —
        // still a real, working voice rather than a hard failure.
        $voiceId = trim((string) Settings::get($voiceSettingKey)) ?: trim((string) Settings::get('elevenlabs_voice_id'));
        $modelId = trim((string) Settings::get('elevenlabs_tts_model'));
        if ($apiKey === '' || $voiceId === '') {
            Response::error('Natural website speech is not configured.', 503);
        }

        $text = trim((string) ($data['text'] ?? ''));
        if ($text === '') {
            Response::error('Text is required.', 422);
        }
        // Truncated, not rejected — the client already truncates to the same
        // length before sending, so this is a graceful backstop, not the
        // normal path.
        $text = mb_substr($text, 0, $maxLength);
        $text = self::normalizeForSpeech($text);

        $url = 'https://api.elevenlabs.io/v1/text-to-speech/'
            . rawurlencode($voiceId)
            . '?output_format=mp3_44100_128';
        $payload = json_encode([
            'text' => $text,
            'model_id' => $modelId !== '' ? $modelId : 'eleven_flash_v2_5',
            'voice_settings' => [
                'stability' => 0.48,
                'similarity_boost' => 0.78,
                'style' => 0.18,
                'use_speaker_boost' => true,
            ],
        ]);

        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: audio/mpeg',
                'xi-api-key: ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => $payload,
        ]);
        $audio = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $error = curl_error($curl);

        if ($audio === false || $status < 200 || $status >= 300) {
            error_log('ElevenLabs TTS failed: HTTP ' . $status . ($error ? ' - ' . $error : ''));
            Response::error('Natural speech is temporarily unavailable.', 502);
        }

        header('Content-Type: audio/mpeg');
        header('Content-Length: ' . strlen((string) $audio));
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');
        echo $audio;
        exit;
    }

    /**
     * Expand business-specific abbreviations before synthesis. The visible
     * chat copy keeps the compact currency code; only Lisa's spoken copy is
     * changed, e.g. "GHS 600" becomes "600 Ghana cedis".
     */
    private static function normalizeForSpeech(string $text): string
    {
        $amount = '([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)';
        $text = preg_replace('/\bGHS\s*' . $amount . '\b/i', '$1 Ghana cedis', $text) ?? $text;
        $text = preg_replace('/\b' . $amount . '\s*GHS\b/i', '$1 Ghana cedis', $text) ?? $text;
        return $text;
    }
}
