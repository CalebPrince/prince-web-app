<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Renders the one standing branded template every social post image uses —
 * dark editorial background, grid + corner glow, "P" logo lockup, status
 * pill, fixed eyebrow, and a bold headline (the only thing that changes per
 * post, word-wrapped and vertically centered with the rest of the fixed
 * chrome so 1-3 line headlines all sit balanced on the 1080x1080 canvas).
 * Pure GD + bundled TTFs (public/fonts/social-template/, all OFL-licensed)
 * — no external renderer, no AI image generation (which can't reliably
 * reproduce exact brand layout/text the way this needs), matching the same
 * "draw it deterministically" approach already used for blog cover art (see
 * database/generate_blog_covers.php's SVG shapes) rather than AiImage's
 * prompt-driven Gemini pipeline.
 *
 * Colors match the site's own dark-theme CSS variables (public/css/app.css)
 * so the graphic reads as the same brand, not a reinterpretation of it.
 */
class SocialImage
{
    private const W = 1080;
    private const H = 1080;
    private const PAD = 64;

    private const BG = '0b0c0e';
    private const ACCENT = '62ff98';
    private const WHITE = 'ffffff';
    private const MUTED = 'b5bac3';
    private const CHIP_BG = '11151a';
    private const PILL_BG = '13221a';

    private const DOT = "\xC2\xB7";     // ·
    private const ARROW = "\xE2\x86\x92"; // →

    private const EYEBROW = '// AI VOICE AGENTS ' . self::DOT . ' CHATBOTS ' . self::DOT . ' AUTOMATION';
    private const STATUS_PILL = 'AI AGENCY ' . self::DOT . ' ONLINE';
    private const CHIPS = ['ENQUIRY IN', 'AI QUALIFIES', 'FOLLOW-UP SENT', 'BOOKED'];
    private const CTA_LABEL = 'princecaleb.dev';

    /**
     * Renders one branded card with $title as the headline and saves it
     * under public/uploads, returning its web path. Returns null on any
     * failure (GD/FreeType missing, bundled font files missing, can't write
     * the file) — every caller treats a missing image as "post without one,"
     * never a hard failure of the post itself.
     *
     * @return array{url:string,width:int,height:int}|null
     */
    public static function generate(string $title): ?array
    {
        if (!function_exists('imagettftext') || !function_exists('imagecreatetruecolor')) {
            return null;
        }

        // Deliberately not `?? fallback` — PHP's CLI SAPI (this class's actual
        // production trigger, via database/generate_social_drafts.php's cron)
        // sets DOCUMENT_ROOT to an empty string rather than leaving it unset,
        // so `??` never falls back and every path below silently resolves
        // against the filesystem root instead of the app.
        $docRoot = !empty($_SERVER['DOCUMENT_ROOT']) ? $_SERVER['DOCUMENT_ROOT'] : dirname(__DIR__, 2) . '/public';
        $fontDir = $docRoot . '/fonts/social-template/';
        $fBlack = $fontDir . 'ArchivoBlack-Regular.ttf';
        $fMonoBold = $fontDir . 'JetBrainsMono-Bold.ttf';
        $fMonoReg = $fontDir . 'JetBrainsMono-Regular.ttf';
        if (!is_file($fBlack) || !is_file($fMonoBold) || !is_file($fMonoReg)) {
            error_log('SocialImage: bundled font file(s) missing under ' . $fontDir);
            return null;
        }

        $title = trim($title);
        if ($title === '') {
            return null;
        }

        $img = imagecreatetruecolor(self::W, self::H);
        imagealphablending($img, true);

        $bg = self::color($img, self::BG);
        imagefill($img, 0, 0, $bg);
        $accent = self::color($img, self::ACCENT);
        $white = self::color($img, self::WHITE);
        $muted = self::color($img, self::MUTED);

        self::drawGrid($img);
        self::drawGlow($img);

        $pad = self::PAD;

        // Headline sizing/wrapping decided first so the whole fixed-chrome
        // block (logo -> CTA) can be vertically centered as one unit,
        // regardless of whether the title wraps to 1, 2, or 3 lines.
        $headlineSize = 58;
        $maxW = self::W - $pad * 2;
        $lines = self::wrapText($img, $headlineSize, $fBlack, $title, $maxW);
        while (count($lines) > 3 && $headlineSize > 34) {
            $headlineSize -= 4;
            $lines = self::wrapText($img, $headlineSize, $fBlack, $title, $maxW);
        }
        $lineHeight = $headlineSize * 1.2;

        $logoH = 64;
        $eyebrowH = 24;
        $chipH = 44;
        $ctaH = 56;
        $gapLogoToEyebrow = 30;
        $gapEyebrowToHeadline = 34;
        $gapHeadlineToChips = 56;
        $gapChipsToCta = 64;

        $headlineBlockH = count($lines) * $lineHeight;
        $contentH = $logoH + $gapLogoToEyebrow + $eyebrowH + $gapEyebrowToHeadline + $headlineBlockH
            + $gapHeadlineToChips + $chipH + $gapChipsToCta + $ctaH;
        $startY = (int) ((self::H - $contentH) / 2);

        // ---- logo lockup ----
        $logoY = $startY;
        self::roundedRect($img, $pad, $logoY, $pad + 64, $logoY + 64, 16, $accent);
        $pBox = imagettfbbox(30, 0, $fBlack, 'P');
        $pW = $pBox[2] - $pBox[0];
        imagettftext($img, 30, 0, (int) ($pad + 32 - $pW / 2), $logoY + 44, $bg, $fBlack, 'P');

        $wmX = $pad + 80;
        imagettftext($img, 24, 0, $wmX, $logoY + 42, $white, $fMonoBold, 'Prince Caleb');
        $wmW = self::textWidth($img, 24, $fMonoBold, 'Prince Caleb');
        imagettftext($img, 24, 0, (int) ($wmX + $wmW + 4), $logoY + 42, $accent, $fMonoBold, '.');

        // ---- status pill, top-right ----
        $pillTextW = self::textWidth($img, 13, $fMonoBold, self::STATUS_PILL);
        $pillW = $pillTextW + 56;
        $pillX2 = self::W - $pad;
        $pillX1 = (int) ($pillX2 - $pillW);
        $pillY1 = $logoY;
        $pillY2 = $logoY + 34;
        self::roundedRect($img, $pillX1, $pillY1, $pillX2, $pillY2, 17, self::color($img, self::PILL_BG));
        imagefilledellipse($img, $pillX1 + 22, (int) (($pillY1 + $pillY2) / 2), 8, 8, $accent);
        imagettftext($img, 13, 0, $pillX1 + 34, $pillY1 + 22, $accent, $fMonoBold, self::STATUS_PILL);

        // ---- eyebrow ----
        $eyebrowY = $logoY + $logoH + $gapLogoToEyebrow + $eyebrowH;
        imagettftext($img, 16, 0, $pad, $eyebrowY, $accent, $fMonoBold, self::EYEBROW);

        // ---- headline (last line/only line rendered in accent) ----
        $headlineY = $eyebrowY + $gapEyebrowToHeadline + $headlineSize;
        foreach ($lines as $i => $line) {
            $color = ($i === count($lines) - 1) ? $accent : $white;
            imagettftext($img, $headlineSize, 0, $pad, (int) ($headlineY + $i * $lineHeight), $color, $fBlack, $line);
        }
        $headlineBottom = $headlineY + (count($lines) - 1) * $lineHeight;

        // ---- workflow chips ----
        $chipY1 = (int) ($headlineBottom + $gapHeadlineToChips - $headlineSize * 0.3);
        $chipY2 = $chipY1 + $chipH;
        $cx = $pad;
        $chipBg = self::color($img, self::CHIP_BG);
        $lastIdx = count(self::CHIPS) - 1;
        foreach (self::CHIPS as $idx => $label) {
            $lw = self::textWidth($img, 14, $fMonoBold, $label);
            $chipW = $lw + 48;
            self::roundedRect($img, (int) $cx, $chipY1, (int) ($cx + $chipW), $chipY2, 22, $chipBg);
            imagefilledellipse($img, (int) $cx + 20, (int) (($chipY1 + $chipY2) / 2), 8, 8, $accent);
            imagettftext($img, 14, 0, (int) $cx + 34, $chipY1 + 28, $white, $fMonoBold, $label);
            $cx += $chipW + 16;
            if ($idx < $lastIdx) {
                imagettftext($img, 17, 0, (int) $cx, $chipY1 + 29, $muted, $fMonoReg, self::ARROW);
                $cx += 32;
            }
        }

        // ---- CTA pill, bottom-right ----
        $ctaTextW = self::textWidth($img, 18, $fMonoBold, self::CTA_LABEL);
        $ctaW = $ctaTextW + 60;
        $ctaX2 = self::W - $pad;
        $ctaX1 = (int) ($ctaX2 - $ctaW);
        $ctaY1 = $chipY2 + $gapChipsToCta;
        $ctaY2 = $ctaY1 + $ctaH;
        self::roundedRect($img, $ctaX1, $ctaY1, $ctaX2, $ctaY2, 28, $accent);
        imagettftext($img, 18, 0, $ctaX1 + 30, $ctaY1 + 36, $bg, $fMonoBold, self::CTA_LABEL);

        $dir = $docRoot . '/uploads';
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            error_log('SocialImage: uploads directory is missing and could not be created.');
            return null;
        }

        // No imagedestroy() — deprecated since PHP 8.0 (no-op, handles
        // auto-free), and calling it on 8.5 emits a deprecation notice that
        // leaks raw HTML into JSON responses (same issue already hit and
        // documented for curl_close() in Composio.php).
        ob_start();
        imagepng($img);
        $png = ob_get_clean();

        if ($png === false || $png === '') {
            return null;
        }

        $filename = 'social-' . bin2hex(random_bytes(8)) . '.png';
        if (@file_put_contents($dir . '/' . $filename, $png) === false) {
            error_log('SocialImage: could not write generated card to uploads.');
            return null;
        }

        return ['url' => '/uploads/' . $filename, 'width' => self::W, 'height' => self::H];
    }

    private static function color($img, string $hex, int $alpha = 0)
    {
        $hex = ltrim($hex, '#');
        [$r, $g, $b] = [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];
        return $alpha > 0 ? imagecolorallocatealpha($img, $r, $g, $b, $alpha) : imagecolorallocate($img, $r, $g, $b);
    }

    /** Faint full-bleed grid — echoes the "digital blueprint" motif used elsewhere on the site. */
    private static function drawGrid($img): void
    {
        $line = self::color($img, self::WHITE, 122);
        for ($x = 0; $x <= self::W; $x += 54) {
            imageline($img, $x, 0, $x, self::H, $line);
        }
        for ($y = 0; $y <= self::H; $y += 54) {
            imageline($img, 0, $y, self::W, $y, $line);
        }
    }

    /** Concentric translucent rings, top-right — a cheap stand-in for a soft radial glow (GD has no true blur-on-composite). */
    private static function drawGlow($img): void
    {
        for ($i = 8; $i >= 1; $i--) {
            $glow = self::color($img, self::ACCENT, 118 + $i);
            $r = $i * 60;
            imagefilledellipse($img, self::W - 120, 80, $r, $r, $glow);
        }
    }

    private static function roundedRect($img, int $x1, int $y1, int $x2, int $y2, int $r, $color): void
    {
        imagefilledrectangle($img, $x1 + $r, $y1, $x2 - $r, $y2, $color);
        imagefilledrectangle($img, $x1, $y1 + $r, $x2, $y2 - $r, $color);
        imagefilledellipse($img, $x1 + $r, $y1 + $r, $r * 2, $r * 2, $color);
        imagefilledellipse($img, $x2 - $r, $y1 + $r, $r * 2, $r * 2, $color);
        imagefilledellipse($img, $x1 + $r, $y2 - $r, $r * 2, $r * 2, $color);
        imagefilledellipse($img, $x2 - $r, $y2 - $r, $r * 2, $r * 2, $color);
    }

    private static function textWidth($img, float $size, string $font, string $text): float
    {
        $box = imagettfbbox($size, 0, $font, $text);
        return $box[2] - $box[0];
    }

    /** @return array<int,string> */
    private static function wrapText($img, float $size, string $font, string $text, float $maxWidth): array
    {
        $words = preg_split('/\s+/', trim($text)) ?: [];
        $lines = [];
        $current = '';
        foreach ($words as $word) {
            $test = $current === '' ? $word : $current . ' ' . $word;
            if (self::textWidth($img, $size, $font, $test) > $maxWidth && $current !== '') {
                $lines[] = $current;
                $current = $word;
            } else {
                $current = $test;
            }
        }
        if ($current !== '') {
            $lines[] = $current;
        }
        return $lines;
    }
}
