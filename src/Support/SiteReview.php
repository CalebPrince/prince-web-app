<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Shared by ProjectController::reviewBuild() (the one-shot "Review build"
 * button on Projects) and SketchController's review_build chat tool — same
 * fetch-and-prompt logic either way, so there's exactly one place that
 * defines what "reviewing a build" means. Reads a live URL's raw HTML and
 * builds the prompt for a structural/accessibility review; never renders
 * the page (no headless browser on this shared PHP host), so the prompt
 * itself is explicit that colors/spacing/layout are outside what it can see.
 */
class SiteReview
{
    /** @return string|null raw HTML, capped and content-type-checked, or null on any failure */
    public static function fetchHtml(string $url): ?string
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; SketchReviewBot/1.0; +https://princecaleb.dev)',
            // Caps the download for servers that honor Range — the
            // mb_substr below still hard-truncates regardless, since not
            // all servers do.
            CURLOPT_RANGE => '0-500000',
        ]);
        $body = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

        if ($body === false || $status < 200 || $status >= 300) {
            return null;
        }
        if ($contentType !== '' && stripos($contentType, 'html') === false) {
            return null;
        }

        return mb_substr((string) $body, 0, 500000);
    }

    /** Strips script/style bodies (keeps the tags) so token budget goes to structure/copy, not JS/CSS. */
    public static function buildReviewPrompt(string $url, string $html): string
    {
        $stripped = preg_replace('#<script\b[^>]*>.*?</script>#is', '<script></script>', $html);
        $stripped = preg_replace('#<style\b[^>]*>.*?</style>#is', '<style></style>', (string) $stripped);
        $stripped = mb_substr((string) $stripped, 0, 40000);

        return "You are Sketch, a UX/UI reviewer for Prince Caleb (princecaleb.dev). You are given the raw HTML "
            . "of a live page at {$url} — not a screenshot or a rendering. You cannot see colors, spacing, layout, "
            . "or how anything actually looks; never claim otherwise or invent a visual opinion. Review only what "
            . "the markup itself tells you: heading hierarchy (one h1, logical h2/h3 nesting), missing alt text on "
            . "images, presence of a responsive viewport meta tag, semantic landmarks (nav/main/footer/header vs "
            . "generic divs for everything), a page title and meta description, form inputs without associated "
            . "labels, and any broken-looking or placeholder content (lorem ipsum, '#' links, an img with no src). "
            . "Be specific — cite the actual tag or text you're flagging, not generic advice.\n\n"
            . "Return JSON only, no markdown fences: {\"summary\": \"one or two sentences\", \"findings\": "
            . "[{\"category\": \"structure|accessibility|seo|content\", \"severity\": \"low|medium|high\", "
            . "\"note\": \"specific, cites the actual markup\"}]}. If a category has nothing notable, omit it — "
            . "don't pad the list with filler.\n\nHTML:\n{$stripped}";
    }
}
