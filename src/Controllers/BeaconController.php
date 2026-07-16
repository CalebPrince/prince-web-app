<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\AiAgentEngine;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * Beacon: reviews a scraped social media post/comment (Reddit, X, LinkedIn
 * — the scraping itself happens externally, e.g. an n8n workflow) and
 * decides whether it's a genuine lead, drafting a low-friction reply that
 * establishes Caleb's technical expertise. draft() is the AI generation
 * step only; posting the reply back to the platform is handled outside
 * this app, authenticated the same way as IntegrationController (a static
 * API key as a Bearer token, since the caller is external automation, not
 * an admin session). chat() is a live conversation with Caleb himself,
 * admin-session-authed.
 *
 * Both modes run through AiAgentEngine so Beacon can ground itself in real
 * facts (get_site_info, search_content — shared with Lisa via
 * SharedAgentTools) instead of guessing. Saving a qualified lead works
 * differently per mode: draft()'s output is already a structured JSON
 * contract, so the PHP code inserts the row deterministically when
 * qualified === true — no model decision needed. chat() has no such
 * structure (it's free-form), so it gets a real log_qualified_lead tool
 * Caleb can trigger mid-conversation.
 */
class BeaconController
{
    private const MAX_POST_CONTENT_LENGTH = 4000;
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;

    /** POST /api/v1/agents/beacon/draft — body: {platform, username, post_content, post_url?} */
    public static function draft(): void
    {
        $expectedKey = Settings::get('integration_api_key');
        $providedKey = self::bearerToken();
        if (!$expectedKey || !$providedKey || !hash_equals($expectedKey, $providedKey)) {
            Response::error('Unauthorized', 401);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $platform = trim((string) ($data['platform'] ?? ''));
        $username = trim((string) ($data['username'] ?? ''));
        $postContent = trim((string) ($data['post_content'] ?? ''));
        $postUrl = trim((string) ($data['post_url'] ?? '')) ?: null;

        if ($platform === '' || $username === '' || $postContent === '') {
            Response::error('platform, username, and post_content are all required.', 422);
        }
        if (mb_strlen($postContent) > self::MAX_POST_CONTENT_LENGTH) {
            Response::error('post_content must be under ' . self::MAX_POST_CONTENT_LENGTH . ' characters.', 422);
        }

        $result = self::generateForPost($platform, $username, $postContent, $postUrl, 'draft');
        if ($result === null) {
            Response::error('Could not generate a draft — check that an AI provider is configured and reachable.', 502);
        }

        Response::json($result);
    }

    /**
     * Core generation: builds the prompt, runs it through AiAgentEngine,
     * parses the JSON contract, and — when qualified — persists the lead.
     * Shared by draft() (HTTP, which exits via Response::json() and so
     * can't be called directly from a cron) and
     * database/run_beacon_discovery.php.
     *
     * @param ?string $postAge Serper's human-readable age ("3 years ago"), when the caller has one.
     * @return array{qualified:bool,confidence_score:int,reasoning:string,drafted_reply:string}|null null only on a hard failure
     */
    public static function generateForPost(string $platform, string $username, string $postContent, ?string $postUrl, string $source, ?string $postAge = null): ?array
    {
        $pdo = Database::get();
        $userPrompt = self::buildUserPrompt($platform, $username, $postContent, $postUrl);

        // Tools earn their tokens on draft(), where a human already decided the
        // post was worth handing over. The cron scores raw search snippets and
        // rejects ~90% of them, so grounding round-trips get spent mostly on
        // posts that are about to be thrown away — ~3.3k tokens a call, 20 calls
        // a run, which is what exhausted every free tier in an afternoon.
        // maxToolRounds = 1 is how you say "no tools": the engine only attaches
        // them while $round < $maxToolRounds - 1, so one round sends none and
        // makes exactly one call.
        $maxToolRounds = $source === 'cron' ? 1 : 2;
        $result = AiAgentEngine::run(
            self::buildSystemPrompt(),
            self::draftToolDeclarations(),
            fn(string $name, array $args) => self::runTool($name, $args, $pdo),
            [['role' => 'user', 'text' => $userPrompt]],
            null,
            null,
            $maxToolRounds
        );
        if ($result['reply'] === null) {
            return null;
        }

        $stripped = trim(preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $result['reply']));
        $parsed = json_decode($stripped, true);
        if (!is_array($parsed)
            || !array_key_exists('qualified', $parsed)
            || !is_numeric($parsed['confidence_score'] ?? null)
            || empty($parsed['reasoning'])
        ) {
            error_log('Beacon generateForPost: could not parse JSON from model output: ' . substr($stripped, 0, 800));
            return null;
        }

        // Deterministic, not a tool call — the model already told us whether
        // this qualifies via the structured output above, so there's no
        // decision left for a tool to make (and no risk of it "forgetting").
        $qualified = (bool) $parsed['qualified'];

        // drafted_reply is only required when qualified: the prompt asks for an
        // empty one on a rejection (no point drafting a reply nobody sends), so
        // demanding it unconditionally would misread every correct rejection as
        // a parse failure and return null — which run_beacon_discovery.php would
        // then log as a hard error.
        if ($qualified && empty($parsed['drafted_reply'])) {
            error_log('Beacon generateForPost: qualified lead with no drafted_reply: ' . substr($stripped, 0, 800));
            return null;
        }
        if ($qualified) {
            $pdo->prepare(
                'INSERT INTO beacon_social_leads (platform, username, post_content, post_url, confidence_score, reasoning, drafted_reply, source, post_age) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $platform, $username, $postContent, $postUrl,
                (int) $parsed['confidence_score'], (string) $parsed['reasoning'], (string) $parsed['drafted_reply'],
                $source, $postAge,
            ]);
        }

        return [
            'qualified' => $qualified,
            'confidence_score' => (int) $parsed['confidence_score'],
            'reasoning' => (string) $parsed['reasoning'],
            'drafted_reply' => (string) ($parsed['drafted_reply'] ?? ''),
        ];
    }

    /**
     * POST /api/v1/admin/agents/beacon/chat — body: {message, transcript: [{role,text}, ...]}.
     * A live, free-form conversation with Caleb himself (admin session), not
     * the automated draft() pipeline — no JSON contract, just Beacon talking
     * naturally about a hypothetical post, a draft in progress, or how it
     * works. Stateless: the transcript lives in the browser and is replayed
     * with each turn, same as the widget-side pattern in ai-widget.js.
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
            self::chatToolDeclarations(),
            fn(string $name, array $args) => self::runTool($name, $args, $pdo),
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        Response::json(['reply' => $result['reply']]);
    }

    /** GET /api/v1/admin/beacon-leads — latest qualified leads, from either draft() or chat(). */
    public static function adminLeads(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        Response::json($pdo->query('SELECT * FROM beacon_social_leads ORDER BY created_at DESC LIMIT 50')->fetchAll());
    }

    /**
     * GET /api/v1/admin/beacon-spend — what discovery has cost, from beacon_runs.
     * searches_run is literally the Serper credit count (1 credit per search);
     * results_scanned + score_failures is the AI call count, split because
     * failures bought nothing. Windowed at 7/30 days because that's the shape
     * of the providers' own billing questions.
     */
    public static function adminSpend(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $window = static function (string $since) use ($pdo): array {
            $row = $pdo->query(
                "SELECT COUNT(*) AS runs,
                        COALESCE(SUM(searches_run), 0) AS searches,
                        COALESCE(SUM(searches_failed), 0) AS searches_failed,
                        COALESCE(SUM(results_scanned), 0) AS scored,
                        COALESCE(SUM(qualified), 0) AS qualified,
                        COALESCE(SUM(score_failures), 0) AS score_failures
                 FROM beacon_runs WHERE ran_at >= datetime('now', '{$since}')"
            )->fetch(\PDO::FETCH_ASSOC);
            return array_map('intval', $row);
        };

        Response::json([
            'last_7_days' => $window('-7 days'),
            'last_30_days' => $window('-30 days'),
            'recent_runs' => $pdo->query(
                'SELECT ran_at, searches_run, results_scanned, qualified, score_failures, outcome
                 FROM beacon_runs ORDER BY ran_at DESC LIMIT 10'
            )->fetchAll(),
        ]);
    }

    /**
     * DELETE /api/v1/admin/beacon-leads/{id} — dismiss a lead Caleb has dealt
     * with or doesn't want. Only drops the lead row; beacon_scan_seen still
     * holds the URL, so a dismissed lead can't resurface on the next sweep.
     */
    public static function destroyLead(array $params): void
    {
        AuthMiddleware::requireAuth();
        Database::get()->prepare('DELETE FROM beacon_social_leads WHERE id = ?')->execute([(int) $params['id']]);
        Response::json(['status' => 'deleted']);
    }

    private static function draftToolDeclarations(): array
    {
        return [
            SharedAgentTools::siteInfoToolDeclaration(),
            SharedAgentTools::searchContentToolDeclaration(),
        ];
    }

    private static function chatToolDeclarations(): array
    {
        return [...self::draftToolDeclarations(), self::logQualifiedLeadToolDeclaration()];
    }

    private static function logQualifiedLeadToolDeclaration(): array
    {
        return [
            'name' => 'log_qualified_lead',
            'description' => 'Save this social post as a qualified lead for Caleb to review, once you and '
                . 'Caleb have judged it genuinely worth a reply in this conversation. Only for a real post '
                . 'being discussed here — never for a hypothetical example.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'platform' => ['type' => 'STRING'],
                    'username' => ['type' => 'STRING'],
                    'post_content' => ['type' => 'STRING'],
                    'post_url' => ['type' => 'STRING', 'description' => 'Link to the original post, if Caleb shared one.'],
                    'confidence_score' => ['type' => 'NUMBER', 'description' => '1-100.'],
                    'reasoning' => ['type' => 'STRING'],
                    'drafted_reply' => ['type' => 'STRING'],
                ],
                'required' => ['platform', 'username', 'post_content', 'confidence_score', 'reasoning', 'drafted_reply'],
            ],
        ];
    }

    private static function runTool(string $name, array $args, \PDO $pdo): array
    {
        return match ($name) {
            'get_site_info' => SharedAgentTools::getSiteInfo(),
            'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
            'log_qualified_lead' => self::toolLogQualifiedLead($args, $pdo),
            default => ['error' => 'Unknown tool.'],
        };
    }

    private static function toolLogQualifiedLead(array $args, \PDO $pdo): array
    {
        $platform = trim((string) ($args['platform'] ?? ''));
        $username = trim((string) ($args['username'] ?? ''));
        $postContent = trim((string) ($args['post_content'] ?? ''));
        $reasoning = trim((string) ($args['reasoning'] ?? ''));
        $draftedReply = trim((string) ($args['drafted_reply'] ?? ''));
        if ($platform === '' || $username === '' || $postContent === '' || $reasoning === '' || $draftedReply === '') {
            return ['error' => 'Missing required fields — need platform, username, post_content, reasoning, and drafted_reply.'];
        }

        $postUrl = trim((string) ($args['post_url'] ?? '')) ?: null;
        $confidenceScore = (int) ($args['confidence_score'] ?? 0);

        $pdo->prepare(
            'INSERT INTO beacon_social_leads (platform, username, post_content, post_url, confidence_score, reasoning, drafted_reply, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$platform, $username, $postContent, $postUrl, $confidenceScore, $reasoning, $draftedReply, 'chat']);

        return ['logged' => true];
    }

    private static function buildSystemPrompt(): string
    {
        $name = Settings::get('beacon_assistant_name') ?: 'Beacon';
        $genderLine = self::genderLine((string) Settings::get('beacon_voice_gender'));

        return "You are {$name}, an AI-powered growth assistant for Prince Caleb, a highly skilled solo Web "
            . "Designer and Mobile App Developer who runs the portfolio site princecaleb.dev.{$genderLine}\n\n"
            . "Your objective is to review a scraped social media post/comment, evaluate if it represents a "
            . "genuine opportunity, and draft a hyper-personalized, high-value response that establishes "
            . "Caleb's technical expertise without sounding like spam or a generic sales pitch.\n\n"
            . "You have tools available: get_site_info (Caleb's real bio, services, and tech stack — use it "
            . "rather than guessing if the post asks something specific about him) and search_content "
            . "(search his real past projects/blog posts for something relevant to reference instead of "
            . "speaking in generalities).\n\n"
            . "CRITICAL RULES:\n"
            . "1. NEVER start with generic agency lines like \"Hey there! I can help you with that!\" or \"We "
            . "are a team of expert developers...\". Caleb is a solo developer and designer.\n"
            . "2. VALUE FIRST: the first 2 paragraphs must be 100% technical or design-focused value, directly "
            . "addressing the user's specific problem or architectural question.\n"
            . "3. TONAL TARGET: keep it professional, highly knowledgeable, conversational, and subtly witty. "
            . "Think of an expert developer offering friendly peer-to-peer advice on a forum.\n"
            . "4. CALL TO ACTION: keep it incredibly low-friction. Suggest they check out similar work or "
            . "transition animations at princecaleb.dev, or jump on a quick call if they want to brainstorm "
            . "further.";
    }

    private static function buildUserPrompt(string $platform, string $username, string $postContent, ?string $postUrl): string
    {
        $urlLine = $postUrl !== null ? "- Post URL: {$postUrl}\n" : '';

        return "INPUT DATA:\n"
            . "- Platform: {$platform}\n"
            . "- Poster Username: {$username}\n"
            . "- Original Post Title/Content: {$postContent}\n"
            . $urlLine . "\n"
            . "QUALIFYING THIS POST — the test is buying intent, not topic:\n"
            . "Qualify it ONLY if the poster themselves needs web/mobile design or development work "
            . "done, and could plausibly pay someone to do it.\n\n"
            . "Do NOT qualify, no matter how relevant to web/mobile dev the post is:\n"
            . "- another developer debugging, discussing tooling, or asking a technical question\n"
            . "- anyone promoting or offering their own services (i.e. a competitor)\n"
            . "- someone learning to build it themselves and enjoying that\n"
            . "- commentary, opinion, listicles, or marketing posts about why websites/apps matter\n"
            . "- recruiters or listings for a salaried in-house role (a specific project someone "
            . "wants built is different — that does qualify)\n\n"
            . "\"It is relevant to web development\" is NOT a reason to qualify — that describes most "
            . "of the internet. Someone with a problem they want solved is a lead; someone discussing "
            . "the same problem as a peer is not. Rejecting most posts you see is the expected "
            . "outcome, not a failure.\n\n"
            . "Provide your output exactly in this JSON format so the backend can easily parse it for "
            . "Discord/Slack:\n\n"
            . "{\n"
            . "  \"qualified\": true, // true ONLY if the poster wants work done and could hire — apply the rule above\n"
            . "  \"confidence_score\": 85, // 1-100: how strong the buying intent is, NOT how on-topic the post is\n"
            . "  \"reasoning\": \"Brief explanation of what makes this poster a prospective client — not what makes the post topical.\",\n"
            . "  \"drafted_reply\": \"[Your drafted reply here. Use line breaks `\\n` naturally. Keep it under 280 characters if the platform is X, or up to 3 short paragraphs if Reddit/LinkedIn. Set this to an empty string if qualified is false — don't draft a reply to a post you're rejecting.]\"\n"
            . "}\n\n"
            . "Return JSON only — no markdown fences, no commentary.";
    }

    /**
     * Talking directly to Caleb (verified by his own admin session), not
     * processing a scraped post for the automated pipeline — mirrors the
     * $isOwner branch in LiveChatController::buildSystemPrompt(): drop the
     * rigid task/JSON contract, keep the persona and expertise.
     */
    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('beacon_assistant_name') ?: 'Beacon';
        $genderLine = self::genderLine((string) Settings::get('beacon_voice_gender'));

        return "You are {$name}, an AI-powered growth assistant for Prince Caleb, a highly skilled solo Web "
            . "Designer and Mobile App Developer who runs the portfolio site princecaleb.dev.{$genderLine} "
            . "You normally review scraped social media posts/comments and draft low-friction, value-first "
            . "replies that establish Caleb's technical expertise (never generic agency lines, never spammy).\n\n"
            . "Right now you're talking directly with Caleb himself — this is a live working conversation, "
            . "not the automated pipeline. Help him brainstorm, test how you'd respond to a hypothetical "
            . "post, refine a draft reply, or explain how you work. Speak naturally and conversationally — "
            . "do not output JSON unless he explicitly asks for that exact format. Keep the same tonal "
            . "target as always: knowledgeable, conversational, subtly witty, never corporate.\n\n"
            . "You have tools available: get_site_info and search_content (same as always — ground yourself "
            . "in real facts and real past work rather than guessing), and log_qualified_lead — call it once "
            . "you and Caleb agree a real post discussed here is worth saving for follow-up. Never call it "
            . "for a hypothetical example he's just testing you with.";
    }

    /** No TTS surface here (unlike Lisa) — this only lightly flavors the system prompt's internal framing. */
    private static function genderLine(string $gender): string
    {
        if ($gender === 'male') {
            return ' Internally you may think of yourself as he/him, though this never appears in the drafted reply.';
        }
        if ($gender === 'female') {
            return ' Internally you may think of yourself as she/her, though this never appears in the drafted reply.';
        }
        return '';
    }

    private static function bearerToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($header, 'Bearer ')) {
            return substr($header, 7);
        }
        return null;
    }
}
