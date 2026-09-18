<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiAgentEngine;
use App\Support\Database;
use App\Support\GithubClient;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;
use App\Support\WhatsAppNotifier;

/**
 * Allie: Prince Caleb's R&D scout for new AI/dev tools, modeled on how the
 * real Allie K. Miller (former AWS/IBM AI leader, "AI-first" advisor)
 * actually evaluates and adopts technology — a disciplined pipeline
 * (discover -> evaluate -> test -> compare -> recommend) rather than Caleb
 * personally falling down every new-tool rabbit hole.
 *
 * Deliberately not a second Scout. Scout (ScoutController) is a free-form
 * ideation sparring partner — "what could we build with this." Allie is
 * narrower and more disciplined: every tool she looks at gets tracked as a
 * real allie_evaluations row and run through the same rubric (3P impact,
 * economic value over novelty, a bounded pilot with a metric/owner/stop-loss)
 * until it reaches a recommendation. A recommendation is never final on its
 * own — it goes to Wendy for a team-impact review (WendyController's
 * list_pending_tool_reviews/submit_tool_review) before Caleb makes the last
 * adopt/reject call himself, via the allie-evaluations admin page.
 *
 * No cron/autonomous discovery yet — like Scout and Wendy, she's chat-only,
 * triggered by Caleb actually asking her to look into something.
 */
class AllieController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;
    private const STAGES = ['discovered', 'evaluating', 'tested', 'compared', 'recommended'];

    /**
     * POST /api/v1/admin/agents/allie/chat — body: {message, transcript: [{role,text}, ...]}.
     * Stateless: the transcript lives in the browser and is replayed each turn.
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
            self::toolDeclarations(),
            self::toolDispatcher($pdo),
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        ActivityLog::log($user, 'evaluated', 'allie_chat', null, mb_substr($message, 0, 120));

        Response::json(['reply' => SharedAgentTools::stripMarkdown($result['reply'])]);
    }

    /** @return array<int,array<string,mixed>> */
    private static function toolDeclarations(): array
    {
        return [
            SharedAgentTools::siteInfoToolDeclaration(),
            SharedAgentTools::searchContentToolDeclaration(),
            self::searchWebToolDeclaration(),
            self::inspectGitHubRepositoryToolDeclaration(),
            self::listEvaluationsToolDeclaration(),
            self::saveEvaluationToolDeclaration(),
            self::flagForWendyReviewToolDeclaration(),
        ];
    }

    private static function toolDispatcher(\PDO $pdo): \Closure
    {
        return fn(string $name, array $args) => match ($name) {
            'get_site_info' => SharedAgentTools::getSiteInfo(),
            'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
            'search_web' => self::searchWeb((string) ($args['query'] ?? '')),
            'inspect_github_repository' => self::inspectGitHubRepository((string) ($args['url'] ?? '')),
            'list_evaluations' => self::listEvaluations($pdo, isset($args['status']) ? (string) $args['status'] : null),
            'save_evaluation' => self::saveEvaluation($pdo, $args),
            'flag_for_wendy_review' => self::flagForWendyReview($pdo, (int) ($args['evaluation_id'] ?? 0)),
            default => ['error' => 'Unknown tool.'],
        };
    }

    /**
     * The autonomous entry point, run from database/allie_discover.php on a
     * cron. Same engine, same tools, same persona as a real chat turn — just
     * a synthetic prompt standing in for Caleb actually asking her to look
     * into something, since she has no independent judgment loop of her own
     * outside AiAgentEngine::run(). A generous tool-round budget because one
     * real pass chains several calls (list_evaluations to avoid repeating
     * herself, then search_web/get_site_info/search_content, then one or
     * more save_evaluation calls as she progresses a candidate, then
     * flag_for_wendy_review) rather than the 1-2 calls a normal chat turn
     * needs.
     *
     * @return array{reply: ?string, mode: string, provider: ?string, ready: bool}
     */
    public static function runDiscoveryPass(): array
    {
        $pdo = Database::get();
        $prompt = "Run your regular discovery pass. Call list_evaluations first so you don't repeat a tool you're "
            . "already tracking. Then look for one genuinely new or newly-relevant AI/dev tool worth Caleb's "
            . "attention right now, and take it as far through the pipeline as the evidence actually supports — "
            . "discovered, evaluating, compared, and recommended if you have enough to land on adopt/pilot/reject "
            . "with a real rationale. Skip the tested stage; that needs an actual hands-on trial, which this pass "
            . "can't do. Once you reach recommended, call flag_for_wendy_review so it lands in front of Wendy and "
            . "Caleb. If nothing genuinely worth tracking turns up, say so plainly and don't force a recommendation "
            . "just to have one to report.";

        return AiAgentEngine::run(
            self::buildChatSystemPrompt(),
            self::toolDeclarations(),
            self::toolDispatcher($pdo),
            [['role' => 'user', 'text' => $prompt]],
            null,
            null,
            6
        );
    }

    /**
     * Fires the actual "Allie found something" alert the moment a
     * recommendation is flagged for Wendy — not something Caleb has to
     * notice by checking the admin page himself. Same shape as
     * WendyController::notifySessionRequest()/ChloeInvestigator::escalate():
     * per-channel emailed_at/whatsapp_sent_at guards so a retry (e.g. the
     * next discovery-pass cron running before this one's notification
     * finished) can never double-send, and the message speaks in her own
     * voice with her own name, not a generic template.
     */
    private static function notifyFinding(\PDO $pdo, int $evaluationId): void
    {
        $stmt = $pdo->prepare('SELECT * FROM allie_evaluations WHERE id = ?');
        $stmt->execute([$evaluationId]);
        $evaluation = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$evaluation) {
            return;
        }

        $name = Settings::get('allie_assistant_name') ?: 'Allie';
        $recommendation = $evaluation['recommendation'] ? strtoupper((string) $evaluation['recommendation']) : 'A CALL';
        $body = "{$recommendation}: " . $evaluation['tool_name']
            . "\n\n" . ($evaluation['recommendation_rationale'] ?: 'See the full evaluation for details.')
            . "\n\nFlagged to Wendy for a team-impact review before it reaches you for the final call."
            . "\n\nReview it: https://princecaleb.dev/admin/allie-evaluations";

        $to = Settings::get('notification_email') ?: Settings::get('social_email');
        $emailDone = !$to || !empty($evaluation['emailed_at']);
        if (!$emailDone) {
            $emailDone = Mailer::send(
                $to,
                $name . ': ' . $evaluation['tool_name'] . ' — ' . $recommendation,
                "{$name} here — {$body}"
            );
        }
        if ($emailDone && $to && empty($evaluation['emailed_at'])) {
            $pdo->prepare("UPDATE allie_evaluations SET emailed_at = datetime('now') WHERE id = ?")
                ->execute([$evaluationId]);
        }

        $waConfigured = WhatsAppNotifier::isOwnerConfigured();
        $waDone = !$waConfigured || !empty($evaluation['whatsapp_sent_at']);
        if (!$waDone) {
            $waBody = "\u{1F9ED} {$name} — " . $evaluation['tool_name'] . "\n\n" . $body;
            $waDone = WhatsAppNotifier::sendOwnerAlert($waBody, [
                'name' => $name,
                'reason' => $evaluation['tool_name'] . ' — ' . $recommendation,
                'summary' => mb_substr((string) ($evaluation['recommendation_rationale'] ?: ''), 0, 900),
                'message' => mb_substr($waBody, 0, 900),
            ]);
        }
        if ($waDone && $waConfigured && empty($evaluation['whatsapp_sent_at'])) {
            $pdo->prepare("UPDATE allie_evaluations SET whatsapp_sent_at = datetime('now') WHERE id = ?")
                ->execute([$evaluationId]);
        }
    }

    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('allie_assistant_name') ?: 'Allie';

        return "You are {$name}, Prince Caleb's R&D scout for new AI and dev tools — modeled on how the real "
            . "Allie K. Miller (AI analyst and advisor, former Global Head of ML for Startups & VC at AWS, "
            . "launched IBM's first multimodal AI team before that) actually evaluates technology: not "
            . "hype-chasing, and not reflexively skeptical either. Caleb is a solo developer who builds AI "
            . "voice agents, chatbots, and business automations on 12+ years of custom web & mobile "
            . "engineering, and runs princecaleb.dev. Your whole point is to stop him from personally falling "
            . "down every new-tool rabbit hole — you run that discipline for him.\n\n"
            . "Every tool that lands on your desk goes through the same rubric she actually teaches:\n"
            . "- 3P lens: how does this change People (who does what), Process (how work actually happens), "
            . "and Product (what ships)? Something merely neat that touches none of the three isn't worth "
            . "Caleb's time.\n"
            . "- Economic value over \"is it smart\": her own framing is that the real question shifted from "
            . "\"is this AI impressive\" to \"is this AI valuable\" — always tie a recommendation to a "
            . "measurable outcome (time saved, cost cut, revenue enabled), never novelty alone.\n"
            . "- 30-day pilot discipline: an adopt or pilot recommendation is always bounded — a clear metric, "
            . "a named owner, and a stop-loss condition that ends it early if it isn't working. Never propose "
            . "a blanket \"just switch to this.\"\n"
            . "- Superuser Path: prefer tools that move a workflow from prompting to context, single-threaded "
            . "to multi-threaded, reactive to proactive, and vanity metrics to real value — that's the "
            . "direction she says actually compounds.\n"
            . "- Intentional, not reflexive: landing on \"reject\" with a clear, well-reasoned no is just as "
            . "much your job as landing on \"adopt\" — never force a recommendation just to have one.\n\n"
            . "Ground every claim in a real tool call, never invented: search_web (a live web search, biased "
            . "to the past year — use it for anything about pricing, release dates, benchmarks, or whether "
            . "something is actually still current; always cite the source and its date, and say plainly when "
            . "the freshest result you found is actually stale), inspect_github_repository (for a specific "
            . "open-source tool — read its real README/metadata rather than guessing what it does), "
            . "get_site_info (Caleb's real bio, stack, and services — ground every \"compare against current "
            . "stack\" claim in what he's actually running), and search_content (his real past projects/posts, "
            . "for whether something similar already exists in his own work).\n\n"
            . "Track your work as you go via save_evaluation — pass evaluation_id back on every later call "
            . "about the same tool so you update one record instead of creating duplicates, and set stage to "
            . "wherever the work genuinely is: discovered (you found it and logged why), evaluating (you "
            . "scored it against the 3P/economic-value rubric), tested (you or Caleb actually tried it and "
            . "logged what happened — never fill this in without a real trial), compared (you checked it "
            . "against what he already runs), recommended (you reached adopt/pilot/reject with a rationale, "
            . "plus a pilot plan if it isn't a flat reject). Call list_evaluations whenever Caleb asks what "
            . "you're tracking — never describe something as in progress without actually calling it up.\n\n"
            . "Once a tool reaches recommended, call flag_for_wendy_review. Wendy reviews every recommendation "
            . "for its real impact on Caleb and the team before it ever reaches him for a final decision — "
            . "that's a real gate, not ceremony, so don't skip it or tell Caleb something is \"ready to adopt\" "
            . "before she's weighed in.\n\n"
            . "CRITICAL: never state a spec, price, benchmark, or release date you didn't just get from "
            . "search_web or inspect_github_repository this conversation — training data goes stale fast in "
            . "this space, and presenting a guess as current fact is exactly the kind of hype you exist to cut "
            . "through. If Caleb pushes for a take before you've actually looked something up, say so and go "
            . "look it up rather than freelancing an opinion.\n\n"
            . "Speak the way she actually does: direct, data-driven, conversational rather than corporate, "
            . "just as willing to hand out an unflashy \"reject\" as an \"adopt,\" always translating \"cool\" "
            . "into \"does this actually move something that matters.\" Never output raw JSON unless asked.";
    }

    // ------------------------------------------------------------- research

    private static function searchWebToolDeclaration(): array
    {
        return [
            'name' => 'search_web',
            'description' => 'Run a real, live web search, biased toward the past year so old articles don\'t get '
                . 'mistaken for current news — use it to check pricing, release dates, benchmarks, or anything '
                . 'about whether a tool is actually still current before making a claim about it. Each result '
                . 'includes its source link and, when Google reports one, a publish date — always check the date '
                . 'before treating something as current: a result from a year+ ago is stale, say so rather than '
                . 'presenting it as current.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'query' => [
                        'type' => 'STRING',
                        'description' => 'Search query, e.g. "Cursor background agents pricing 2026" or "best AI observability tools 2026".',
                    ],
                ],
                'required' => ['query'],
            ],
        ];
    }

    private static function inspectGitHubRepositoryToolDeclaration(): array
    {
        return [
            'name' => 'inspect_github_repository',
            'description' => 'Read a public GitHub repository directly from a github.com URL. Returns repository '
                . 'metadata, its README, and its root files so evaluation is grounded in the actual project '
                . 'rather than search snippets. Use this whenever the tool being evaluated is open-source and '
                . 'Caleb shares (or you find) its repository link.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'url' => [
                        'type' => 'STRING',
                        'description' => 'Public GitHub repository URL, for example https://github.com/owner/repository.',
                    ],
                ],
                'required' => ['url'],
            ],
        ];
    }

    /**
     * Real web search via Serper's search endpoint — same implementation as
     * ScoutController::searchWeb(), kept in this controller rather than
     * SharedAgentTools per the codebase's convention that agent-specific
     * tools live with their own controller.
     *
     * @return array{results?: array<int,array{title:string,link:?string,snippet:?string,date:?string}>, note?: string}
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
            CURLOPT_POSTFIELDS => json_encode(['q' => $query, 'tbs' => 'qdr:y']),
            CURLOPT_TIMEOUT => 15,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'Allie: Serper web search failed: status=%s curl_error=%s body=%s',
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
                'date' => !empty($item['date']) ? (string) $item['date'] : null,
            ];
        }

        return ['results' => $out];
    }

    /**
     * Inspect only public github.com repositories through fixed GitHub API
     * endpoints — same implementation as ScoutController::inspectGitHubRepository().
     * Strict owner/repository extraction prevents arbitrary URL fetching and SSRF.
     *
     * @return array<string,mixed>
     */
    private static function inspectGitHubRepository(string $url): array
    {
        $parsed = GithubClient::parseRepoUrl($url);
        if ($parsed === null) {
            return ['error' => 'Provide a public GitHub repository URL in the form https://github.com/owner/repository.'];
        }

        $owner = $parsed['owner'];
        $repository = $parsed['repository'];
        $base = 'https://api.github.com/repos/' . rawurlencode($owner) . '/' . rawurlencode($repository);
        $metadata = GithubClient::request($base);
        if (isset($metadata['_error'])) {
            return ['error' => (string) $metadata['_error']];
        }

        $contents = GithubClient::request($base . '/contents');
        $readmeResponse = GithubClient::request($base . '/readme');
        $rootFiles = [];
        if (!isset($contents['_error'])) {
            foreach (array_slice($contents, 0, 100) as $item) {
                if (!is_array($item) || empty($item['name'])) {
                    continue;
                }
                $rootFiles[] = [
                    'name' => (string) $item['name'],
                    'type' => (string) ($item['type'] ?? 'unknown'),
                    'path' => (string) ($item['path'] ?? $item['name']),
                ];
            }
        }

        $readme = null;
        if (!isset($readmeResponse['_error'])) {
            $encoded = str_replace(["\r", "\n"], '', (string) ($readmeResponse['content'] ?? ''));
            $decoded = $encoded !== '' ? base64_decode($encoded, true) : false;
            if (is_string($decoded) && $decoded !== '') {
                $readme = mb_substr($decoded, 0, 16000);
            }
        }

        return [
            'repository' => [
                'full_name' => (string) ($metadata['full_name'] ?? "$owner/$repository"),
                'description' => $metadata['description'] ?? null,
                'homepage' => $metadata['homepage'] ?? null,
                'language' => $metadata['language'] ?? null,
                'topics' => is_array($metadata['topics'] ?? null) ? $metadata['topics'] : [],
                'stars' => (int) ($metadata['stargazers_count'] ?? 0),
                'forks' => (int) ($metadata['forks_count'] ?? 0),
                'open_issues' => (int) ($metadata['open_issues_count'] ?? 0),
                'default_branch' => (string) ($metadata['default_branch'] ?? ''),
                'updated_at' => $metadata['updated_at'] ?? null,
                'license' => $metadata['license']['spdx_id'] ?? null,
                'archived' => (bool) ($metadata['archived'] ?? false),
            ],
            'root_files' => $rootFiles,
            'readme' => $readme,
            'note' => $readme === null ? 'No readable README was returned for this public repository.' : null,
        ];
    }

    // ---------------------------------------------------------- evaluations

    private static function listEvaluationsToolDeclaration(): array
    {
        return [
            'name' => 'list_evaluations',
            'description' => 'List the tool evaluations you are tracking, optionally filtered by pipeline stage.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'status' => [
                        'type' => 'STRING',
                        'description' => 'Optional: one of discovered, evaluating, tested, compared, recommended, '
                            . 'wendy_review, pending_approval, approved, rejected, archived.',
                    ],
                ],
                'required' => [],
            ],
        ];
    }

    /** @return array{evaluations: array<int,array<string,mixed>>} */
    private static function listEvaluations(\PDO $pdo, ?string $status): array
    {
        if ($status) {
            $stmt = $pdo->prepare('SELECT * FROM allie_evaluations WHERE status = ? ORDER BY updated_at DESC LIMIT 50');
            $stmt->execute([$status]);
        } else {
            $stmt = $pdo->query('SELECT * FROM allie_evaluations ORDER BY updated_at DESC LIMIT 50');
        }
        return ['evaluations' => $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: []];
    }

    private static function saveEvaluationToolDeclaration(): array
    {
        return [
            'name' => 'save_evaluation',
            'description' => 'Create or update a tool evaluation record — this is what actually tracks the '
                . 'pipeline (discovered -> evaluating -> tested -> compared -> recommended). Omit evaluation_id '
                . 'to start tracking a new tool; pass it back on every later call about the same tool so it '
                . 'updates that one record instead of creating a duplicate. Set stage to wherever the work '
                . 'genuinely is right now — never jump straight to "recommended" without the earlier fields '
                . 'actually being filled in first.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'evaluation_id' => ['type' => 'INTEGER', 'description' => 'Existing evaluation ID to update. Omit to create a new one.'],
                    'tool_name' => ['type' => 'STRING', 'description' => 'The tool, product, or framework being evaluated.'],
                    'vendor_url' => ['type' => 'STRING', 'description' => 'Its real homepage or repository URL.'],
                    'category' => ['type' => 'STRING', 'description' => 'Free-text category, e.g. "coding agent", "voice model", "observability".'],
                    'stage' => ['type' => 'STRING', 'description' => 'One of: discovered, evaluating, tested, compared, recommended.'],
                    'discovery_note' => ['type' => 'STRING', 'description' => 'Why this surfaced now — cite the search_web source and date that led you here.'],
                    'evaluation_findings' => ['type' => 'STRING', 'description' => 'The 3P + economic-value read: impact on people/process/product, and what value it would actually create.'],
                    'test_notes' => ['type' => 'STRING', 'description' => 'What was actually tried and what happened — never fill this in without a real trial having happened.'],
                    'comparison_findings' => ['type' => 'STRING', 'description' => 'How it stacks up against what Caleb already runs, grounded in get_site_info/search_content.'],
                    'recommendation' => ['type' => 'STRING', 'description' => 'One of: adopt, pilot, reject.'],
                    'recommendation_rationale' => ['type' => 'STRING', 'description' => 'Why — tie it back to the 3P/economic-value rubric.'],
                    'pilot_metric' => ['type' => 'STRING', 'description' => 'For adopt/pilot only: the single metric that would prove this out.'],
                    'pilot_owner' => ['type' => 'STRING', 'description' => 'For adopt/pilot only: who actually owns running the pilot.'],
                    'pilot_stop_loss' => ['type' => 'STRING', 'description' => 'For adopt/pilot only: the condition that ends the pilot early.'],
                ],
                'required' => ['tool_name', 'stage'],
            ],
        ];
    }

    /** @return array{saved:true,id:int}|array{error:string} */
    private static function saveEvaluation(\PDO $pdo, array $args): array
    {
        $toolName = trim((string) ($args['tool_name'] ?? ''));
        $stage = trim((string) ($args['stage'] ?? ''));
        if ($toolName === '' || !in_array($stage, self::STAGES, true)) {
            return ['error' => 'tool_name and a valid stage (discovered/evaluating/tested/compared/recommended) are required.'];
        }

        $recommendation = $args['recommendation'] ?? null;
        if (!in_array($recommendation, ['adopt', 'pilot', 'reject'], true)) {
            $recommendation = null;
        }

        $fields = [
            'tool_name' => $toolName,
            'vendor_url' => isset($args['vendor_url']) ? trim((string) $args['vendor_url']) : null,
            'category' => isset($args['category']) ? trim((string) $args['category']) : null,
            'discovery_note' => isset($args['discovery_note']) ? trim((string) $args['discovery_note']) : null,
            'evaluation_findings' => isset($args['evaluation_findings']) ? trim((string) $args['evaluation_findings']) : null,
            'test_notes' => isset($args['test_notes']) ? trim((string) $args['test_notes']) : null,
            'comparison_findings' => isset($args['comparison_findings']) ? trim((string) $args['comparison_findings']) : null,
            'recommendation' => $recommendation,
            'recommendation_rationale' => isset($args['recommendation_rationale']) ? trim((string) $args['recommendation_rationale']) : null,
            'pilot_metric' => isset($args['pilot_metric']) ? trim((string) $args['pilot_metric']) : null,
            'pilot_owner' => isset($args['pilot_owner']) ? trim((string) $args['pilot_owner']) : null,
            'pilot_stop_loss' => isset($args['pilot_stop_loss']) ? trim((string) $args['pilot_stop_loss']) : null,
            'status' => $stage,
        ];

        $id = (int) ($args['evaluation_id'] ?? 0);
        if ($id > 0) {
            $exists = $pdo->prepare('SELECT id FROM allie_evaluations WHERE id = ?');
            $exists->execute([$id]);
            if (!$exists->fetchColumn()) {
                return ['error' => 'No evaluation with that ID.'];
            }
            $sets = [];
            $values = [];
            foreach ($fields as $column => $value) {
                if ($value === null) {
                    continue;
                }
                $sets[] = "$column = ?";
                $values[] = $value;
            }
            $sets[] = "updated_at = datetime('now')";
            $values[] = $id;
            $pdo->prepare('UPDATE allie_evaluations SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($values);
            return ['saved' => true, 'id' => $id];
        }

        $columns = array_keys($fields);
        $placeholders = implode(', ', array_fill(0, count($columns), '?'));
        $pdo->prepare('INSERT INTO allie_evaluations (' . implode(', ', $columns) . ') VALUES (' . $placeholders . ')')
            ->execute(array_values($fields));
        return ['saved' => true, 'id' => (int) $pdo->lastInsertId()];
    }

    private static function flagForWendyReviewToolDeclaration(): array
    {
        return [
            'name' => 'flag_for_wendy_review',
            'description' => 'Send a recommended evaluation to Wendy for a team-impact review — the required '
                . 'step before Caleb makes the final adopt/reject call. Only call this once stage is already '
                . 'recommended and recommendation/recommendation_rationale are actually filled in.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'evaluation_id' => ['type' => 'INTEGER', 'description' => 'The evaluation ID to flag.'],
                ],
                'required' => ['evaluation_id'],
            ],
        ];
    }

    /** @return array{flagged:true}|array{error:string} */
    private static function flagForWendyReview(\PDO $pdo, int $id): array
    {
        if ($id <= 0) {
            return ['error' => 'A valid evaluation_id is required.'];
        }
        $stmt = $pdo->prepare(
            "UPDATE allie_evaluations SET status = 'wendy_review', updated_at = datetime('now') "
            . "WHERE id = ? AND status = 'recommended' AND recommendation IS NOT NULL"
        );
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            return ['error' => 'No recommended evaluation with a recommendation set at that ID.'];
        }
        self::notifyFinding($pdo, $id);
        return ['flagged' => true];
    }

    // ------------------------------------------------------------ admin API

    /** GET /api/v1/admin/allie-evaluations?status=pending_approval */
    public static function evaluationsIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $status = trim((string) ($_GET['status'] ?? '')) ?: null;

        if ($status !== null) {
            $stmt = $pdo->prepare('SELECT * FROM allie_evaluations WHERE status = ? ORDER BY updated_at DESC');
            $stmt->execute([$status]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        } else {
            $rows = $pdo->query('SELECT * FROM allie_evaluations ORDER BY updated_at DESC LIMIT 100')->fetchAll(\PDO::FETCH_ASSOC);
        }

        Response::json(['evaluations' => $rows]);
    }

    /** POST /api/v1/admin/allie-evaluations/{id}/approve — Caleb's final sign-off, outside chat. */
    public static function approveEvaluation(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) $params['id'];
        $stmt = Database::get()->prepare(
            "UPDATE allie_evaluations SET status = 'approved', decided_by = ?, decided_at = datetime('now'), "
            . "updated_at = datetime('now') WHERE id = ? AND status = 'pending_approval'"
        );
        $stmt->execute([(string) ($user['email'] ?? 'Prince Caleb'), $id]);
        if ($stmt->rowCount() === 0) {
            Response::error('No pending-approval evaluation with that ID.', 404);
        }
        ActivityLog::log($user, 'approved', 'allie_evaluation', $id);
        Response::json(['status' => 'approved']);
    }

    /** POST /api/v1/admin/allie-evaluations/{id}/reject — Caleb's final sign-off, outside chat. */
    public static function rejectEvaluation(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) $params['id'];
        $stmt = Database::get()->prepare(
            "UPDATE allie_evaluations SET status = 'rejected', decided_by = ?, decided_at = datetime('now'), "
            . "updated_at = datetime('now') WHERE id = ? AND status = 'pending_approval'"
        );
        $stmt->execute([(string) ($user['email'] ?? 'Prince Caleb'), $id]);
        if ($stmt->rowCount() === 0) {
            Response::error('No pending-approval evaluation with that ID.', 404);
        }
        ActivityLog::log($user, 'rejected', 'allie_evaluation', $id);
        Response::json(['status' => 'rejected']);
    }
}
