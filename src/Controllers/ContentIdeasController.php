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
 * (SharedAgentTools::getSiteInfo() — actual services/bio, never invented)
 * and, when available, real cached posts from Radar's tracked LinkedIn
 * pages (radar_tracked_page_findings, kept fresh by
 * database/run_radar_tracked_pages.php). YouTube has no equivalent real
 * data source anywhere in this app, so YouTube ideas are always plain AI
 * brainstorms grounded only in service positioning — the prompt is
 * explicit that they must never be phrased as "trending" or cite invented
 * metrics, the same anti-fabrication discipline Beacon/Dossier/Marketing
 * Leads already follow elsewhere in this codebase.
 *
 * Deliberately just a planning list (title + description per day), not
 * full post copy or a video script, and not wired into SocialDraftController
 * or Reel — turning an idea into an actual draft or a planned video stays a
 * manual next step. "Generate" replaces the full 30-row set each time
 * (delete-all + insert-30); this is a list you refresh, not an archive.
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

        $prompt = self::buildPrompt($pdo);
        $text = AiText::generate($prompt, self::systemInstruction(), 45);
        if ($text === null) {
            Response::error('Could not generate content ideas — check that an AI provider is configured and reachable.', 502);
        }

        $ideas = self::parseIdeas((string) $text);
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

    private static function systemInstruction(): string
    {
        return "You are a content strategist producing a 30-day content-idea calendar for a solo developer's "
            . "business (AI voice agents, chatbots, workflow automation, custom web/mobile development), split "
            . "across LinkedIn and YouTube. Ground every idea in the real business context provided — never "
            . "invent services, results, client names, or statistics. For LinkedIn ideas, when real recent posts "
            . "from tracked pages are provided below, you may reference real patterns/themes/formats you observe "
            . "in them (mark those ideas grounded: true) — but for YouTube, and for any LinkedIn idea not tied to "
            . "that real data, never claim something is 'trending' or cite an engagement number you don't "
            . "actually have (mark those grounded: false). An idea is a short title/hook plus a one-sentence "
            . "description of the angle — not a full script or post copy.\n\n"
            . "Return ONLY a raw JSON array of exactly 30 objects, no markdown fences, no commentary, in this "
            . "exact shape: [{\"day\": 1, \"platform\": \"linkedin\", \"title\": \"...\", \"description\": \"...\", "
            . "\"grounded\": false}, ...]. day must run 1 through 30 with no gaps or repeats. platform must be "
            . "exactly \"linkedin\" or \"youtube\" (mix both across the 30 days, weighted toward whichever makes "
            . "sense given the real data available).";
    }

    private static function buildPrompt(\PDO $pdo): string
    {
        $siteInfo = SharedAgentTools::getSiteInfo();
        $lines = ["Real business context (do not invent anything beyond this):"];
        $lines[] = json_encode($siteInfo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $tracked = $pdo->query(
            'SELECT page_url, findings_json FROM radar_tracked_page_findings ORDER BY fetched_at DESC LIMIT '
            . self::MAX_TRACKED_PAGES_IN_PROMPT
        )->fetchAll();
        if ($tracked) {
            $lines[] = "\nReal recent posts from tracked LinkedIn pages (use these for grounded LinkedIn ideas only):";
            foreach ($tracked as $page) {
                $posts = json_decode((string) $page['findings_json'], true) ?: [];
                $posts = array_slice($posts, 0, self::MAX_POSTS_PER_PAGE_IN_PROMPT);
                $lines[] = "Page: {$page['page_url']}\n" . json_encode($posts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
        } else {
            $lines[] = "\nNo tracked LinkedIn pages are cached yet — treat every idea as a plain AI brainstorm "
                . "(grounded: false for all of them).";
        }

        return implode("\n", $lines);
    }

    /** @return array<int,array{day:int,platform:string,title:string,description:string,grounded:bool}>|null */
    private static function parseIdeas(string $reply): ?array
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
        foreach ($parsed as $item) {
            if (!is_array($item)) {
                return null;
            }
            $day = (int) ($item['day'] ?? 0);
            $platform = (string) ($item['platform'] ?? '');
            $title = trim((string) ($item['title'] ?? ''));
            $description = trim((string) ($item['description'] ?? ''));
            if ($day < 1 || $day > 30 || isset($seenDays[$day])
                || !in_array($platform, self::PLATFORMS, true)
                || $title === '' || $description === ''
            ) {
                error_log('ContentIdeasController: rejected malformed idea item: ' . json_encode($item));
                return null;
            }
            $seenDays[$day] = true;
            $ideas[] = [
                'day' => $day,
                'platform' => $platform,
                'title' => mb_substr($title, 0, 200),
                'description' => mb_substr($description, 0, 1000),
                'grounded' => $platform === 'linkedin' && !empty($item['grounded']),
            ];
        }

        usort($ideas, static fn(array $a, array $b): int => $a['day'] <=> $b['day']);
        return $ideas;
    }
}
