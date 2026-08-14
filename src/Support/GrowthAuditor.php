<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Runs the same audit the "Free Growth Roadmap" ad landing page promises —
 * for real, against any public URL. Two parts, same as the public mockup:
 *
 *   1. Real technical signals — fetched and checked directly, never guessed
 *      (HTTPS, response time, page size, title/meta description, mobile
 *      viewport tag, sitemap/robots presence, and analytics/tracking tags
 *      actually present via SiteInspector's fingerprint table).
 *   2. One AI narrative call that turns those real signals into the same
 *      shape the mockup shows (score, traffic/conversion/tracking findings,
 *      recommendations) — explicitly told to reason only from the signals
 *      given, never to invent a traffic/visitor number that wasn't measured.
 *
 * No real analytics/traffic data source is wired up yet (that would mean a
 * DataForSEO or Google Analytics integration — a separate, non-trivial
 * piece of work with real API cost), so the "traffic" pillar is limited to
 * readiness signals rather than actual visitor numbers. This is a known,
 * documented V1 limitation, not something silently faked by the AI step.
 */
class GrowthAuditor
{
    /**
     * @return array{reachable:bool,url:string,final_url:?string,signals:array,findings:?array,error:?string}
     */
    public static function run(string $url): array
    {
        if (!SharedAgentTools::isSafeUrl($url)) {
            return [
                'reachable' => false,
                'url' => $url,
                'final_url' => null,
                'signals' => [],
                'findings' => null,
                'error' => 'That URL cannot be fetched (invalid, or resolves to a private/internal address).',
            ];
        }

        $site = SiteInspector::fetch($url);
        if ($site === null) {
            return [
                'reachable' => false,
                'url' => $url,
                'final_url' => null,
                'signals' => [],
                'findings' => null,
                'error' => 'Could not fetch that site — it may be down, blocking automated requests, or the URL is wrong.',
            ];
        }

        $signals = self::gatherSignals($site);

        $findings = null;
        $text = AiText::generate(self::buildPrompt($url, $signals), self::systemInstruction(), 25);
        if ($text !== null) {
            $findings = self::parseFindings($text);
        }

        return [
            'reachable' => true,
            'url' => $url,
            'final_url' => $site['final_url'],
            'signals' => $signals,
            'findings' => $findings,
            'error' => $findings === null ? 'The technical signals were gathered, but the AI narrative could not be generated or parsed.' : null,
        ];
    }

    /**
     * @param array{html:string,headers:array<string,string>,status:int,final_url:string,response_time_ms:int} $site
     */
    private static function gatherSignals(array $site): array
    {
        $html = $site['html'];
        $finalUrl = $site['final_url'];
        $parts = parse_url($finalUrl);
        $usesHttps = ($parts['scheme'] ?? '') === 'https';
        $origin = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? '');

        $title = null;
        if (preg_match('/<title[^>]*>(.*?)<\/title>/is', $html, $m)) {
            $title = trim(SharedAgentTools::stripMarkdown(html_entity_decode(strip_tags($m[1]))));
        }

        $techStack = SiteInspector::detectTechStack($html, $site['headers']);
        $trackingSignals = array_values(array_filter(
            $techStack,
            static fn(array $s): bool => in_array($s['category'], ['Analytics', 'Marketing'], true)
        ));
        $platformSignals = array_values(array_filter(
            $techStack,
            static fn(array $s): bool => !in_array($s['category'], ['Analytics', 'Marketing'], true)
        ));

        return [
            'http_status' => $site['status'],
            'final_url' => $finalUrl,
            'uses_https' => $usesHttps,
            'response_time_ms' => $site['response_time_ms'],
            'page_size_kb' => round(mb_strlen($html) / 1024, 1),
            'title' => $title !== '' ? $title : null,
            'has_meta_description' => (bool) preg_match('/<meta[^>]+name=["\']description["\'][^>]+content=["\'][^"\']+["\']/i', $html),
            'has_viewport_meta' => (bool) preg_match('/<meta[^>]+name=["\']viewport["\']/i', $html),
            'h1_count' => preg_match_all('/<h1\b/i', $html),
            'has_sitemap' => self::urlReachable($origin . '/sitemap.xml'),
            'has_robots_txt' => self::urlReachable($origin . '/robots.txt'),
            'tracking_tags' => array_map(static fn(array $s) => $s['signal'], $trackingSignals),
            'platform_signals' => array_map(static fn(array $s) => $s['signal'], $platformSignals),
        ];
    }

    private static function urlReachable(string $url): bool
    {
        if (!function_exists('curl_init')) {
            return false;
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_NOBODY => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 2,
            CURLOPT_TIMEOUT => 6,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        return $status >= 200 && $status < 400;
    }

    private static function systemInstruction(): string
    {
        return "You are the analyst behind Prince Caleb's \"Free Growth Roadmap\" — a short audit of a business's "
            . "website covering traffic, conversion, and tracking gaps. You are given a fixed list of REAL technical "
            . "signals measured directly from the page; you must reason only from those signals and never invent a "
            . "fact not supported by them. Critically: no real traffic/visitor/analytics numbers were measured, so "
            . "never state or imply a specific visitor count, traffic volume, or percentage change — instead, reason "
            . "about traffic READINESS (e.g. missing sitemap, slow load time hurting SEO, no meta description hurting "
            . "click-through) rather than fabricated traffic figures. Output ONLY a single JSON object, no markdown "
            . "fences, no commentary, matching exactly this shape: "
            . '{"score": <integer 0-100>, "summary": "<one sentence>", '
            . '"traffic": [{"finding": "<short>", "detail": "<one sentence, grounded in a specific signal>"}], '
            . '"conversion": [{"finding": "<short>", "detail": "<one sentence>"}], '
            . '"tracking": [{"finding": "<short>", "detail": "<one sentence>"}], '
            . '"recommendations": [{"title": "<short action>", "detail": "<one sentence>"}]}. '
            . 'Provide 2-3 items per category and 3-4 recommendations, ordered by impact, most important first. '
            . 'The score reflects overall site health across the three pillars given the signals provided.';
    }

    private static function buildPrompt(string $url, array $signals): string
    {
        return "Audit this site: {$url}\n\nReal measured signals (JSON):\n" . json_encode($signals, JSON_PRETTY_PRINT);
    }

    /** @return array{score:int,summary:string,traffic:array,conversion:array,tracking:array,recommendations:array}|null */
    private static function parseFindings(string $reply): ?array
    {
        $stripped = trim((string) preg_replace('/^```(?:json)?\s*|\s*```$/m', '', $reply));
        if (!preg_match('/\{.*\}/s', $stripped, $match)) {
            error_log('GrowthAuditor: no JSON object found in model output: ' . substr($stripped, 0, 500));
            return null;
        }
        $parsed = json_decode($match[0], true);
        if (!is_array($parsed)) {
            error_log('GrowthAuditor: could not decode JSON from model output: ' . substr($match[0], 0, 500));
            return null;
        }

        $score = (int) ($parsed['score'] ?? -1);
        if ($score < 0 || $score > 100) {
            error_log('GrowthAuditor: rejected malformed score: ' . json_encode($parsed['score'] ?? null));
            return null;
        }

        $category = static function ($items): array {
            if (!is_array($items)) {
                return [];
            }
            $out = [];
            foreach ($items as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $finding = trim((string) ($item['finding'] ?? $item['title'] ?? ''));
                $detail = trim((string) ($item['detail'] ?? ''));
                if ($finding === '' || $detail === '') {
                    continue;
                }
                $out[] = ['finding' => mb_substr($finding, 0, 200), 'detail' => mb_substr($detail, 0, 500)];
            }
            return $out;
        };

        $recommendations = [];
        foreach ((is_array($parsed['recommendations'] ?? null) ? $parsed['recommendations'] : []) as $item) {
            if (!is_array($item)) {
                continue;
            }
            $title = trim((string) ($item['title'] ?? ''));
            $detail = trim((string) ($item['detail'] ?? ''));
            if ($title === '' || $detail === '') {
                continue;
            }
            $recommendations[] = ['title' => mb_substr($title, 0, 200), 'detail' => mb_substr($detail, 0, 500)];
        }

        return [
            'score' => $score,
            'summary' => mb_substr(trim((string) ($parsed['summary'] ?? '')), 0, 500),
            'traffic' => $category($parsed['traffic'] ?? []),
            'conversion' => $category($parsed['conversion'] ?? []),
            'tracking' => $category($parsed['tracking'] ?? []),
            'recommendations' => $recommendations,
        ];
    }
}
