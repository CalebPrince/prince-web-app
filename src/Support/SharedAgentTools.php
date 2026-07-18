<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Tool implementations and declarations shared by more than one AI agent.
 * Originally lived only inside LiveChatController (Lisa); extracted once
 * Beacon and Nurturer needed the same "ground replies in real facts" and
 * "check real availability" capabilities, so there's one source of truth
 * for each tool's behavior and wording instead of three copies drifting
 * apart. Agent-specific tools (Lisa's log_inquiry/book_appointment/
 * audit_website/signal_handoff, Beacon's log_qualified_lead) stay in their
 * own controllers — only genuinely cross-agent tools live here.
 */
class SharedAgentTools
{
    /**
     * Strip common Markdown formatting *markers* an agent sometimes reaches
     * for (bold/italic asterisks, bullet dashes, "1." list numbering,
     * headings) from a reply, email, or draft field — never the words
     * themselves. Every place this runs (chat bubbles, drafted emails,
     * proposal text, blog/social drafts) displays plain text, not rendered
     * Markdown, so a literal "**" or a "- " at a line start would otherwise
     * show up exactly as typed instead of doing anything. Also normalizes
     * away the em/en dash, a distinctly "AI-written" tic in plain prose.
     */
    public static function stripMarkdown(string $text): string
    {
        return trim(self::stripMarkdownMarkers($text));
    }

    /**
     * Same transformations as stripMarkdown() but without trimming leading/
     * trailing whitespace. Used when a caller reassembles text from several
     * segments (e.g. ContentAgentController's fence-aware blog-body variant,
     * which runs this on the prose around ```code``` blocks and leaves the
     * fences untouched) — trimming each segment individually would eat the
     * blank line/newline that separated it from its neighbor, running prose
     * straight into the next segment with no line break.
     */
    public static function stripMarkdownMarkers(string $text): string
    {
        // Horizontal rules on their own line: ---, ***, ___.
        $text = preg_replace('/^[ \t]*([-*_])\1{2,}[ \t]*$/m', '', $text);
        // Headings: "## Title" -> "Title".
        $text = preg_replace('/^[ \t]*#{1,6}[ \t]+/m', '', $text);
        // Bullet list markers: "- item" / "* item" / "+ item" -> "item".
        $text = preg_replace('/^[ \t]*[-*+][ \t]+/m', '', $text);
        // Numbered list markers: "1. item" / "2) item" -> "item".
        $text = preg_replace('/^[ \t]*\d+[.)][ \t]+/m', '', $text);
        // Bold/italic emphasis: **text**, __text__, *text*, _text_ -> text.
        $text = preg_replace('/\*\*(.+?)\*\*/s', '$1', $text);
        $text = preg_replace('/__(.+?)__/s', '$1', $text);
        $text = preg_replace('/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/s', '$1', $text);
        $text = preg_replace('/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/s', '$1', $text);
        // Any leftover stray markers the pairs above didn't catch.
        $text = str_replace(['**', '__'], '', $text);
        // Em dash / en dash used as a clause separator -> comma (with normal
        // spacing), so the sentence still reads naturally instead of running
        // two words together or leaving a bare "-" mid-sentence. The /u
        // modifier is required here — without it PCRE treats the multi-byte
        // UTF-8 dash as separate bytes and can match (and replace) it more
        // than once.
        $text = preg_replace('/[ \t]*[—–][ \t]*/u', ', ', $text);
        // A comma the dash-replacement just introduced right before other
        // punctuation (e.g. "word, ." or "word, ,") reads as a typo.
        $text = preg_replace('/,\s*([.,!?;:])/', '$1', $text);
        // Same, for a dash that landed at the very end of the text with
        // nothing after it to justify a trailing comma.
        $text = preg_replace('/,[ \t]*$/', '', $text);
        // List-marker stripping can leave doubled-up blank lines behind.
        return preg_replace('/\n{3,}/', "\n\n", (string) $text);
    }

    /** @return array<string,mixed> Background facts about Prince, sourced from Settings — never guessed. */
    public static function getSiteInfo(): array
    {
        $fields = [
            'about_bio' => 'bio',
            'about_intro' => 'intro',
            'availability_badge' => 'current_availability',
            'tech_badges' => 'tech_stack',
            'contact_location' => 'location',
            'social_email' => 'email',
            'social_github' => 'github',
            'social_linkedin' => 'linkedin',
            'social_whatsapp' => 'whatsapp',
        ];
        $info = [];
        foreach ($fields as $settingKey => $outKey) {
            $value = Settings::get($settingKey);
            if (!empty($value)) {
                $info[$outKey] = $value;
            }
        }

        $services = [];
        for ($i = 1; $i <= 3; $i++) {
            $title = Settings::get("service_{$i}_title");
            if (empty($title)) {
                continue;
            }
            $services[] = [
                'title' => $title,
                'summary' => Settings::get("service_{$i}_summary"),
                'description' => Settings::get("service_{$i}_desc"),
            ];
        }
        if ($services) {
            $info['services'] = $services;
        }

        $highlights = [];
        for ($i = 1; $i <= 4; $i++) {
            $label = Settings::get("stat_{$i}_label");
            $value = Settings::get("stat_{$i}_value");
            if (empty($label) || empty($value)) {
                continue;
            }
            $highlights[] = trim(
                (Settings::get("stat_{$i}_prefix") ?? '') . $value . (Settings::get("stat_{$i}_suffix") ?? '')
                . ' ' . $label
            );
        }
        if ($highlights) {
            $info['highlights'] = $highlights;
        }

        // Public engineering tiers, so estimation conversations anchor to the
        // real published starting prices instead of the model guessing.
        $tiers = [];
        for ($i = 1; $i <= 3; $i++) {
            $name = Settings::get("pricing_tier_{$i}_name");
            $price = Settings::get("pricing_tier_{$i}_price");
            if (empty($name) || empty($price)) {
                continue;
            }
            $tiers[] = [
                'tier' => $name,
                'starting_price' => $price,
                'covers' => Settings::get("pricing_tier_{$i}_tagline"),
            ];
        }
        if ($tiers) {
            $info['engineering_tiers'] = $tiers;
        }

        return $info;
    }

    /**
     * @return array<string,string> Visual brand facts for Canvas's flyer/graphic
     * generation — colors, font, a style note, and the two real logo files
     * (named for the mark's own color, not the background it goes on).
     * Defaults match the site's actual monochrome editorial design system
     * (public/css/app.css) and the two logo files committed under
     * public/uploads/brand/, so this works even before an admin ever opens
     * Settings to override anything.
     */
    public static function getBrandInfo(): array
    {
        return [
            'primary_color' => Settings::get('brand_primary_color') ?: '#17181c',
            'accent_color' => Settings::get('brand_accent_color') ?: '#e8eaed',
            'font' => Settings::get('brand_font') ?: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif (clean geometric sans, no serif/script)',
            'style_note' => Settings::get('brand_style_note')
                ?: 'Monochrome, dark editorial style — near-black or near-white surfaces only, no bright or '
                    . 'saturated colors, generous whitespace, restrained typography.',
            // The dark-colored mark reads on white/light backgrounds; the
            // white-colored mark reads on black/dark backgrounds.
            'logo_dark' => Settings::get('brand_logo_dark_url') ?: '/uploads/brand/logo-dark.png',
            'logo_white' => Settings::get('brand_logo_white_url') ?: '/uploads/brand/logo-white.png',
        ];
    }

    /** @return array{results: array<int,array<string,mixed>>} Top 3 published projects/blog posts matching $query. */
    public static function searchContent(\PDO $pdo, string $query): array
    {
        $words = array_filter(
            preg_split('/\W+/', strtolower(trim($query))) ?: [],
            fn($w) => strlen($w) > 2
        );
        if (!$words) {
            return ['results' => []];
        }

        $score = function (string $haystack) use ($words): int {
            $haystack = strtolower($haystack);
            $n = 0;
            foreach ($words as $w) {
                if (str_contains($haystack, $w)) {
                    $n++;
                }
            }
            return $n;
        };

        $results = [];
        foreach ($pdo->query('SELECT title, slug, summary, case_study_body FROM projects WHERE is_published = 1') as $p) {
            $s = $score($p['title'] . ' ' . $p['summary'] . ' ' . ($p['case_study_body'] ?? ''));
            if ($s > 0) {
                $results[] = [
                    'score' => $s,
                    'type' => 'project',
                    'title' => $p['title'],
                    'url' => '/project.html?slug=' . urlencode($p['slug']),
                    'snippet' => $p['summary'],
                ];
            }
        }
        foreach ($pdo->query('SELECT title, slug, excerpt FROM blog_posts WHERE is_published = 1') as $b) {
            $s = $score($b['title'] . ' ' . $b['excerpt']);
            if ($s > 0) {
                $results[] = [
                    'score' => $s,
                    'type' => 'blog_post',
                    'title' => $b['title'],
                    'url' => '/archive-post.html?slug=' . urlencode($b['slug']),
                    'snippet' => $b['excerpt'],
                ];
            }
        }

        usort($results, fn($a, $b) => $b['score'] <=> $a['score']);
        $top = array_slice($results, 0, 3);
        foreach ($top as &$t) {
            unset($t['score']);
        }
        return ['results' => $top];
    }

    public static function siteInfoToolDeclaration(): array
    {
        return [
            'name' => 'get_site_info',
            'description' => 'Get background info about Prince — bio, services offered, tech stack, '
                . 'experience highlights, location, and contact/social links. Use this for general '
                . 'questions that are not about scoping a specific project, e.g. "what do you build", '
                . '"where are you based", "do you work with WordPress", "how experienced are you".',
            'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
        ];
    }

    public static function searchContentToolDeclaration(): array
    {
        return [
            'name' => 'search_content',
            'description' => 'Search past projects and blog posts for something relevant to what was '
                . 'described, so you can reference real, specific work instead of speaking in generalities.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'query' => [
                        'type' => 'STRING',
                        'description' => 'A few keywords, e.g. "restaurant ordering app" or "SEO blog".',
                    ],
                ],
                'required' => ['query'],
            ],
        ];
    }

    public static function brandInfoToolDeclaration(): array
    {
        return [
            'name' => 'get_brand_info',
            'description' => 'Get Prince Caleb\'s real visual brand facts — primary/accent colors, font style, '
                . 'a style note, and the two real logo files (a dark-colored mark for white/light backgrounds, '
                . 'a white-colored mark for black/dark backgrounds). Call this before generating any flyer or '
                . 'graphic so the result matches the actual brand instead of guessing at colors or inventing a logo.',
            'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
        ];
    }

    public static function checkAvailabilityToolDeclaration(): array
    {
        return [
            'name' => 'check_availability',
            'description' => 'Check real bookable call slots for a given date, so you can offer an '
                . 'actual time instead of guessing.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'date' => ['type' => 'STRING', 'description' => 'Date in YYYY-MM-DD format.'],
                ],
                'required' => ['date'],
            ],
        ];
    }

    /**
     * Blocks anything that isn't a plain public http(s) host — no
     * loopback/private/reserved targets (SSRF protection). A domain that
     * fails to resolve at all is NOT blocked here: there is nothing to
     * attack via SSRF if nothing resolves, and a non-existent/unregistered
     * domain is itself a legitimate finding for whichever caller asked —
     * see MarketingLeadController::performAudit() and
     * DossierController::fetchSite(), which let the real curl attempt fail
     * naturally and report why, rather than swallowing it here.
     *
     * Originally lived only in MarketingLeadController; moved here once
     * Dossier needed the exact same guard for the same reason — one source
     * of truth for what counts as safe to fetch, not two copies that could
     * quietly drift apart on a security-relevant check.
     */
    public static function isSafeUrl(string $url): bool
    {
        $parts = parse_url($url);
        if (!$parts || !in_array($parts['scheme'] ?? '', ['http', 'https'], true) || empty($parts['host'])) {
            return false;
        }
        $host = $parts['host'];
        if (strtolower($host) === 'localhost') {
            return false;
        }
        $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : gethostbyname($host);
        if ($ip === $host && !filter_var($host, FILTER_VALIDATE_IP)) {
            return true; // DNS resolution failed — nothing reachable, so nothing unsafe to reach
        }
        return (bool) filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
    }
}
