<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiText;
use App\Support\Database;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;
use App\Support\OwnerMessages;
use App\Support\WhatsAppNotifier;

/**
 * 30-day LinkedIn/YouTube/TikTok content-idea planning list (Admin ->
 * Content Ideas). One AI call, grounded in real business context
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
 * be hallucinated. YouTube and TikTok have no equivalent real data source
 * anywhere in this app, so their ideas are always plain AI brainstorms
 * grounded only in service positioning, splitting whatever days LinkedIn
 * doesn't use — the prompt is explicit that they must never be phrased as
 * "trending" or cite invented metrics, the same anti-fabrication discipline
 * Beacon/Dossier/Marketing Leads already follow elsewhere in this codebase.
 * Their topics are steered to four comment-driving pillars aimed at business
 * owners (tear-downs/audits, ops efficiency & automation, financial
 * realities, hot takes), each ending on a polarizing closing question.
 *
 * Deliberately just a planning list (title + description per day), not full
 * post copy or a video script. "Generate" replaces the full 30-row set each
 * time (delete-all + insert-30); this is a list you refresh, not an archive.
 * LinkedIn ideas are the sole source SocialDraftController::generateDraft()
 * draws from (oldest day_number, status 'idea', first) — both the manual
 * "Turn into draft" button here and the daily cron/"Generate now" button on
 * the Social Drafts page mark an idea 'used' once a draft is actually
 * created from it. YouTube and TikTok ideas have no such link yet — turning
 * one into a planned video stays a manual next step (that would be Reel's
 * job, not built yet).
 */
class ContentIdeasController
{
    private const PLATFORMS = ['linkedin', 'youtube', 'tiktok'];
    private const POST_TEXT_KEYS = ['text', 'commentary', 'description', 'content', 'posttext', 'body'];
    private const POST_URL_KEYS = ['posturl', 'linkedinurl', 'permalink', 'url'];
    private const STATUSES = ['idea', 'used', 'dismissed'];
    /** Hard structural ceiling: the plan itself is only 30 days, so more real
     *  posts than that can't each get their own day regardless of how many
     *  are cached. Not a content filter — the actual per-page volume is
     *  governed entirely by Radar's "Posts per page" setting. */
    private const MAX_DAYS = 30;
    /** Fewest usable ideas worth saving as a plan once malformed or
     *  ungrounded items are dropped; below this the batch is rejected. */
    private const MIN_IDEAS = 24;

    /** Why the last parseIdeas() call returned null, shown to the admin. */
    private static ?string $parseError = null;

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

        $result = self::regeneratePlan();
        if (!$result['ok']) {
            Response::error((string) $result['error'], 502);
        }

        ActivityLog::log($user, 'generated', 'content_ideas', null, '30-day content plan');

        self::index();
    }

    /**
     * Builds and saves a fresh 30-day plan, replacing the old one. Shared by the
     * admin button and the daily social draft cron, which regenerates
     * automatically once the previous plan's 30 days are over.
     *
     * @return array{ok:bool,error:?string,count:int,linkedin:int}
     */
    public static function regeneratePlan(): array
    {
        $pdo = Database::get();

        // With only DeepSeek and Gemini funded, a 45s budget gives each leg
        // just ~22s — enough to time out a merely-slow DeepSeek response
        // rather than let it complete. 100s gives ~45s/leg instead. Needs the
        // set_time_limit bump too, or the host's default max_execution_time
        // (often 30s on shared hosting) kills the request before that.
        // Raised to 150s (~50s/leg) once YouTube/TikTok ideas started carrying
        // a math cue and closing question: at 100s DeepSeek and Gemini both
        // hit their 33s leg limit mid-answer and every fallback after them
        // was left with only the 8s floor.
        set_time_limit(160);

        $built = self::buildPrompt($pdo);
        $text = AiText::generate($built['text'], self::systemInstruction(), 150);
        if ($text === null) {
            return ['ok' => false, 'error' => 'Could not generate content ideas — ' . (AiText::lastError() ?? 'no AI provider answered.'), 'count' => 0, 'linkedin' => 0];
        }

        $ideas = self::parseIdeas((string) $text, $built['postsByIndex']);
        if ($ideas === null) {
            return ['ok' => false, 'error' => 'The AI response could not be turned into a 30-day plan: ' . (self::$parseError ?? 'unknown reason') . '. Try generating again.', 'count' => 0, 'linkedin' => 0];
        }

        $pdo->beginTransaction();
        $pdo->exec('DELETE FROM content_ideas');
        $insert = $pdo->prepare(
            'INSERT INTO content_ideas (day_number, platform, title, description, grounded, source_posted_at, source_post_text, source_post_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($ideas as $idea) {
            $insert->execute([
                $idea['day'], $idea['platform'], $idea['title'], $idea['description'], $idea['grounded'] ? 1 : 0,
                $idea['source_posted_at'], $idea['source_post_text'], $idea['source_post_url'],
            ]);
        }
        $pdo->commit();

        return [
            'ok' => true,
            'error' => null,
            'count' => count($ideas),
            'linkedin' => count(array_filter($ideas, static fn(array $i): bool => $i['platform'] === 'linkedin')),
        ];
    }

    /**
     * Called by the daily social draft cron. When there is no plan yet, or the
     * current one has run its 30 days (day 1 is the date it was generated),
     * generates the next one automatically and tells Caleb, so drafting carries
     * on without anyone remembering to press Generate.
     *
     * @return string|null a one-line description of what happened, or null when the plan is still running
     */
    public static function refreshPlanIfExpired(): ?string
    {
        $pdo = Database::get();
        $planStart = $pdo->query('SELECT MIN(date(generated_at)) FROM content_ideas')->fetchColumn();
        $expired = empty($planStart)
            || ((int) ((strtotime(gmdate('Y-m-d')) - strtotime((string) $planStart)) / 86400) + 1) > self::MAX_DAYS;
        if (!$expired) {
            return null;
        }

        $result = self::regeneratePlan();
        if (!$result['ok']) {
            error_log('Content plan auto-refresh failed: ' . $result['error']);
            self::notifyOwner(
                'Content plan could not refresh',
                'The 30-day content plan ended and the automatic refresh failed: ' . $result['error']
                . ' Press Generate 30-day plan in Content Ideas to try again. Drafting is paused until then.'
            );
            return 'Plan expired; automatic refresh failed: ' . $result['error'];
        }

        self::notifyOwner(
            'New 30-day content plan is ready',
            "A new 30-day content plan was generated automatically with {$result['linkedin']} LinkedIn ideas out of "
            . "{$result['count']}. Drafting starts from it today. Turn into draft and the daily draft cron both use it now."
        );
        return "Plan expired; generated a new one ({$result['linkedin']} LinkedIn ideas).";
    }

    /** WhatsApp (owner alert) plus an email backup; never throws. */
    private static function notifyOwner(string $reason, string $summary): void
    {
        try {
            $link = 'https://princecaleb.dev/admin/content-ideas';
            $body = $reason . "\n\n" . $summary . "\n\n" . $link;
            $route = OwnerMessages::route([
                'agent' => 'content', 'kind' => 'content_plan', 'tier' => 'normal',
                'subject' => $reason, 'body' => $body, 'ref' => 'content_plan',
            ]);
            if ($route['action'] !== 'send') {
                return; // held for the digest
            }
            if (WhatsAppNotifier::isOwnerConfigured()) {
                WhatsAppNotifier::sendOwnerAlert($body, [
                    'name' => 'Content ideas',
                    'reason' => $reason,
                    'summary' => $summary,
                    'message' => mb_substr($body, 0, 900),
                ]);
            }
            $to = Settings::get('notification_email') ?: Settings::get('social_email');
            if ($to) {
                Mailer::send($to, $reason, $body);
            }
        } catch (\Throwable $e) {
            error_log('Content plan notification failed: ' . $e->getMessage());
        }
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
     * YouTube and TikTok ideas are rejected here — a text post isn't the
     * right output for a video idea; that's Reel's job (video planning), not
     * built yet.
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
            Response::error('Only LinkedIn ideas can be turned into a Social Draft — YouTube and TikTok ideas need video planning, not a text post.', 422);
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
            . "across LinkedIn, YouTube, and TikTok. The audience is business owners and decision-makers who want "
            . "to grow their business — not other developers.\n\n"
            . "STRICT RULE ON LINKEDIN IDEAS: every single LinkedIn idea you produce must be grounded: true and "
            . "directly tied to one specific real post supplied below — never invent a LinkedIn idea from "
            . "imagination, never brainstorm a LinkedIn idea the way you would for YouTube or TikTok. Each real post "
            . "below is numbered with an \"index\". For every grounded LinkedIn idea, include that exact number as "
            . "\"source_post_index\" in your JSON output — this is how the real post's original publish date gets "
            . "attached afterward, so it must be accurate, never guessed. The number of real posts provided is a "
            . "hard, exact requirement (not a maximum) for how many LinkedIn ideas to produce — one idea per "
            . "distinct real post (each index used exactly once, no repeats, no skips), and never two ideas that "
            . "are just reworded versions of the same post's theme. If zero real posts are provided, produce zero "
            . "LinkedIn ideas — fill all 30 days with YouTube and TikTok instead. Follow each grounded post's own "
            . "real angle: if the post is about a marketing or business problem that has nothing to do with AI/automation/web "
            . "tech (e.g. lead follow-up, onboarding, pricing, retention, content strategy), let the idea mirror "
            . "that real problem in its own terms — do not force-fit an AI/automation/web-tech spin onto it just "
            . "to stay on-brand. Only frame a grounded idea around AI/automation/web outcomes if the source post "
            . "itself is actually about that.\n\n"
            . "YOUTUBE AND TIKTOK IDEAS: there is no real-post data source for either, so every one is a plain "
            . "brainstorm (always grounded: false). The goal of every video is to get business owners and founders "
            . "talking, sharing, and debating in the comments, so each idea must hit a real operational pain point, "
            . "a financial friction, or a high-stakes decision they face every day: content that validates their "
            . "struggle, exposes a hidden inefficiency, or hands them a tangible edge. Never a generic 'AI can help "
            . "your business' pitch, and never a coding tutorial, framework comparison, dev-tool tip, or any angle "
            . "aimed at a developer audience. Every idea must come from one of these four pillars, and the 30 days "
            . "must rotate across all four (no pillar used for more than about a third of the YouTube/TikTok days):\n"
            . "1. TEAR-DOWNS & AUDITS: a live website or funnel teardown (conversion mistakes, confusing UI, UX "
            . "friction, then how to fix it); a pricing-model autopsy (why a software, agency, or service charges "
            . "what it does and whether that structure leaves money on the table or drives customers away); invoice "
            . "and billing nightmares (broken payment setups, gateway failures, chasing late payments killing cash "
            . "flow). Describe the TYPE of business being torn down (e.g. 'a typical Accra restaurant's ordering "
            . "site'), never name a real company as the target.\n"
            . "2. OPERATIONAL EFFICIENCY & AI AUTOMATION (save hours or money): a behind-the-scenes build of a "
            . "back-office system or an AI agent workflow (lead routing, customer-support triage, invoice "
            . "reconciliation, WhatsApp follow-up); 'Stop doing this manually' (an admin bottleneck businesses burn "
            . "money on every month, and the exact tool or automation that removes it); a SaaS stack audit (CRMs, "
            . "payment processors, project-management tools ranked by real-world ROI, not marketing hype).\n"
            . "3. FINANCIAL REALITIES & BOOTSTRAPPING TRUTHS: cash flow vs. revenue (profitable on paper, broke at "
            . "month end, and how to close the gap); the real cost of building a product (time, money, and "
            . "architecture to take a custom web app, mobile app, or SaaS from idea to revenue); client red flags "
            . "(spotting bad-fit clients early, when to fire one, how to structure agreements so scope creep can't "
            . "happen).\n"
            . "4. CONTROVERSIAL OPINIONS & HOT TAKES: 'Why [popular business or marketing advice] is dead' (e.g. "
            . "cold email, needing a huge social following, big agencies beating small studios), argued from real "
            . "experience; the agency-vs-product dilemma and the traps founders fall into when a service business "
            . "tries to become a software company.\n"
            . "How to frame each one: prefer a concrete case (an actual project structure or an anonymized client "
            . "scenario) over theory. Wherever money, time saved, or revenue impact comes up, name in a few words "
            . "the math to put on screen (e.g. 'math: hours/week x hourly cost'), but never state a figure or result "
            . "as fact; the owner fills in the real numbers. Every description must END with a short, specific, "
            . "polarizing either/or question the video closes on (e.g. 'Custom internal tools or off-the-shelf SaaS: "
            . "which drains more of your budget?'), never a generic 'let me know what you think'.\n"
            . "KEEP IT COMPACT: the whole 30-day plan must come back in one fast reply, so every title stays under 12 "
            . "words and every description stays under 35 words in total (angle, optional math cue, closing "
            . "question). Never pad.\n"
            . "YouTube vs TikTok: a YouTube idea is the long-form version (a full teardown, build, or breakdown with "
            . "the math) with a searchable, curiosity-driven title. A TikTok idea is a fast, hook-first 15-45 second "
            . "vertical video whose title is the first line spoken or shown on screen (a bold claim, a costly "
            . "mistake, a before/after, a myth-bust) and whose description is the angle in quick beats, not a "
            . "script. Never claim something is 'trending', never cite a real trend, sound, or "
            . "engagement number you don't actually have. TikTok ideas and YouTube ideas together fill every day "
            . "that isn't used by a grounded LinkedIn idea; split those remaining days between the two platforms in "
            . "a roughly even mix (never dedicate every non-LinkedIn day to just one of them).\n\n"
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
            . "repeats. platform must be exactly \"linkedin\", \"youtube\", or \"tiktok\", with the LinkedIn count "
            . "matching the real-post count exactly as instructed above and YouTube/TikTok splitting the rest "
            . "roughly evenly. source_post_index is required (the real post's number) on every grounded LinkedIn "
            . "idea, and must be null for every YouTube and TikTok idea.";
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
                    $text = self::deepFindString($rawPost, self::POST_TEXT_KEYS, 500);
                    if ($text === null) {
                        continue;
                    }
                    $postedAt = self::deepFindString($rawPost, ['postedatiso', 'postedat', 'publishedat', 'postdate', 'timestamp', 'createdat', 'date'], 40);
                    $index = count($postsByIndex) + 1;
                    $postsByIndex[$index] = [
                        'page_url' => (string) $page['page_url'],
                        'posted_at' => $postedAt,
                        'text' => self::deepFindString($rawPost, self::POST_TEXT_KEYS, 1500),
                        'url' => self::deepFindString($rawPost, self::POST_URL_KEYS, 500),
                    ];
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
                    . " day(s) with a roughly even mix of YouTube and TikTok ideas (grounded: false):";
                $lines = array_merge($lines, $pageLines);
            }
        }
        if (!$postsByIndex) {
            $lines[] = "\nNo real cached LinkedIn posts are available — produce ZERO LinkedIn ideas. All "
                . self::MAX_DAYS . " days must be a roughly even mix of platform: youtube and platform: tiktok "
                . "(grounded: false).";
        }

        return ['text' => implode("\n", $lines), 'postsByIndex' => $postsByIndex];
    }

    /**
     * The real post an idea was grounded on. Ideas made after source_post_text
     * existed carry it directly; older ones only kept source_posted_at, so
     * those are matched back to the cached post with that same timestamp.
     * Null when nothing can be tied to it, and the draft is then written from
     * the idea alone.
     *
     * @param array<string,mixed> $idea a content_ideas row
     * @return array{text:string,url:?string}|null
     */
    public static function sourcePostFor(\PDO $pdo, array $idea): ?array
    {
        $text = trim((string) ($idea['source_post_text'] ?? ''));
        if ($text !== '') {
            $url = trim((string) ($idea['source_post_url'] ?? ''));
            return ['text' => $text, 'url' => $url !== '' ? $url : null];
        }

        $postedAt = trim((string) ($idea['source_posted_at'] ?? ''));
        if ($postedAt === '') {
            return null;
        }
        $rows = $pdo->query('SELECT findings_json FROM radar_tracked_page_findings')->fetchAll();
        foreach ($rows as $row) {
            foreach (json_decode((string) $row['findings_json'], true) ?: [] as $rawPost) {
                if (!is_array($rawPost)) {
                    continue;
                }
                $candidate = self::deepFindString($rawPost, ['postedatiso', 'postedat', 'publishedat', 'postdate', 'timestamp', 'createdat', 'date'], 40);
                if ($candidate !== $postedAt) {
                    continue;
                }
                $found = self::deepFindString($rawPost, self::POST_TEXT_KEYS, 1500);
                if ($found !== null) {
                    return ['text' => $found, 'url' => self::deepFindString($rawPost, self::POST_URL_KEYS, 500)];
                }
            }
        }
        return null;
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
        self::$parseError = null;

        // Models sometimes wrap the array in prose, fences, or an object
        // ({"ideas": [...]}); take the outermost [...] rather than demanding
        // the reply be nothing but the array.
        $stripped = trim((string) preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $reply));
        $parsed = json_decode($stripped, true);
        if (!is_array($parsed)) {
            $open = strpos($stripped, '[');
            $close = strrpos($stripped, ']');
            if ($open !== false && $close !== false && $close > $open) {
                $parsed = json_decode(substr($stripped, $open, $close - $open + 1), true);
            }
        }
        if (is_array($parsed) && !array_is_list($parsed)) {
            $parsed = array_values(array_filter($parsed, 'is_array'))[0] ?? null;
        }
        if (!is_array($parsed) || !array_is_list($parsed)) {
            error_log('ContentIdeasController: could not parse a JSON array from model output: ' . substr($stripped, 0, 800));
            self::$parseError = 'the reply was not a valid JSON list (it may have been cut off mid-answer)';
            return null;
        }

        // One bad item used to throw away the whole batch. Now a malformed
        // item, or a LinkedIn idea whose source_post_index is invalid or
        // reused, is dropped on its own; the grounding guarantee still holds
        // because nothing ungrounded is ever kept. Days are renumbered 1..N in
        // the model's order afterward, so a duplicated or skipped day number
        // can't sink the plan either.
        $ideas = [];
        $usedPostIndices = [];
        $dropped = 0;
        foreach ($parsed as $position => $item) {
            if (!is_array($item)) {
                $dropped++;
                continue;
            }
            $platform = strtolower(str_replace(' ', '', trim((string) ($item['platform'] ?? ''))));
            $title = trim((string) ($item['title'] ?? ''));
            $description = trim((string) ($item['description'] ?? ''));
            if (!in_array($platform, self::PLATFORMS, true) || $title === '' || $description === '') {
                error_log('ContentIdeasController: dropped malformed idea item: ' . json_encode($item));
                $dropped++;
                continue;
            }

            $sourcePostedAt = null;
            $sourcePostText = null;
            $sourcePostUrl = null;
            if ($platform === 'linkedin') {
                $sourceIndex = (int) ($item['source_post_index'] ?? 0);
                if (!isset($postsByIndex[$sourceIndex]) || isset($usedPostIndices[$sourceIndex])) {
                    error_log('ContentIdeasController: dropped LinkedIn idea with invalid/reused '
                        . 'source_post_index: ' . json_encode($item));
                    $dropped++;
                    continue;
                }
                $usedPostIndices[$sourceIndex] = true;
                $sourcePostedAt = $postsByIndex[$sourceIndex]['posted_at'];
                $sourcePostText = $postsByIndex[$sourceIndex]['text'] ?? null;
                $sourcePostUrl = $postsByIndex[$sourceIndex]['url'] ?? null;
            }

            $ideas[] = [
                'order' => [(int) ($item['day'] ?? 0) ?: PHP_INT_MAX, $position],
                'platform' => $platform,
                'title' => mb_substr($title, 0, 200),
                'description' => mb_substr($description, 0, 1000),
                'grounded' => $platform === 'linkedin',
                'source_posted_at' => $sourcePostedAt,
                'source_post_text' => $sourcePostText,
                'source_post_url' => $sourcePostUrl,
            ];
        }

        if (count($ideas) < self::MIN_IDEAS) {
            self::$parseError = sprintf(
                'only %d usable idea(s) came back (%d dropped as malformed or ungrounded), fewer than the %d needed',
                count($ideas),
                $dropped,
                self::MIN_IDEAS
            );
            error_log('ContentIdeasController: ' . self::$parseError);
            return null;
        }
        if (count($usedPostIndices) !== count($postsByIndex)) {
            error_log('ContentIdeasController: ' . (count($postsByIndex) - count($usedPostIndices))
                . ' real post(s) got no LinkedIn idea this batch; keeping the plan anyway.');
        }

        usort($ideas, static fn(array $a, array $b): int => $a['order'] <=> $b['order']);
        $ideas = array_slice($ideas, 0, self::MAX_DAYS);
        foreach ($ideas as $i => &$idea) {
            unset($idea['order']);
            $idea = ['day' => $i + 1] + $idea;
        }
        unset($idea);

        return $ideas;
    }
}
