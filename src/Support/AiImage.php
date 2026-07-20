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
    // Above this, cover-cropping to the exact target size would trim more
    // than this fraction off the overflowing axis — enough to plausibly
    // slice through a headline near that edge (seen live even after asking
    // the model for a safe margin, since composition instructions aren't
    // reliably followed). Below it, a full-bleed cover-crop looks better
    // than padding for a mismatch this small, and is safe to trim.
    private const MAX_SAFE_CROP_FRACTION = 0.12;

    /**
     * Generate a flyer/graphic and save it under public/uploads, returning its
     * web path. Returns null on any failure (no key, provider error, safety
     * block, un-decodable bytes) — the caller surfaces that to the agent.
     *
     * $logoPath, if given (a real filesystem path), is sent alongside the text
     * prompt as a second reference image so the model can draw from Caleb's
     * actual logo file instead of inventing a mark from a text description —
     * see callGemini(). It's read straight off disk, never re-encoded here.
     *
     * $backgroundColor (hex) fills any padding fitToPng() needs when the
     * model's actual output ratio is too far off the target to safely
     * cover-crop — pass whichever surface color the flyer's own background
     * is meant to be so the padding blends in rather than reading as an
     * error bar.
     *
     * $formatHint frames what kind of image this is meant to look like —
     * defaults to the original social-graphic framing so every existing
     * flyer call is unaffected; a caller generating something else (e.g. a
     * UI mockup, which is not "a social media graphic") should pass its own.
     *
     * $filePrefix names the saved file (default 'flyer') purely so
     * public/uploads stays sortable/greppable by what generated it — has no
     * effect on the image itself.
     *
     * @return array{url:string,width:int,height:int}|null
     */
    public static function generateFlyer(
        string $prompt,
        int $width,
        int $height,
        int $timeout = 60,
        ?string $logoPath = null,
        string $backgroundColor = '#0b0c0e',
        string $formatHint = 'a polished, on-brand social media graphic',
        string $filePrefix = 'flyer'
    ): ?array {
        $apiKey = Settings::get('gemini_api_key');
        if (empty($apiKey) || !function_exists('curl_init') || !function_exists('imagecreatefromstring')) {
            return null;
        }

        $bytes = self::callGemini((string) $apiKey, $prompt, $width, $height, $timeout, $logoPath, $formatHint);
        if ($bytes === null) {
            return null;
        }

        $png = self::fitToPng($bytes, $width, $height, $backgroundColor);
        if ($png === null) {
            return null;
        }

        // DOCUMENT_ROOT, not a hardcoded '../../public', because production
        // deploys public/'s contents into public_html/ (see README's deploy
        // layout) — a file written under a literal "public/" folder next to
        // src/ would sit outside the web root and 404 forever. DOCUMENT_ROOT
        // is the one thing that's correct in both environments (see the same
        // pattern in SettingsController::adminUpdate()'s maintenance marker).
        $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? (dirname(__DIR__, 2) . '/public');
        $dir = $docRoot . '/uploads';
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            error_log('AiImage: uploads directory is missing and could not be created.');
            return null;
        }
        $filename = $filePrefix . '-' . bin2hex(random_bytes(8)) . '.png';
        if (@file_put_contents($dir . '/' . $filename, $png) === false) {
            error_log('AiImage: could not write generated flyer to uploads.');
            return null;
        }

        return ['url' => '/uploads/' . $filename, 'width' => $width, 'height' => $height];
    }

    /** @return string|null raw image bytes the model returned, or null on failure */
    private static function callGemini(
        string $apiKey,
        string $prompt,
        int $width,
        int $height,
        int $timeout,
        ?string $logoPath = null,
        string $formatHint = 'a polished, on-brand social media graphic'
    ): ?string {
        $model = Settings::get('gemini_image_model') ?: 'gemini-2.5-flash-image';

        // The model can't be forced to an exact pixel size, but naming the
        // orientation + closest standard aspect ratio steers it close before
        // the GD cover-crop makes it exact — without this it often returns a
        // square for a request that needed a tall story graphic. Even so, its
        // actual ratio rarely matches ours exactly, so coverCropToPng() always
        // trims some of one axis — the explicit safe-margin instruction below
        // is what keeps that trim from slicing through headline text.
        $ratioHint = self::aspectRatioHint($width, $height);
        $fullPrompt = $prompt . "\n\nFormat: " . $formatHint . " in "
            . $ratioHint . ". IMPORTANT: this image will be automatically center-cropped afterward to an "
            . "exact final size, which trims some of the outer edge on at least one side. Keep all text and "
            . "essential visual elements within the center 80% of the frame — leave a generous, uncluttered "
            . "margin on all four sides (top, bottom, left, right) and never let a headline run so large or so "
            . "close to an edge that a modest crop could cut off any letters.";

        // Nano Banana accepts multiple image parts in one request (image-to-image
        // composition, not just text-to-image) — attaching the real logo file
        // as a reference image lets it draw from the actual mark instead of
        // inventing one from a text description. It still won't reproduce it
        // pixel-perfect, so this is "faithful reference" not exact compositing.
        $parts = [];
        $logoBytes = ($logoPath !== null) ? @file_get_contents($logoPath) : false;
        if ($logoBytes !== false && $logoBytes !== '') {
            $imageInfo = @getimagesizefromstring($logoBytes);
            $mimeType = $imageInfo['mime'] ?? 'image/png';
            $parts[] = ['inlineData' => ['mimeType' => $mimeType, 'data' => base64_encode($logoBytes)]];
            $fullPrompt .= "\n\nThe attached image is Caleb's real logo (the rounded-square \"P\" mark and "
                . "wordmark). Recreate it faithfully as a small, natural accent somewhere in the composition — "
                . "do not distort, recolor, or reinterpret it into a different mark.";
        }
        $parts[] = ['text' => $fullPrompt];

        $payload = ['contents' => [['role' => 'user', 'parts' => $parts]]];

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
     * Fit the source into exactly {tw}x{th} and re-encode as PNG. When the
     * model's actual aspect ratio is close enough to the target, this covers
     * the frame edge-to-edge and center-crops the small overflow (the common
     * case — aspectRatioHint already steers Gemini close). When it isn't
     * close, cropping that much risks slicing through a headline near the
     * overflowing edge, so this switches to a contain-fit instead — the
     * whole image visible, nothing cropped — and pads the leftover margin
     * with $backgroundColor. Returns null if the bytes aren't a decodable
     * raster image.
     */
    private static function fitToPng(string $bytes, int $tw, int $th, string $backgroundColor): ?string
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

        $coverScale = max($tw / $sw, $th / $sh);
        $coverW = $sw * $coverScale;
        $coverH = $sh * $coverScale;
        // How much a cover-crop would have to trim off whichever axis
        // overflows, as a fraction of that axis — small enough here means
        // safe to crop; otherwise fall back to an uncropped contain-fit.
        $cropFraction = max(($coverW - $tw) / $tw, ($coverH - $th) / $th);
        $scale = $cropFraction <= self::MAX_SAFE_CROP_FRACTION ? $coverScale : min($tw / $sw, $th / $sh);

        $rw = (int) round($sw * $scale);
        $rh = (int) round($sh * $scale);
        $dx = (int) round(($tw - $rw) / 2);
        $dy = (int) round(($th - $rh) / 2);

        $dst = imagecreatetruecolor($tw, $th);
        [$r, $g, $b] = self::hexToRgb($backgroundColor);
        $bg = imagecolorallocate($dst, $r, $g, $b);
        imagefill($dst, 0, 0, $bg);
        imagecopyresampled($dst, $src, $dx, $dy, 0, 0, $rw, $rh, $sw, $sh);

        ob_start();
        imagepng($dst);
        $png = ob_get_clean();

        imagedestroy($src);
        imagedestroy($dst);

        return $png !== false && $png !== '' ? $png : null;
    }

    /** @return array{0:int,1:int,2:int} RGB, falling back to near-black on anything unparseable. */
    private static function hexToRgb(string $hex): array
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) {
            $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
        }
        if (!preg_match('/^[0-9a-fA-F]{6}$/', $hex)) {
            return [11, 12, 14];
        }
        return [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];
    }
}
