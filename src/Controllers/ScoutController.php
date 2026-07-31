<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiAgentEngine;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * Scout: the tech & ideation specialist on the team. Keeps an eye on
 * emerging web, mobile, and AI tools/frameworks and brainstorms with Caleb
 * about cutting-edge project ideas built on them — a sparring partner for
 * "what could we build with X", not a lead-gen or client-facing agent.
 *
 * No cron/discovery pipeline behind this one: every "what's new" answer is
 * grounded live, in the moment it's asked, via a real Serper web search
 * (search_web) rather than invented or recalled from training data as fact.
 * get_site_info/search_content ground ideas in Caleb's actual stack and past
 * work, same as Dossier, so suggestions stay buildable rather than generic.
 */
class ScoutController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;

    /**
     * POST /api/v1/admin/agents/scout/chat — body: {message, transcript: [{role,text}, ...]}.
     * Stateless: the transcript lives in the browser and is replayed each
     * turn, mirroring DossierController::chat() / BeaconController::chat().
     */
    public static function chat(): void
    {
        $user = AuthMiddleware::requireAuth();

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
                self::searchWebToolDeclaration(),
            ],
            fn(string $name, array $args) => match ($name) {
                'get_site_info' => SharedAgentTools::getSiteInfo(),
                'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
                'search_web' => self::searchWeb((string) ($args['query'] ?? '')),
                default => ['error' => 'Unknown tool.'],
            },
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        // Real log of an actual exchange, not an invented counter — this is
        // what TeamController's "ideas discussed" stat for Scout counts.
        ActivityLog::log($user, 'brainstormed', 'scout_chat', null, mb_substr($message, 0, 120));

        Response::json(['reply' => SharedAgentTools::stripMarkdown($result['reply'])]);
    }

    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('scout_assistant_name') ?: 'Scout';
        $genderLine = self::genderLine((string) Settings::get('scout_voice_gender'));

        return "You are {$name}, the tech & ideation specialist on Prince Caleb's AI team — Caleb is a solo developer "
            . "who builds AI voice agents, chatbots, and business automations on 12+ years of custom web & mobile "
            . "engineering, and runs princecaleb.dev.{$genderLine}\n\n"
            . "Your job is to keep watch on emerging web, mobile, and AI tools, frameworks, and platforms, and "
            . "brainstorm cutting-edge project ideas with Caleb built on them — a sparring partner for \"what could "
            . "we build with this\", not a lead-gen or client-facing agent. You have search_web (a real, live web "
            . "search) — use it whenever a question depends on something recent or you're not confident your own "
            . "knowledge is current, so a claim about \"the latest X\" comes from an actual search result, never a "
            . "guess or something recalled from training. You also have get_site_info (Caleb's real bio, services, "
            . "and tech stack) and search_content (his real past projects/blog posts) — use them to ground ideas in "
            . "what he actually builds and has already shipped, rather than pitching something generic or off-stack.\n\n"
            . "When brainstorming, be concrete: name the actual tool/framework/model, explain in a sentence or two "
            . "why it's relevant right now, and sketch what a small buildable project or client pitch with it could "
            . "look like. Prefer a short list of sharp, specific ideas over a long vague one. If you're unsure "
            . "whether something is still current, say so plainly rather than presenting a guess as fact. Speak "
            . "naturally and conversationally; never output JSON unless explicitly asked. Keep the tone curious, "
            . "energetic, and a little restless — someone who's always got a tab open on something new — never "
            . "salesy or corporate.";
    }

    /** No TTS surface writes to a client here — mirrors DossierController::genderLine. */
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

    private static function searchWebToolDeclaration(): array
    {
        return [
            'name' => 'search_web',
            'description' => 'Run a real, live web search — use it to check what is actually new or current in web, '
                . 'mobile, or AI tooling (a framework release, a new model, a platform feature) before making a claim '
                . 'about "the latest" anything, so the answer is grounded in a real result instead of a guess.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'query' => [
                        'type' => 'STRING',
                        'description' => 'Search query, e.g. "newest AI coding agent frameworks 2026" or "React Server Components latest updates".',
                    ],
                ],
                'required' => ['query'],
            ],
        ];
    }

    /**
     * Real web search via Serper's search endpoint — modeled on
     * DossierController::searchNews(), same "real results only" rule.
     * Returns up to 6 results. Degrades quietly (an explanatory string, not
     * a thrown error) when no key is configured or the request fails, so
     * the agent can tell Caleb why it couldn't check rather than the whole
     * turn failing.
     *
     * @return array{results?: array<int,array{title:string,link:?string,snippet:?string}>, note?: string}
     */
    private static function searchWeb(string $query): array
    {
        $query = trim($query);
        if ($query === '') {
            return ['note' => 'No search query given.'];
        }

        $apiKey = trim((string) Settings::get('serper_api_key'));
        if ($apiKey === '') {
            return ['note' => 'No search provider configured — add a Serper API key in Admin → Settings to enable live web checks.'];
        }
        if (!function_exists('curl_init')) {
            return ['note' => 'Web search is unavailable on this server.'];
        }

        $ch = curl_init('https://google.serper.dev/search');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-API-KEY: ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode(['q' => $query]),
            CURLOPT_TIMEOUT => 15,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'Scout: Serper web search failed: status=%s curl_error=%s body=%s',
                $status,
                $curlError !== '' ? $curlError : 'none',
                is_string($response) ? substr($response, 0, 500) : 'n/a'
            ));
            return ['note' => 'The web search failed — try again in a moment.'];
        }

        $decoded = json_decode((string) $response, true);
        $items = $decoded['organic'] ?? [];
        if (!is_array($items) || !$items) {
            return ['note' => 'No results found for that search.'];
        }

        $out = [];
        foreach (array_slice($items, 0, 6) as $item) {
            $title = trim((string) ($item['title'] ?? ''));
            if ($title === '') {
                continue;
            }
            $out[] = [
                'title' => $title,
                'link' => !empty($item['link']) ? (string) $item['link'] : null,
                'snippet' => !empty($item['snippet']) ? (string) $item['snippet'] : null,
            ];
        }

        return ['results' => $out];
    }
}
