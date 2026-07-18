<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiAgentEngine;
use App\Support\AiText;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * Dossier: the research analyst on the team. Given a marketing lead, it
 * builds a one-page intelligence brief so an outreach pitch (and Caleb) go
 * in warm instead of cold — sitting one step before Developer's Edge's
 * audit/pitch flow, not replacing it.
 *
 * Three inputs, and the same never-invent-a-fact discipline the rest of
 * Marketing Leads holds itself to:
 *   1. Tech stack — real signals pattern-matched out of the lead's actual
 *      homepage HTML and response headers (WordPress, Shopify, React, GA,
 *      etc.). Every signal carries the concrete evidence it was matched on;
 *      nothing is guessed from the business name or "vibes".
 *   2. Recent news — a real Serper news search on the business name, so a
 *      talking point ("saw you just opened a second location") comes from an
 *      actual search result, never a hallucinated one. AI is deliberately
 *      kept out of this step for the same reason discover() keeps it out of
 *      business search: a model "recalling" news is just making it up.
 *   3. An AI summary that reasons ONLY over (1), (2), and the lead's stored
 *      audit_findings — an outreach angle grounded in the evidence above,
 *      told to invent no pain point the evidence doesn't support.
 *
 * Both external calls degrade gracefully: no Serper key just means no news
 * section, no AI provider just means no summary. The tech-stack read is the
 * always-available core (it only needs the site itself), so research()
 * always produces something usable even with neither key configured. The
 * whole brief is stored on the marketing_leads row (research_findings JSON +
 * researched_at); it never changes the lead's pitch pipeline status.
 */
class DossierController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;

    /**
     * POST /api/v1/admin/marketing-leads/{id}/research — build (or refresh)
     * the research dossier for a single lead. Read-only toward the outside
     * world: it fetches the lead's own site and searches public news, and
     * writes only back onto that lead's row.
     */
    public static function research(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $lead = self::findOrFail($pdo, (int) $params['id']);

        $findings = [
            'tech_stack' => [],
            'tech_note' => null,
            'recent_news' => [],
            'news_note' => null,
            'summary' => null,
            'researched_at' => date('c'),
        ];

        // 1. Tech stack — only when there's a site to read, and only when
        //    it's a safe public host (same SSRF guard the audit uses).
        if (!empty($lead['website_url'])) {
            if (!SharedAgentTools::isSafeUrl($lead['website_url'])) {
                $findings['tech_note'] = 'That URL cannot be fetched (invalid, or resolves to a private/internal address).';
            } else {
                $site = self::fetchSite($lead['website_url']);
                if ($site === null) {
                    $findings['tech_note'] = 'Could not fetch the site to detect its tech stack.';
                } else {
                    $findings['tech_stack'] = self::detectTechStack($site['html'], $site['headers']);
                    if (!$findings['tech_stack']) {
                        $findings['tech_note'] = 'No recognizable platform, framework, or analytics signals found in the page.';
                    }
                }
            }
        } else {
            $findings['tech_note'] = 'No website on file — nothing to fingerprint. Research is based on news and any audit findings.';
        }

        // 2. Recent news — real search results only, skipped quietly if no
        //    provider is configured.
        $serperKey = Settings::get('serper_api_key');
        if (empty($serperKey)) {
            $findings['news_note'] = 'No search provider configured — add a Serper API key in Admin → Settings to pull recent news.';
        } else {
            $news = self::searchNews((string) $serperKey, (string) $lead['business_name']);
            if ($news === null) {
                $findings['news_note'] = 'News search failed — try again in a moment.';
            } elseif (!$news) {
                $findings['news_note'] = 'No recent news found for this business.';
            } else {
                $findings['recent_news'] = $news;
            }
        }

        // 3. AI summary over everything gathered above plus the audit. Best
        //    effort: a missing/failing provider just leaves summary null.
        $auditFindings = !empty($lead['audit_findings'])
            ? (json_decode((string) $lead['audit_findings'], true) ?: null)
            : null;
        if (!empty(Settings::get('gemini_api_key')) || !empty(Settings::get('openrouter_api_key')) || !empty(Settings::get('groq_api_key'))) {
            $findings['summary'] = self::draftSummary(
                (string) $lead['business_name'],
                $lead['website_url'] ?: null,
                $findings['tech_stack'],
                $findings['recent_news'],
                $auditFindings
            );
        }

        $pdo->prepare(
            "UPDATE marketing_leads SET research_findings = ?, researched_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
        )->execute([json_encode($findings), $lead['id']]);

        ActivityLog::log($user, 'researched', 'marketing_lead', (int) $lead['id'], $lead['business_name'] ?: null);

        Response::json(['research' => $findings]);
    }

    /**
     * POST /api/v1/admin/agents/dossier/chat — body: {message, transcript: [{role,text}, ...]}.
     * A live, free-form conversation with Caleb himself (admin session), the
     * same shape as the other agents' surfaces in the Talk to Agents console.
     * Not the research() pipeline — no lead row, no stored brief — just
     * Dossier talking through what to look for on a prospect, how to read a
     * tech-stack signal, or an outreach angle. Stateless: the transcript
     * lives in the browser and is replayed each turn, mirroring
     * BeaconController::chat().
     */
    public static function chat(): void
    {
        AuthMiddleware::requireAuth();

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim((string) ($data['message'] ?? ''));
        $transcript = is_array($data['transcript'] ?? null) ? $data['transcript'] : [];

        if ($message === '' || mb_strlen($message) > self::MAX_MESSAGE_LENGTH) {
            Response::error('A message under ' . self::MAX_MESSAGE_LENGTH . ' characters is required.', 422);
        }
        if (count($transcript) > self::MAX_CHAT_TRANSCRIPT_TURNS) {
            $transcript = array_slice($transcript, -self::MAX_CHAT_TRANSCRIPT_TURNS);
        }
        $transcript[] = ['role' => 'user', 'text' => $message];

        $pdo = Database::get();
        $result = AiAgentEngine::run(
            self::buildChatSystemPrompt(),
            [
                SharedAgentTools::siteInfoToolDeclaration(),
                SharedAgentTools::searchContentToolDeclaration(),
            ],
            fn(string $name, array $args) => match ($name) {
                'get_site_info' => SharedAgentTools::getSiteInfo(),
                'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
                default => ['error' => 'Unknown tool.'],
            },
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        Response::json(['reply' => SharedAgentTools::stripMarkdown($result['reply'])]);
    }

    /**
     * Talking directly with Caleb (verified by his admin session), not the
     * automated research() pipeline — same split BeaconController draws
     * between its chat and draft prompts: keep the persona and the real
     * grounding tools, drop any rigid task/output contract.
     */
    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('dossier_assistant_name') ?: 'Dossier';
        $genderLine = self::genderLine((string) Settings::get('dossier_voice_gender'));

        return "You are {$name}, the research analyst on Prince Caleb's AI team — Caleb is a highly skilled "
            . "solo Web Designer and Mobile App Developer who runs the portfolio site princecaleb.dev.{$genderLine}\n\n"
            . "Your day job is recon on prospective clients before Caleb reaches out: given a marketing lead you "
            . "fingerprint the tech stack from their real site (WordPress, Shopify, React, analytics, hosting — "
            . "always from actual evidence in the page, never a guess), pull real recent news about the business, "
            . "and turn that plus any site audit into a short, honest outreach angle. Your ironclad rule is to "
            . "never invent a fact: if the evidence is thin you say so plainly rather than padding it.\n\n"
            . "Right now you're talking directly with Caleb in the admin console — a live working conversation, "
            . "not the automated pipeline. Help him think through what's worth researching on a specific "
            . "prospect, how to read a signal you'd surface, or how to frame a first message around real "
            . "findings. You have get_site_info (Caleb's real bio, services, and tech stack) and search_content "
            . "(his real past projects/blog posts) — use them to ground yourself in real facts instead of "
            . "guessing. Speak naturally and conversationally; never output JSON unless he explicitly asks for "
            . "it. Keep the tone knowledgeable, direct, and a little dry — an analyst briefing a colleague, "
            . "never salesy or corporate.";
    }

    /** No TTS surface writes to a client here — this only lightly flavors the prompt's internal framing (mirrors BeaconController::genderLine). */
    private static function genderLine(string $gender): string
    {
        if ($gender === 'male') {
            return ' Internally you may think of yourself as he/him.';
        }
        if ($gender === 'female') {
            return ' Internally you may think of yourself as she/her.';
        }
        return '';
    }

    // ---- internals ----------------------------------------------------------

    private static function findOrFail(\PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM marketing_leads WHERE id = ?');
        $stmt->execute([$id]);
        $lead = $stmt->fetch();
        if (!$lead) {
            Response::error('Lead not found.', 404);
        }
        return $lead;
    }

    /**
     * Fetches the homepage and returns its HTML plus the raw response
     * headers (lower-cased keys) for fingerprinting. Returns null on any
     * hard fetch failure — unlike the audit, an unreachable site isn't a
     * "finding" here, it just means there's no stack to read, so the caller
     * reports that plainly rather than dressing it up.
     *
     * @return array{html:string,headers:array<string,string>}|null
     */
    private static function fetchSite(string $url): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HEADER => true,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; PrinceCalebDossier/1.0; +https://princecaleb.dev)',
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        if ($response === false || $status === 0) {
            return null;
        }

        $rawHeaders = substr((string) $response, 0, $headerSize);
        $html = substr((string) $response, $headerSize);

        $headers = [];
        foreach (preg_split('/\r?\n/', $rawHeaders) ?: [] as $line) {
            if (str_contains($line, ':')) {
                [$name, $value] = explode(':', $line, 2);
                // Last write wins across redirects — the final hop's headers
                // are the ones that describe what actually served the page.
                $headers[strtolower(trim($name))] = trim($value);
            }
        }

        return ['html' => $html, 'headers' => $headers];
    }

    /**
     * Pattern-matches known platform/framework/analytics fingerprints out of
     * real page HTML and response headers. Each hit records the concrete
     * evidence it matched on, so the result is defensible ("we saw X"), never
     * a guess. A signal is reported at most once even if several of its
     * needles match.
     *
     * @param array<string,string> $headers Lower-cased response header map.
     * @return array<int,array{signal:string,category:string,evidence:string}>
     */
    private static function detectTechStack(string $html, array $headers): array
    {
        // needle => [signal, category, human evidence phrase]. Needles are
        // matched case-insensitively against the raw HTML.
        $htmlSignatures = [
            'wp-content'            => ['WordPress', 'CMS', 'wp-content asset paths in the page'],
            'wp-includes'          => ['WordPress', 'CMS', 'wp-includes asset paths in the page'],
            'cdn.shopify.com'      => ['Shopify', 'E-commerce', 'Shopify CDN assets'],
            'shopify.theme'        => ['Shopify', 'E-commerce', 'a Shopify theme object'],
            'static.wixstatic.com' => ['Wix', 'Website builder', 'Wix static assets'],
            'squarespace.com'      => ['Squarespace', 'Website builder', 'Squarespace assets'],
            'static1.squarespace'  => ['Squarespace', 'Website builder', 'Squarespace assets'],
            'data-wf-page'         => ['Webflow', 'Website builder', 'a Webflow page attribute'],
            '.webflow.io'          => ['Webflow', 'Website builder', 'a Webflow domain reference'],
            'cdn.weebly.com'       => ['Weebly', 'Website builder', 'Weebly CDN assets'],
            'drupal.settings'      => ['Drupal', 'CMS', 'Drupal settings script'],
            '/sites/default/files' => ['Drupal', 'CMS', 'Drupal file paths'],
            '/media/jui/'          => ['Joomla', 'CMS', 'Joomla media paths'],
            '__next_data__'        => ['Next.js', 'Framework', 'a Next.js data payload'],
            '/_next/static'        => ['Next.js', 'Framework', 'Next.js static assets'],
            'data-reactroot'       => ['React', 'Framework', 'a React root attribute'],
            'ng-version'           => ['Angular', 'Framework', 'an Angular version attribute'],
            'data-v-app'           => ['Vue.js', 'Framework', 'a Vue app mount point'],
            'jquery'               => ['jQuery', 'Library', 'a jQuery script reference'],
            'bootstrap'            => ['Bootstrap', 'Library', 'Bootstrap CSS/JS references'],
            'googletagmanager.com' => ['Google Tag Manager', 'Analytics', 'a Google Tag Manager container'],
            'google-analytics.com' => ['Google Analytics', 'Analytics', 'a Google Analytics tag'],
            'gtag('                => ['Google Analytics', 'Analytics', 'a gtag() analytics call'],
            'connect.facebook.net' => ['Meta Pixel', 'Analytics', 'a Meta/Facebook Pixel script'],
            'hotjar'               => ['Hotjar', 'Analytics', 'a Hotjar tracking script'],
            'hubspot'              => ['HubSpot', 'Marketing', 'a HubSpot script'],
            'mailchimp'            => ['Mailchimp', 'Marketing', 'a Mailchimp embed'],
            'elementor'            => ['Elementor', 'CMS', 'the Elementor page builder (WordPress)'],
            'wix.com'              => ['Wix', 'Website builder', 'a Wix reference'],
        ];

        // Meta generator is the most authoritative CMS signal when present,
        // so pull it out explicitly rather than relying on asset-path guesses.
        $found = [];
        $addSignal = static function (string $signal, string $category, string $evidence) use (&$found): void {
            if (!isset($found[$signal])) {
                $found[$signal] = ['signal' => $signal, 'category' => $category, 'evidence' => $evidence];
            }
        };

        if (preg_match('/<meta[^>]+name=["\']generator["\'][^>]+content=["\']([^"\']+)["\']/i', $html, $m)) {
            $addSignal('Generator: ' . trim($m[1]), 'CMS', 'the page\'s own <meta generator> tag');
        }

        $haystack = strtolower($html);
        foreach ($htmlSignatures as $needle => [$signal, $category, $evidence]) {
            if (str_contains($haystack, $needle)) {
                $addSignal($signal, $category, $evidence);
            }
        }

        // Response headers give away hosting/server tech the HTML doesn't.
        if (!empty($headers['x-powered-by'])) {
            $addSignal($headers['x-powered-by'], 'Server', 'the X-Powered-By response header');
        }
        if (!empty($headers['server'])) {
            $server = $headers['server'];
            if (stripos($server, 'cloudflare') !== false) {
                $addSignal('Cloudflare', 'Hosting/CDN', 'the Server response header');
            } elseif (preg_match('/^(nginx|apache|microsoft-iis|litespeed)/i', $server, $sm)) {
                $addSignal(ucfirst(strtolower($sm[1] === 'microsoft-iis' ? 'Microsoft IIS' : $sm[1])), 'Server', 'the Server response header');
            }
        }
        if (!empty($headers['x-generator'])) {
            $addSignal($headers['x-generator'], 'CMS', 'the X-Generator response header');
        }
        if (!empty($headers['x-shopify-stage']) || !empty($headers['x-shopid'])) {
            $addSignal('Shopify', 'E-commerce', 'a Shopify response header');
        }

        return array_values($found);
    }

    /**
     * Real news search via Serper's news endpoint — modeled on
     * MarketingLeadController::searchBusinesses(), same "real results only,
     * never AI" rule. Returns up to 5 recent items. null only on a hard
     * failure (so the caller can distinguish "search broke" from "nothing
     * recent"); an empty array means the search ran but found nothing.
     *
     * @return array<int,array{title:string,link:?string,source:?string,date:?string,snippet:?string}>|null
     */
    private static function searchNews(string $apiKey, string $businessName): ?array
    {
        if (!function_exists('curl_init') || trim($businessName) === '') {
            return null;
        }

        $ch = curl_init('https://google.serper.dev/news');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-API-KEY: ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode(['q' => $businessName]),
            CURLOPT_TIMEOUT => 15,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'Dossier: Serper news search failed: status=%s curl_error=%s body=%s',
                $status,
                $curlError !== '' ? $curlError : 'none',
                is_string($response) ? substr($response, 0, 500) : 'n/a'
            ));
            return null;
        }

        $decoded = json_decode((string) $response, true);
        $items = $decoded['news'] ?? [];
        if (!is_array($items)) {
            return [];
        }

        $out = [];
        foreach (array_slice($items, 0, 5) as $item) {
            $title = trim((string) ($item['title'] ?? ''));
            if ($title === '') {
                continue;
            }
            $out[] = [
                'title' => $title,
                'link' => !empty($item['link']) ? (string) $item['link'] : null,
                'source' => !empty($item['source']) ? (string) $item['source'] : null,
                'date' => !empty($item['date']) ? (string) $item['date'] : null,
                'snippet' => !empty($item['snippet']) ? (string) $item['snippet'] : null,
            ];
        }

        return $out;
    }

    /**
     * The one AI step — a short outreach briefing that reasons only over the
     * evidence gathered above. Best effort: returns null (no summary section)
     * rather than failing the whole research if every provider is down, so
     * the tech/news the request already collected still gets saved.
     *
     * @param array<int,array{signal:string,category:string,evidence:string}> $techStack
     * @param array<int,array<string,mixed>> $news
     * @param array<string,mixed>|null $audit
     */
    private static function draftSummary(string $businessName, ?string $websiteUrl, array $techStack, array $news, ?array $audit): ?string
    {
        $techLines = $techStack
            ? implode("\n", array_map(fn($t) => "- {$t['signal']} ({$t['category']})", $techStack))
            : '(no tech-stack signals detected)';

        $newsLines = $news
            ? implode("\n", array_map(
                fn($n) => '- ' . $n['title'] . (!empty($n['date']) ? " ({$n['date']})" : '') . (!empty($n['snippet']) ? ': ' . $n['snippet'] : ''),
                $news
            ))
            : '(no recent news found)';

        $auditLines = '(no site audit on file)';
        if ($audit !== null) {
            if (!empty($audit['reachable']) && $audit['reachable'] === false) {
                $auditLines = 'The audit found the site unreachable.';
            } else {
                $issues = $audit['issues'] ?? [];
                $auditLines = $issues
                    ? implode("\n", array_map(fn($i) => '- ' . ($i['detail'] ?? ''), $issues))
                    : 'The audit found no specific technical issues.';
            }
        }

        $siteLine = $websiteUrl ? "Website: {$websiteUrl}" : 'This business has no website on file.';

        $prompt = "You are a research analyst preparing a short internal briefing for Prince Caleb, a web & "
            . "mobile developer, before he reaches out to a prospective client. This briefing is for HIS eyes "
            . "only — it is never sent to the business.\n\n"
            . "BUSINESS: {$businessName}\n{$siteLine}\n\n"
            . "DETECTED TECH STACK (real signals fingerprinted from their site):\n{$techLines}\n\n"
            . "RECENT NEWS (real search results):\n{$newsLines}\n\n"
            . "SITE AUDIT FINDINGS:\n{$auditLines}\n\n"
            . "Write a concise briefing (3-5 short sentences, or a few short lines) covering: what the evidence "
            . "above suggests about this business and how their site is built, one or two plausible pain points "
            . "or opportunities that are ACTUALLY SUPPORTED by the evidence, and a suggested angle for a first "
            . "outreach message.\n\n"
            . "STRICT RULES: Reason ONLY from the evidence above. Do NOT invent facts, statistics, problems, or "
            . "news that isn't listed. If the evidence is thin, say so plainly rather than padding it. If no tech "
            . "was detected, do not speculate about what they might be using. Plain text only — no markdown, no "
            . "headings, no bullet characters.";

        $text = AiText::generate($prompt, null, 25);
        if ($text === null) {
            error_log('Dossier summary: all configured AI providers (Gemini/OpenRouter/Groq) failed.');
            return null;
        }

        return SharedAgentTools::stripMarkdown($text);
    }
}
