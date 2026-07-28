<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\RateLimitMiddleware;
use App\Support\Response;
use App\Support\Settings;

class TextToSpeechController
{
    /**
     * Turn a short Lisa reply into audio without ever exposing the ElevenLabs
     * API key to the browser. This is intentionally rate- and length-limited:
     * the public chat should not become an open text-to-speech proxy.
     */
    public static function speak(): void
    {
        RateLimitMiddleware::enforce('elevenlabs_tts', 50);

        if (Settings::get('elevenlabs_tts_enabled') !== '1') {
            Response::error('Natural website speech is not enabled.', 503);
        }

        $apiKey = trim((string) Settings::get('elevenlabs_api_key'));
        $voiceId = trim((string) Settings::get('elevenlabs_voice_id'));
        $modelId = trim((string) Settings::get('elevenlabs_tts_model'));
        if ($apiKey === '' || $voiceId === '') {
            Response::error('Natural website speech is not configured.', 503);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $text = trim((string) ($data['text'] ?? ''));
        if ($text === '') {
            Response::error('Text is required.', 422);
        }
        if (mb_strlen($text) > 700) {
            Response::error('Text is too long for website speech.', 422);
        }
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
