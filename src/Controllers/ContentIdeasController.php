<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiText;
use App\Support\Database;
use App\Support\Response;
use App\Support\SharedAgentTools;

/**
 * 30-day LinkedIn/YouTube content-idea planning list (Admin -> Content
 * Ideas). One AI call, grounded in real business context
 * (SharedAgentTools::getSiteInfo() — actual services/bio, never invented).
 *
 * LinkedIn ideas are NEVER invented: every LinkedIn idea must be tied to a
 * real cached post from Radar's tracked LinkedIn pages
 * (radar_tracked_page_findings, kept fresh by
 * database/run_radar_tracked_pages.php), one idea per distinct real post,
 * exactly that many — no more, no padding, no plain LinkedIn brainstorms.
 * If zero real posts are cached, zero LinkedIn ideas are produced for that
 * batch. YouTube has no equivalent real data source anywhere in this app,
 * so YouTube ideas are always plain AI brainstorms grounded only in service
 * positioning and fill whatever days LinkedIn doesn't use — the prompt is
 * explicit that they must never be phrased as "trending" or cite invented
 * metrics, the same anti-fabrication discipline Beacon/Dossier/Marketing
 * Leads already follow elsewhere in this codebase.
 *
 * Deliberately just a planning list (title + description per day), not full
 * post copy or a video script. "Generate" replaces the full 30-row set each
 * time (delete-all + insert-30); this is a list you refresh, not an archive.
 * LinkedIn ideas are the sole source SocialDraftController::generateDraft()
 * draws from (oldest day_number, status 'idea', first) — both the manual
 * "Turn into draft" button here and the daily cron/"Generate now" button on
 * the Social Drafts page mark an idea 'used' once a draft is actually
 * created from it. YouTube ideas have no such link yet — turning one into a
 * planned video stays a manual next step (that would be Reel's job, not
 * built yet).
 */
class ContentIdeasController
{
    private const PLATFORMS = ['linkedin', 'youtube'];
    private const STATUSES = ['idea', 'used', 'dismissed'];
    private const MAX_TRACKED_PAGES_IN_PROMPT = 3;
    private const MAX_POSTS_PER_PAGE_IN_PROMPT = 3;

    /** GET /api/v1/admin/content-ideas — the current 30-day list, ordered by day. */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            'SELECT id, day_number, platform, title, description, grounded, status, generated_at
             FROM content_ideas ORDER BY day_number ASC, id ASC'
        )->fetchAll();
        Response::json(['ideas' => $rows]);
    }

    /**
     * POST /api/v1/admin/content-ideas/generate — one AI call produces a
     * fresh 30-day batch, replacing whatever list existed before.
     */
    public static function generate(): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $built = self::buildPrompt($pdo);
        $text = AiText::generate($built['text'], self::systemInstruction(), 45);
        if ($text === null) {
            Response::error('Could not generate content ideas — check that an AI provider is configured and reachable.', 502);
        }

        $ideas = self::parseIdeas((string) $text, $built['realPostCount']);
        if ($ideas === null) {
            Response::error('The AI response could not be parsed into a 30-day plan. Try generating again.', 502);
        }

        $pdo->beginTransaction();
        $pdo->exec('DELETE FROM content_ideas');
        $insert = $pdo->prepare(
            'INSERT INTO content_ideas (day_number, platform, title, description, grounded) VALUES (?, ?, ?, ?, ?)'
        );
        foreach ($ideas as $idea) {
            $insert->execute([
                $idea['day'], $idea['platform'], $idea['title'], $idea['description'], $idea['grounded'] ? 1 : 0,
            ]);
        }
        $pdo->commit();

        ActivityLog::log($user, 'generated', 'content_ideas', null, '30-day content plan');

        self::index();
    }

    /** PATCH /api/v1/admin/content-ideas/{id} — body: {status: 'idea'|'used'|'dismissed'} */
    public static function updateStatus(array $params): void
    {
        AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $status = (string) ($data['status'] ?? '');
        if (!in_array($status, self::STATUSES, true)) {
            Response::error('Invalid status.', 422);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('UPDATE content_ideas SET status = ? WHERE id = ?');
        $stmt->execute([$status, $id]);
        if ($stmt->rowCount() === 0) {
            Response::error('Idea not found.', 404);
        }
        Response::json(['status' => 'updated']);
    }

    /**
     * POST /api/v1/admin/content-ideas/{id}/draft — the one deliberate link
     * to Social Drafts: turns a LinkedIn idea into a real AI-drafted post via
     * SocialDraftController::generateFromIdea(), then marks the idea used.
     * YouTube ideas are rejected here — a text post isn't the right output
     * for a video idea; that's Reel's job (video planning), not built yet.
     */
    public static function createDraft(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM content_ideas WHERE id = ?');
        $stmt->execute([$id]);
        $idea = $stmt->fetch();
        if (!$idea) {
            Response::error('Idea not found.', 404);
        }
        if ($idea['platform'] !== 'linkedin') {
            Response::error('Only LinkedIn ideas can be turned into a Social Draft — YouTube ideas need video planning, not a text post.', 422);
        }

        $draft = SocialDraftController::generateFromIdea($idea);
        if ($draft === null) {
            Response::error('Could not generate a draft — check that an AI provider is configured and reachable.', 502);
        }

        $pdo->prepare("UPDATE content_ideas SET status = 'used' WHERE id = ?")->execute([$id]);
        ActivityLog::log($user, 'generated', 'social_draft', $draft['id'], 'from content idea: ' . mb_substr((string) $idea['title'], 0, 100));

        Response::json(['draft_id' => $draft['id']], 201);
    }

    private static function systemInstruction(): string
    {
        return "You are a content strategist producing a 30-day content-idea calendar for a solo developer's "
            . "business (AI voice agents, chatbots, workflow automation, custom web/mobile development), split "
            . "across LinkedIn and YouTube. The audience is business owners and decision-makers who want to grow "
            . "their business — not other developers.\n\n"
            . "STRICT RULE ON LINKEDIN IDEAS: every single LinkedIn idea you produce must be grounded: true and "
            . "directly tied to one specific real post supplied below — never invent a LinkedIn idea from "
            . "imagination, never brainstorm a LinkedIn idea the way you would for YouTube. The real data below "
            . "states the exact number of distinct real posts available; that number is a hard, exact requirement "
            . "(not a maximum) for how many LinkedIn ideas to produce — one idea per distinct real post, no more, "
            . "no fewer, and never two ideas that are just reworded versions of the same post's theme. If that "
            . "number is zero, produce zero LinkedIn ideas — fill all 30 days with YouTube instead. Follow each "
            . "grounded post's own real angle: if the post is about a marketing or business problem that has "
            . "nothing to do with AI/automation/web tech (e.g. lead follow-up, onboarding, pricing, retention, "
            . "content strategy), let the idea mirror that real problem in its own terms — do not force-fit an "
            . "AI/automation/web-tech spin onto it just to stay on-brand. Only frame a grounded idea around "
            . "AI/automation/web outcomes if the source post itself is actually about that.\n\n"
            . "YOUTUBE IDEAS: since there is no real-post data source for YouTube, every YouTube idea is a plain "
            . "brainstorm (always grounded: false) framed around business outcomes (more leads, more sales, saved "
            . "time, lower costs, better customer experience, retention, growth) that AI/automation/web technology "
            . "can unlock — never coding tutorials, dev tools, programming tips, or any angle aimed at a developer "
            . "audience. Never claim something is 'trending' or cite an engagement number you don't actually "
            . "have. YouTube ideas fill every day that isn't used by a grounded LinkedIn idea.\n\n"
            . "Titles must sell the 'why it matters' — the business risk, opportunity, or payoff — not the 'how "
            . "it's built'. Avoid instructional/tutorial phrasing like 'How to Structure...', 'How to Build...', "
            . "or 'X Steps to...', which reads as a skill for the reader to learn themselves; prefer framing that "
            . "makes the business stakes obvious at a glance (e.g. 'Why Your AI Chatbot Should Never Improvise "
            . "With Customers' instead of 'How to Structure AI Prompts to Guardrail Customer Conversations'). "
            . "Ground every idea in the real business context provided — never invent services, results, client "
            . "names, or statistics. An idea is a short title/hook plus a one-sentence description of the angle "
            . "— not a full script or post copy.\n\n"
            . "Return ONLY a raw JSON array of exactly 30 objects, no markdown fences, no commentary, in this "
            . "exact shape: [{\"day\": 1, \"platform\": \"linkedin\", \"title\": \"...\", \"description\": \"...\", "
            . "\"grounded\": false}, ...]. day must run 1 through 30 with no gaps or repeats. platform must be "
            . "exactly \"linkedin\" or \"youtube\", with the LinkedIn count matching the real-post count exactly "
            . "as instructed above and YouTube filling the rest.";
    }

    /** @return array{text: string, realPostCount: int} */
    private static function buildPrompt(\PDO $pdo): array
    {
        $siteInfo = SharedAgentTools::getSiteInfo();
        $lines = ["Real business context (do not invent anything beyond this):"];
        $lines[] = json_encode($siteInfo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $tracked = $pdo->query(
            'SELECT page_url, findings_json FROM radar_tracked_page_findings ORDER BY fetched_at DESC LIMIT '
            . self::MAX_TRACKED_PAGES_IN_PROMPT
        )->fetchAll();
        $totalRealPosts = 0;
        if ($tracked) {
            $pageLines = [];
            foreach ($tracked as $page) {
                $posts = json_decode((string) $page['findings_json'], true) ?: [];
                $posts = array_slice($posts, 0, self::MAX_POSTS_PER_PAGE_IN_PROMPT);
                $totalRealPosts += count($posts);
                $pageLines[] = "Page: {$page['page_url']}\n" . json_encode($posts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            if ($totalRealPosts > 0) {
                $lines[] = "\nReal recent posts from tracked LinkedIn pages — {$totalRealPosts} distinct real "
                    . "post(s) total. You MUST produce EXACTLY {$totalRealPosts} LinkedIn idea(s) across the whole "
                    . "30-day plan, one per distinct post below, each grounded: true. Do not produce any other "
                    . "LinkedIn ideas. Fill the remaining " . (30 - $totalRealPosts) . " day(s) entirely with "
                    . "YouTube ideas (grounded: false):";
                $lines = array_merge($lines, $pageLines);
            }
        }
        if ($totalRealPosts === 0) {
            $lines[] = "\nNo real cached LinkedIn posts are available — produce ZERO LinkedIn ideas. All 30 days "
                . "must be platform: youtube (grounded: false).";
        }

        return ['text' => implode("\n", $lines), 'realPostCount' => $totalRealPosts];
    }

    /**
     * $expectedLinkedinCount is the real distinct post count computed in
     * buildPrompt() — enforced here in code, not just requested in the
     * prompt, so a model slip can't sneak an invented LinkedIn idea past us.
     *
     * @return array<int,array{day:int,platform:string,title:string,description:string,grounded:bool}>|null
     */
    private static function parseIdeas(string $reply, int $expectedLinkedinCount): ?array
    {
        $stripped = trim((string) preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $reply));
        $parsed = json_decode($stripped, true);
        if (!is_array($parsed) || count($parsed) !== 30) {
            error_log('ContentIdeasController: could not parse a 30-item JSON array from model output: '
                . substr($stripped, 0, 800));
            return null;
        }

        $ideas = [];
        $seenDays = [];
        $linkedinCount = 0;
        foreach ($parsed as $item) {
            if (!is_array($item)) {
                return null;
            }
            $day = (int) ($item['day'] ?? 0);
            $platform = (string) ($item['platform'] ?? '');
            $title = trim((string) ($item['title'] ?? ''));
            $description = trim((string) ($item['description'] ?? ''));
            $grounded = $platform === 'linkedin' && !empty($item['grounded']);
            if ($day < 1 || $day > 30 || isset($seenDays[$day])
                || !in_array($platform, self::PLATFORMS, true)
                || $title === '' || $description === ''
                || ($platform === 'linkedin' && !$grounded)
            ) {
                error_log('ContentIdeasController: rejected malformed or ungrounded idea item: ' . json_encode($item));
                return null;
            }
            if ($platform === 'linkedin') {
                $linkedinCount++;
            }
            $seenDays[$day] = true;
            $ideas[] = [
                'day' => $day,
                'platform' => $platform,
                'title' => mb_substr($title, 0, 200),
                'description' => mb_substr($description, 0, 1000),
                'grounded' => $grounded,
            ];
        }

        if ($linkedinCount !== $expectedLinkedinCount) {
            error_log("ContentIdeasController: expected exactly {$expectedLinkedinCount} grounded LinkedIn "
                . "idea(s), model produced {$linkedinCount} — rejecting batch.");
            return null;
        }

        usort($ideas, static fn(array $a, array $b): int => $a['day'] <=> $b['day']);
        return $ideas;
    }
}
