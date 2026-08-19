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
 * batch. Each grounded idea's source_posted_at is the real post's own
 * publish date — looked up from an index the model references
 * (source_post_index), never transcribed by the model itself, so it can't
 * be hallucinated. YouTube has no equivalent real data source anywhere in this app,
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
    /** Hard structural ceiling: the plan itself is only 30 days, so more real
     *  posts than that can't each get their own day regardless of how many
     *  are cached. Not a content filter — the actual per-page volume is
     *  governed entirely by Radar's "Posts per page" setting. */
    private const MAX_DAYS = 30;

    /** GET /api/v1/admin/content-ideas — the current 30-day list, ordered by day. */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            'SELECT id, day_number, platform, title, description, grounded, source_posted_at, status, generated_at
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

        // With only DeepSeek and Gemini funded, a 45s budget gives each leg
        // just ~22s — enough to time out a merely-slow DeepSeek response
        // rather than let it complete. 100s gives ~45s/leg instead. Needs the
        // set_time_limit bump too, or the host's default max_execution_time
        // (often 30s on shared hosting) kills the request before that.
        set_time_limit(110);

        $built = self::buildPrompt($pdo);
        $text = AiText::generate($built['text'], self::systemInstruction(), 100);
        if ($text === null) {
            Response::error('Could not generate content ideas — ' . (AiText::lastError() ?? 'no AI provider answered.'), 502);
        }

        $ideas = self::parseIdeas((string) $text, $built['postsByIndex']);
        if ($ideas === null) {
            Response::error('The AI response could not be parsed into a 30-day plan. Try generating again.', 502);
        }

        $pdo->beginTransaction();
        $pdo->exec('DELETE FROM content_ideas');
        $insert = $pdo->prepare(
            'INSERT INTO content_ideas (day_number, platform, title, description, grounded, source_posted_at)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        foreach ($ideas as $idea) {
            $insert->execute([
                $idea['day'], $idea['platform'], $idea['title'], $idea['description'], $idea['grounded'] ? 1 : 0,
                $idea['source_posted_at'],
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
            Response::error('Could not generate a draft — ' . (AiText::lastError() ?? 'no AI provider answered.'), 502);
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
            . "imagination, never brainstorm a LinkedIn idea the way you would for YouTube. Each real post below is "
            . "numbered with an \"index\". For every grounded LinkedIn idea, include that exact number as "
            . "\"source_post_index\" in your JSON output — this is how the real post's original publish date gets "
            . "attached afterward, so it must be accurate, never guessed. The number of real posts provided is a "
            . "hard, exact requirement (not a maximum) for how many LinkedIn ideas to produce — one idea per "
            . "distinct real post (each index used exactly once, no repeats, no skips), and never two ideas that "
            . "are just reworded versions of the same post's theme. If zero real posts are provided, produce zero "
            . "LinkedIn ideas — fill all 30 days with YouTube instead. Follow each grounded post's own real angle: "
            . "if the post is about a marketing or business problem that has nothing to do with AI/automation/web "
            . "tech (e.g. lead follow-up, onboarding, pricing, retention, content strategy), let the idea mirror "
            . "that real problem in its own terms — do not force-fit an AI/automation/web-tech spin onto it just "
            . "to stay on-brand. Only frame a grounded idea around AI/automation/web outcomes if the source post "
            . "itself is actually about that.\n\n"
            . "YOUTUBE IDEAS: since there is no real-post data source for YouTube, every YouTube idea is a plain "
            . "brainstorm (always grounded: false), and it must be a MARKETING idea, not a general 'AI can help "
            . "your business' pitch. The topic itself has to be something a marketer or business owner actually "
            . "thinks about — audience growth, lead generation, brand positioning, content strategy, customer "
            . "acquisition, messaging, retention, ad performance, sales-and-marketing alignment — the same kind of "
            . "territory the grounded LinkedIn posts live in. It's fine to mention AI/automation/web technology as "
            . "part of how the idea gets solved, but never make an unrelated operational business function (supply "
            . "chain, HR, finance, security, logistics) the actual topic just to bolt 'AI' onto the title — that "
            . "reads as a generic AI-listicle, not a marketing idea. And never a coding tutorial, dev tool, "
            . "programming tip, or any angle aimed at a developer audience. Never claim something is 'trending' or "
            . "cite an engagement number you don't actually have. YouTube ideas fill every day that isn't used by "
            . "a grounded LinkedIn idea.\n\n"
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
            . "\"grounded\": false, \"source_post_index\": null}, ...]. day must run 1 through 30 with no gaps or "
            . "repeats. platform must be exactly \"linkedin\" or \"youtube\", with the LinkedIn count matching the "
            . "real-post count exactly as instructed above and YouTube filling the rest. source_post_index is "
            . "required (the real post's number) on every grounded LinkedIn idea, and must be null for every "
            . "YouTube idea.";
    }

    /**
     * @return array{text: string, postsByIndex: array<int,array{page_url:string,posted_at:?string}>}
     */
    private static function buildPrompt(\PDO $pdo): array
    {
        $siteInfo = SharedAgentTools::getSiteInfo();
        $lines = ["Real business context (do not invent anything beyond this):"];
        $lines[] = json_encode($siteInfo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        // No page-count or per-page-post cap here — every tracked page and
        // every post Radar actually cached for it is used. The only volume
        // control is Radar's own "Posts per page" setting
        // (radar_tracked_pages_posts_per_profile), which governs what gets
        // INTO the cache in the first place (database/run_radar_tracked_pages.php).
        $tracked = $pdo->query(
            'SELECT page_url, findings_json FROM radar_tracked_page_findings ORDER BY fetched_at DESC'
        )->fetchAll();

        // Every real post gets a stable index across all pages — the model
        // references posts by this number (source_post_index) rather than
        // transcribing the date itself, so the date attached to a grounded
        // idea afterward is always exactly what we extracted, never
        // hallucinated or reformatted by the model.
        $postsByIndex = [];
        if ($tracked) {
            $pageLines = [];
            $remainingDays = self::MAX_DAYS;
            foreach ($tracked as $page) {
                if ($remainingDays <= 0) {
                    break;
                }
                $rawPosts = json_decode((string) $page['findings_json'], true) ?: [];
                // Apify's raw item is mostly metadata bloat (author object,
                // media, reaction breakdowns) that isn't needed for grounding
                // and was blowing prompt size past provider limits once the
                // post-count cap was removed (a single tracked page's 10
                // cached posts pushed one request to 12.5k tokens against
                // Groq's 12k/min ceiling, and timed out Gemini outright). Only
                // the actual post text goes in the prompt — the count of
                // posts is still whatever Radar cached, untouched.
                $pagePosts = [];
                foreach ($rawPosts as $rawPost) {
                    if ($remainingDays <= 0) {
                        break;
                    }
                    if (!is_array($rawPost)) {
                        continue;
                    }
                    $text = self::deepFindString($rawPost, ['text', 'commentary', 'description', 'content', 'posttext', 'body'], 500);
                    if ($text === null) {
                        continue;
                    }
                    $postedAt = self::deepFindString($rawPost, ['postedatiso', 'postedat', 'publishedat', 'postdate', 'timestamp', 'createdat', 'date'], 40);
                    $index = count($postsByIndex) + 1;
                    $postsByIndex[$index] = ['page_url' => (string) $page['page_url'], 'posted_at' => $postedAt];
                    $pagePosts[] = ['index' => $index, 'text' => $text];
                    $remainingDays--;
                }
                if ($pagePosts) {
                    $pageLines[] = "Page: {$page['page_url']}\n" . json_encode($pagePosts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                }
            }
            $totalRealPosts = count($postsByIndex);
            if ($totalRealPosts > 0) {
                $lines[] = "\nReal recent posts from tracked LinkedIn pages — {$totalRealPosts} distinct real "
                    . "post(s) total, each numbered with an \"index\". You MUST produce EXACTLY {$totalRealPosts} "
                    . "LinkedIn idea(s) across the whole " . self::MAX_DAYS . "-day plan, one per distinct post "
                    . "below, each grounded: true with that post's index as source_post_index. Do not produce any "
                    . "other LinkedIn ideas. Fill the remaining " . (self::MAX_DAYS - $totalRealPosts)
                    . " day(s) entirely with YouTube ideas (grounded: false):";
                $lines = array_merge($lines, $pageLines);
            }
        }
        if (!$postsByIndex) {
            $lines[] = "\nNo real cached LinkedIn posts are available — produce ZERO LinkedIn ideas. All "
                . self::MAX_DAYS . " days must be platform: youtube (grounded: false).";
        }

        return ['text' => implode("\n", $lines), 'postsByIndex' => $postsByIndex];
    }

    /**
     * Flexible key-hint search over one raw Apify dataset item, since
     * different "LinkedIn profile posts" actors on Apify don't agree on
     * field names — same pattern run_beacon_apify_discovery.php already uses
     * for this same actor's output. Used both for a post's text content and,
     * separately, its publish date/timestamp.
     */
    private static function deepFindString(array $node, array $hints, int $maxLength, int $maxDepth = 3): ?string
    {
        foreach ($node as $key => $value) {
            if (is_string($key) && is_string($value) && trim($value) !== '') {
                $keyLower = strtolower($key);
                foreach ($hints as $hint) {
                    if (str_contains($keyLower, $hint)) {
                        return mb_substr(trim($value), 0, $maxLength);
                    }
                }
            }
        }
        if ($maxDepth > 0) {
            foreach ($node as $value) {
                if (is_array($value)) {
                    $found = self::deepFindString($value, $hints, $maxLength, $maxDepth - 1);
                    if ($found !== null) {
                        return $found;
                    }
                }
            }
        }
        return null;
    }

    /**
     * $postsByIndex is the real-post map built in buildPrompt() — enforced
     * here in code, not just requested in the prompt, so a model slip can't
     * sneak an invented LinkedIn idea (or a reused/skipped post index) past
     * us. The published date attached to each grounded idea is always looked
     * up from this map, never taken from the model's own output — it cannot
     * be hallucinated or reformatted that way.
     *
     * @param array<int,array{page_url:string,posted_at:?string}> $postsByIndex
     * @return array<int,array{day:int,platform:string,title:string,description:string,grounded:bool,source_posted_at:?string}>|null
     */
    private static function parseIdeas(string $reply, array $postsByIndex): ?array
    {
        $stripped = trim((string) preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $reply));
        $parsed = json_decode($stripped, true);
        if (!is_array($parsed) || count($parsed) !== self::MAX_DAYS) {
            error_log('ContentIdeasController: could not parse a ' . self::MAX_DAYS . '-item JSON array from '
                . 'model output: ' . substr($stripped, 0, 800));
            return null;
        }

        $ideas = [];
        $seenDays = [];
        $usedPostIndices = [];
        foreach ($parsed as $item) {
            if (!is_array($item)) {
                return null;
            }
            $day = (int) ($item['day'] ?? 0);
            $platform = (string) ($item['platform'] ?? '');
            $title = trim((string) ($item['title'] ?? ''));
            $description = trim((string) ($item['description'] ?? ''));
            $grounded = $platform === 'linkedin' && !empty($item['grounded']);
            if ($day < 1 || $day > self::MAX_DAYS || isset($seenDays[$day])
                || !in_array($platform, self::PLATFORMS, true)
                || $title === '' || $description === ''
                || ($platform === 'linkedin' && !$grounded)
            ) {
                error_log('ContentIdeasController: rejected malformed or ungrounded idea item: ' . json_encode($item));
                return null;
            }

            $sourcePostedAt = null;
            if ($platform === 'linkedin') {
                $sourceIndex = (int) ($item['source_post_index'] ?? 0);
                if (!isset($postsByIndex[$sourceIndex]) || isset($usedPostIndices[$sourceIndex])) {
                    error_log('ContentIdeasController: rejected LinkedIn idea with invalid/reused '
                        . 'source_post_index: ' . json_encode($item));
                    return null;
                }
                $usedPostIndices[$sourceIndex] = true;
                $sourcePostedAt = $postsByIndex[$sourceIndex]['posted_at'];
            }

            $seenDays[$day] = true;
            $ideas[] = [
                'day' => $day,
                'platform' => $platform,
                'title' => mb_substr($title, 0, 200),
                'description' => mb_substr($description, 0, 1000),
                'grounded' => $grounded,
                'source_posted_at' => $sourcePostedAt,
            ];
        }

        if (count($usedPostIndices) !== count($postsByIndex)) {
            error_log('ContentIdeasController: expected every one of the ' . count($postsByIndex) . ' real post(s) '
                . 'to be used exactly once, model used ' . count($usedPostIndices) . ' — rejecting batch.');
            return null;
        }

        usort($ideas, static fn(array $a, array $b): int => $a['day'] <=> $b['day']);
        return $ideas;
    }
}
