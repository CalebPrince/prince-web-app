<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Single-shot "prompt in, image out" generation via Google's Gemini image
 * model (a.k.a. "Nano Banana", gemini-2.5-flash-image), reusing the same
 * gemini_api_key the text pipeline already uses. Kept separate from AiText
 * because the response shape is different (inline image bytes, not text) and
 * there is no OpenRouter/Groq fallback — image generation is Gemini-only here.
 *
 * The model returns an image in an aspect ratio it chooses from the prompt, not
 * at exact pixel dimensions, so every result is cover-cropped with GD to the
 * precise size the caller asked for (a real social platform size). That both
 * guarantees the file is exactly, say, 1080x1080 and normalizes output to PNG
 * regardless of what the model returned.
 */
class AiImage
{
    /**
     * Generate a flyer/graphic and save it under public/uploads, returning its
     * web path. Returns null on any failure (no key, provider error, safety
     * block, un-decodable bytes) — the caller surfaces that to the agent.
     *
     * @return array{url:string,width:int,height:int}|null
     */
    public static function generateFlyer(string $prompt, int $width, int $height, int $timeout = 60): ?array
    {
        $apiKey = Settings::get('gemini_api_key');
        if (empty($apiKey) || !function_exists('curl_init') || !function_exists('imagecreatefromstring')) {
            return null;
        }

        $bytes = self::callGemini((string) $apiKey, $prompt, $width, $height, $timeout);
        if ($bytes === null) {
            return null;
        }

        $png = self::coverCropToPng($bytes, $width, $height);
        if ($png === null) {
            return null;
        }

        $dir = dirname(__DIR__, 2) . '/public/uploads';
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            error_log('AiImage: uploads directory is missing and could not be created.');
            return null;
        }
        $filename = 'flyer-' . bin2hex(random_bytes(8)) . '.png';
        if (@file_put_contents($dir . '/' . $filename, $png) === false) {
            error_log('AiImage: could not write generated flyer to uploads.');
            return null;
        }

        return ['url' => '/uploads/' . $filename, 'width' => $width, 'height' => $height];
    }

    /** @return string|null raw image bytes the model returned, or null on failure */
    private static function callGemini(string $apiKey, string $prompt, int $width, int $height, int $timeout): ?string
    {
        $model = Settings::get('gemini_image_model') ?: 'gemini-2.5-flash-image';

        // The model can't be forced to an exact pixel size, but naming the
        // orientation + closest standard aspect ratio steers it close before
        // the GD cover-crop makes it exact — without this it often returns a
        // square for a request that needed a tall story graphic.
        $ratioHint = self::aspectRatioHint($width, $height);
        $fullPrompt = $prompt . "\n\nFormat: a polished, on-brand social media graphic in "
            . $ratioHint . ". Compose it so nothing important is cut off near the edges.";

        $payload = ['contents' => [['role' => 'user', 'parts' => [['text' => $fullPrompt]]]]];

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            . rawurlencode($model) . ':generateContent?key=' . $apiKey;

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
                'AiImage: Gemini image call failed: status=%s body=%s',
                $status,
                is_string($response) ? substr($response, 0, 500) : 'n/a'
            ));
            return null;
        }

        $decoded = json_decode($response, true);
        $parts = $decoded['candidates'][0]['content']['parts'] ?? [];
        foreach ($parts as $part) {
            // REST returns camelCase (inlineData/mimeType); accept snake_case too
            // in case a proxy or SDK-shaped response comes back differently.
            $data = $part['inlineData']['data'] ?? $part['inline_data']['data'] ?? null;
            if ($data !== null) {
                $raw = base64_decode($data, true);
                if ($raw !== false && $raw !== '') {
                    return $raw;
                }
            }
        }

        error_log(sprintf(
            'AiImage: Gemini returned 200 but no image bytes: finishReason=%s promptFeedback=%s',
            $decoded['candidates'][0]['finishReason'] ?? 'none',
            json_encode($decoded['promptFeedback'] ?? null)
        ));
        return null;
    }

    /** Nearest human-readable aspect-ratio phrase for the prompt hint. */
    private static function aspectRatioHint(int $width, int $height): string
    {
        $ratio = $width / max(1, $height);
        if ($ratio >= 1.6) {
            return 'a wide 16:9 landscape orientation';
        }
        if ($ratio >= 1.2) {
            return 'a 1.91:1 landscape orientation';
        }
        if ($ratio > 0.9) {
            return 'a 1:1 square orientation';
        }
        if ($ratio > 0.7) {
            return 'a 4:5 portrait orientation';
        }
        return 'a tall 9:16 vertical orientation';
    }

    /**
     * Scale the source to fully cover the target box, center-crop the overflow,
     * and re-encode as PNG at exactly {tw}x{th}. Returns null if the bytes
     * aren't a decodable raster image.
     */
    private static function coverCropToPng(string $bytes, int $tw, int $th): ?string
    {
        $src = @imagecreatefromstring($bytes);
        if ($src === false) {
            return null;
        }
        $sw = imagesx($src);
        $sh = imagesy($src);
        if ($sw < 1 || $sh < 1) {
            imagedestroy($src);
            return null;
        }

        $scale = max($tw / $sw, $th / $sh);
        $rw = (int) ceil($sw * $scale);
        $rh = (int) ceil($sh * $scale);
        $dx = (int) (($tw - $rw) / 2);
        $dy = (int) (($th - $rh) / 2);

        $dst = imagecreatetruecolor($tw, $th);
        imagecopyresampled($dst, $src, $dx, $dy, 0, 0, $rw, $rh, $sw, $sh);

        ob_start();
        imagepng($dst);
        $png = ob_get_clean();

        imagedestroy($src);
        imagedestroy($dst);

        return $png !== false && $png !== '' ? $png : null;
    }
}
