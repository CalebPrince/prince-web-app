<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiAgentEngine;
use App\Support\ApifyClient;
use App\Support\Composio;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * Radar: LinkedIn research, pipeline reporting, and post-performance
 * tracking. Deliberately does NOT send messages or connect to anyone —
 * LinkedIn's official API surface (via the existing Composio connection)
 * has no messaging action at all, so real DM outreach would need an
 * unofficial third-party automation tool and the account-ban risk that
 * comes with it. Caleb chose to skip that and keep this agent to the three
 * capabilities that are safely buildable on what's already connected:
 *
 * 1. analyze_linkedin_url — real profile/company data via the same Apify
 *    actor Beacon's engagement scraper already uses (beacon_apify_actor_posts),
 *    so Caleb can paste a prospect's LinkedIn URL and get a grounded read
 *    instead of a guess. Falls back to asking for pasted text when Apify
 *    isn't configured.
 * 2. get_pipeline_report — real counts from Beacon's leads/spend and the
 *    Cold Outreach Engine's scoreboard (OutreachController::computeScoreboard,
 *    reused rather than re-derived), never an invented figure.
 * 3. get_linkedin_post_performance — best-effort Composio stats lookup on
 *    Caleb's own recently published posts (linkedin_post_urn, captured by
 *    SocialDraftController on publish). Composio's LinkedIn integration is
 *    untested against a live account in this codebase (see Composio.php's
 *    docblock) — this degrades to an explanatory note rather than failing
 *    the whole turn if the tool slug/response shape needs adjusting.
 */
class RadarController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;

    /**
     * POST /api/v1/admin/agents/radar/chat — body: {message, transcript: [{role,text}, ...]}.
     * Stateless: the transcript lives in the browser and is replayed each
     * turn, mirroring ScoutController::chat().
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
                self::analyzeLinkedInUrlToolDeclaration(),
                self::getPipelineReportToolDeclaration(),
                self::getPostPerformanceToolDeclaration(),
                self::saveDmDraftToolDeclaration(),
            ],
            fn(string $name, array $args) => match ($name) {
                'get_site_info' => SharedAgentTools::getSiteInfo(),
                'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
                'analyze_linkedin_url' => self::analyzeLinkedInUrl((string) ($args['url'] ?? '')),
                'get_pipeline_report' => self::getPipelineReport($pdo),
                'get_linkedin_post_performance' => self::getLinkedInPostPerformance($pdo),
                'save_dm_draft' => self::saveDmDraft($args, $pdo),
                default => ['error' => 'Unknown tool.'],
            },
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        ActivityLog::log($user, 'reported', 'radar_chat', null, mb_substr($message, 0, 120));

        Response::json(['reply' => SharedAgentTools::stripMarkdown($result['reply'])]);
    }

    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('radar_assistant_name') ?: 'Radar';
        $genderLine = self::genderLine((string) Settings::get('radar_voice_gender'));

        return "You are {$name}, the LinkedIn research & reporting specialist on Prince Caleb's AI team — Caleb is a "
            . "solo developer who builds AI voice agents, chatbots, and business automations on 12+ years of custom "
            . "web & mobile engineering, and runs princecaleb.dev.{$genderLine}\n\n"
            . "Your job has four parts: (1) analyze a LinkedIn profile, company, or post Caleb gives you a URL for "
            . "— use analyze_linkedin_url to pull real data rather than guessing who someone is; if it comes back "
            . "empty or unconfigured, ask Caleb to paste the profile/post text directly instead of inventing an "
            . "analysis. (2) report on the real state of the lead pipeline (Beacon's qualified leads, discovery "
            . "spend, Cold Outreach's daily numbers and streak) via get_pipeline_report — every figure you state "
            . "about the pipeline must come from that tool, never be estimated. (3) report on how Caleb's own "
            . "published LinkedIn posts are performing via get_linkedin_post_performance — this one is best-effort "
            . "(the underlying integration hasn't been exercised against a live account yet), so if it returns an "
            . "error or empty result, say so plainly rather than inventing engagement numbers. (4) draft outreach "
            . "DM messages — when Caleb wants to reach out to someone (a person from analyze_linkedin_url, a "
            . "Beacon engagement lead, anyone), write a short, personal, low-pressure message grounded in whatever "
            . "real context you have about them (their headline, what they posted, what they engaged with) — never "
            . "a generic pitch. Once you and Caleb agree the draft is good, call save_dm_draft to save it so it "
            . "shows up in his review queue. Only call it once — don't save every rough draft, just the final one.\n\n"
            . "CRITICAL: you do not send messages, connect with anyone, or post on Caleb's behalf, and drafting a "
            . "DM does not send it either — that's deliberately out of scope (LinkedIn's official API has no "
            . "messaging action available to this app, and the unofficial alternative carries real account-ban "
            . "risk Caleb chose not to take). Every DM you draft, Caleb copies and sends himself from his own "
            . "LinkedIn. Never imply or claim a message was actually sent.\n\n"
            . "Speak naturally and conversationally; never output raw JSON unless explicitly asked. Be concrete and "
            . "numbers-first when reporting — lead with the actual figures, then interpret them. Never state a "
            . "number you didn't get from a tool call in this conversation.";
    }

    /** No TTS surface writes to a client here — mirrors ScoutController::genderLine. */
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

    private static function analyzeLinkedInUrlToolDeclaration(): array
    {
        return [
            'name' => 'analyze_linkedin_url',
            'description' => 'Fetch real, current data for a LinkedIn profile or company URL (their recent posts, '
                . 'content, engagement) via Apify — the same actor Beacon\'s engagement scraper uses. Use this '
                . 'whenever Caleb gives you a LinkedIn URL to research, rather than guessing who they are or what '
                . 'they post about.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'url' => ['type' => 'STRING', 'description' => 'A LinkedIn profile or company page URL.'],
                ],
                'required' => ['url'],
            ],
        ];
    }

    /** @return array{posts?: array<int,array<string,mixed>>, note?: string} */
    private static function analyzeLinkedInUrl(string $url): array
    {
        $url = trim($url);
        if ($url === '' || !str_contains($url, 'linkedin.com')) {
            return ['note' => 'That does not look like a LinkedIn URL — ask Caleb for a real profile or company link.'];
        }

        $actorId = trim((string) Settings::get('beacon_apify_actor_posts'));
        if ($actorId === '' || trim((string) Settings::get('apify_api_key')) === '') {
            return ['note' => 'No Apify actor/API key is configured for LinkedIn lookups yet (Admin -> Talk to '
                . 'Agents -> Joan/Beacon). Ask Caleb to paste the profile or post text directly instead.'];
        }

        $template = (string) (Settings::get('beacon_apify_actor_posts_input')
            ?: '{"targetUrls": ["{{PROFILE_URL}}"], "maxPosts": {{POSTS_LIMIT}}}');
        $input = ApifyClient::fillTemplate($template, ['PROFILE_URL' => $url, 'POSTS_LIMIT' => '5']);
        if ($input === null) {
            return ['note' => 'The configured Apify input template is not valid JSON — check '
                . 'beacon_apify_actor_posts_input in settings.'];
        }

        $error = null;
        $items = ApifyClient::runActor($actorId, $input, $error);
        if ($items === null) {
            return ['note' => 'The Apify lookup failed: ' . ($error ?? 'unknown error') . '. Ask Caleb to paste '
                . 'the profile/post text directly instead.'];
        }
        if (!$items) {
            return ['note' => 'Apify returned no data for that URL — it may be private, empty, or the wrong '
                . 'kind of link. Ask Caleb to paste the text directly instead.'];
        }

        // Pass the raw items through — the model is far better at reading an
        // unfamiliar JSON shape than bespoke PHP extraction would be here,
        // unlike the cron path (run_beacon_apify_discovery.php) which has no
        // model in the loop and needs deterministic field lookups instead.
        return ['posts' => array_slice($items, 0, 5)];
    }

    private static function getPipelineReportToolDeclaration(): array
    {
        return [
            'name' => 'get_pipeline_report',
            'description' => 'Get the real, current state of the lead pipeline: Beacon\'s qualified leads (by '
                . 'source, last 7/30 days), Beacon\'s discovery spend, and the Cold Outreach Engine\'s scoreboard '
                . '(today\'s emails/calls/social activity, streak, targets). Use this whenever Caleb asks how the '
                . 'pipeline or lead gen is doing — never estimate these figures.',
            'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
        ];
    }

    /** @return array<string,mixed> */
    private static function getPipelineReport(\PDO $pdo): array
    {
        $leadWindow = static function (string $since) use ($pdo): array {
            $row = $pdo->query(
                "SELECT COUNT(*) AS total,
                        COALESCE(SUM(CASE WHEN review_status = 'accepted' THEN 1 ELSE 0 END), 0) AS accepted,
                        COALESCE(SUM(CASE WHEN source = 'linkedin_engagement' THEN 1 ELSE 0 END), 0) AS linkedin_engagement,
                        COALESCE(SUM(CASE WHEN source = 'cron' THEN 1 ELSE 0 END), 0) AS keyword_discovery
                 FROM beacon_social_leads WHERE created_at >= datetime('now', '{$since}')"
            )->fetch(\PDO::FETCH_ASSOC);
            return array_map('intval', $row);
        };

        $runsWindow = static function (string $table, string $since) use ($pdo): int {
            return (int) $pdo->query(
                "SELECT COUNT(*) FROM {$table} WHERE ran_at >= datetime('now', '{$since}')"
            )->fetchColumn();
        };

        $marketingLeadsByStatus = $pdo->query(
            'SELECT status, COUNT(*) AS n FROM marketing_leads GROUP BY status'
        )->fetchAll(\PDO::FETCH_KEY_PAIR);

        return [
            'beacon_leads_last_7_days' => $leadWindow('-7 days'),
            'beacon_leads_last_30_days' => $leadWindow('-30 days'),
            'beacon_discovery_runs_last_7_days' => $runsWindow('beacon_runs', '-7 days'),
            'beacon_apify_runs_last_7_days' => $runsWindow('beacon_apify_runs', '-7 days'),
            'marketing_leads_by_status' => $marketingLeadsByStatus,
            'outreach_scoreboard' => OutreachController::computeScoreboard($pdo),
        ];
    }

    private static function getPostPerformanceToolDeclaration(): array
    {
        return [
            'name' => 'get_linkedin_post_performance',
            'description' => 'Get engagement stats (reactions, comments) for Caleb\'s most recently published '
                . 'LinkedIn posts, via the Composio LinkedIn connection. Best-effort — this integration has not '
                . 'been exercised against a live account yet, so a failure here is expected sometimes; report it '
                . 'plainly rather than inventing numbers.',
            'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
        ];
    }

    private static function saveDmDraftToolDeclaration(): array
    {
        return [
            'name' => 'save_dm_draft',
            'description' => 'Save a finished outreach DM draft to Caleb\'s review queue. This does NOT send '
                . 'anything — Caleb copies the message and sends it himself from his own LinkedIn account. Only '
                . 'call this once you and Caleb have actually settled on the final wording, not for a rough first '
                . 'attempt.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'target_name' => ['type' => 'STRING', 'description' => 'Who this message is for.'],
                    'target_headline' => ['type' => 'STRING', 'description' => 'Their LinkedIn headline/title, if known.'],
                    'target_profile_url' => ['type' => 'STRING', 'description' => 'Link to their LinkedIn profile, if known.'],
                    'source_post_url' => ['type' => 'STRING', 'description' => 'Link to the post that prompted this outreach, if there was one.'],
                    'message' => ['type' => 'STRING', 'description' => 'The final drafted DM text.'],
                ],
                'required' => ['target_name', 'message'],
            ],
        ];
    }

    /** @return array{saved: true, id: int}|array{error: string} */
    private static function saveDmDraft(array $args, \PDO $pdo): array
    {
        $targetName = trim((string) ($args['target_name'] ?? ''));
        $message = trim((string) ($args['message'] ?? ''));
        if ($targetName === '' || $message === '') {
            return ['error' => 'Missing required fields — need target_name and message.'];
        }

        $stmt = $pdo->prepare(
            'INSERT INTO radar_dm_drafts (target_name, target_headline, target_profile_url, source_post_url, drafted_message)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $targetName,
            trim((string) ($args['target_headline'] ?? '')) ?: null,
            trim((string) ($args['target_profile_url'] ?? '')) ?: null,
            trim((string) ($args['source_post_url'] ?? '')) ?: null,
            $message,
        ]);

        return ['saved' => true, 'id' => (int) $pdo->lastInsertId()];
    }

    /** GET /api/v1/admin/radar-dm-drafts — latest drafted outreach DMs, newest first. */
    public static function adminDrafts(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(Database::get()->query(
            'SELECT * FROM radar_dm_drafts ORDER BY created_at DESC LIMIT 50'
        )->fetchAll());
    }

    /** DELETE /api/v1/admin/radar-dm-drafts/{id} — dismiss a draft Caleb has sent or doesn't want. */
    public static function destroyDraft(array $params): void
    {
        AuthMiddleware::requireAuth();
        Database::get()->prepare('DELETE FROM radar_dm_drafts WHERE id = ?')->execute([(int) $params['id']]);
        Response::json(['status' => 'deleted']);
    }

    /** @return array{posts?: array<int,array<string,mixed>>, note?: string} */
    private static function getLinkedInPostPerformance(\PDO $pdo): array
    {
        $accountId = Settings::get('composio_linkedin_account_id');
        if (empty($accountId)) {
            return ['note' => 'No LinkedIn account is connected via Composio yet (Admin -> Settings -> Integrations).'];
        }

        $rows = $pdo->query(
            "SELECT id, content, published_at, linkedin_post_urn FROM social_post_drafts
             WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 5"
        )->fetchAll(\PDO::FETCH_ASSOC);
        if (!$rows) {
            return ['note' => 'No published LinkedIn posts recorded yet.'];
        }

        $out = [];
        $anyStatsFound = false;
        foreach ($rows as $row) {
            $entry = [
                'published_at' => $row['published_at'],
                'excerpt' => mb_substr((string) $row['content'], 0, 140),
            ];
            if (empty($row['linkedin_post_urn'])) {
                $entry['stats'] = null;
                $entry['note'] = 'No post URN stored for this one (published before tracking started, or the '
                    . 'create-post response didn\'t include one).';
                $out[] = $entry;
                continue;
            }

            $result = Composio::executeTool(
                'LINKEDIN_GET_SHARE_STATISTICS',
                $accountId,
                ['shareUrn' => $row['linkedin_post_urn']]
            );
            if ($result === null) {
                $entry['stats'] = null;
                $entry['note'] = 'Stats lookup failed: ' . (Composio::lastError() ?? 'unknown error');
            } else {
                $entry['stats'] = $result;
                $anyStatsFound = true;
            }
            $out[] = $entry;
        }

        return $anyStatsFound
            ? ['posts' => $out]
            : ['posts' => $out, 'note' => 'Stats lookups failed for every post — the Composio LINKEDIN_GET_SHARE_STATISTICS '
                . 'tool slug/response shape may need adjusting once tested against a real account.'];
    }
}
