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
}
