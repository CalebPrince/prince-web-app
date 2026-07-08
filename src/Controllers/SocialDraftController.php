<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\AiText;
use App\Support\Database;
use App\Support\MakeWebhook;
use App\Support\Response;

/**
 * AI-drafted social posts. generateDraft() is shared between the scheduled
 * cron script (database/generate_social_drafts.php) and the admin's manual
 * "Generate now" button. Drafts spotlight the most recent published
 * blog post / project / approved testimonial that hasn't already been
 * drafted, falling back to an original evergreen post when there's nothing
 * new. Approval fires a Make.com event (see MakeWebhook) — actual
 * publishing to social platforms happens there, not in this app.
 */
class SocialDraftController
{
    /** GET /api/v1/admin/social-drafts */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        Response::json($pdo->query('SELECT * FROM social_post_drafts ORDER BY created_at DESC')->fetchAll());
    }

    /** POST /api/v1/admin/social-drafts/generate */
    public static function generate(): void
    {
        AuthMiddleware::requireAuth();
        $result = self::generateDraft();
        if (!$result) {
            Response::error('Could not generate a draft — check that an AI provider is configured and reachable.', 502);
        }
        Response::json($result, 201);
    }

    /** PATCH /api/v1/admin/social-drafts/{id} — body: {content?, short_content?, hashtags?, status?} */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM social_post_drafts WHERE id = ?');
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            Response::error('Draft not found.', 404);
        }

        $fields = [];
        $values = [];
        foreach (['content', 'short_content', 'hashtags'] as $key) {
            if (array_key_exists($key, $data)) {
                $fields[] = "$key = ?";
                $values[] = trim((string) $data[$key]) !== '' ? trim((string) $data[$key]) : null;
            }
        }
        if (array_key_exists('status', $data)) {
            if (!in_array($data['status'], ['draft', 'approved', 'rejected'], true)) {
                Response::error('Invalid status.', 422);
            }
            $fields[] = 'status = ?';
            $values[] = $data['status'];
        }
        if (!$fields) {
            Response::error('Nothing to update.', 422);
        }

        $values[] = $id;
        $pdo->prepare('UPDATE social_post_drafts SET ' . implode(', ', $fields) . ", updated_at = datetime('now') WHERE id = ?")
            ->execute($values);

        if ($existing['status'] !== 'approved' && ($data['status'] ?? null) === 'approved') {
            $stmt = $pdo->prepare('SELECT * FROM social_post_drafts WHERE id = ?');
            $stmt->execute([$id]);
            $fresh = $stmt->fetch();

            MakeWebhook::send('social_post_approved', [
                'id' => (int) $fresh['id'],
                'content' => $fresh['content'],
                'short_content' => $fresh['short_content'],
                'hashtags' => $fresh['hashtags'],
                'source_type' => $fresh['source_type'],
            ]);
            $pdo->prepare('UPDATE social_post_drafts SET sent_to_makecom = 1 WHERE id = ?')->execute([$id]);
        }

        Response::json(['status' => 'updated']);
    }

    /** DELETE /api/v1/admin/social-drafts/{id} */
    public static function destroy(array $params): void
    {
        AuthMiddleware::requireAuth();
        Database::get()->prepare('DELETE FROM social_post_drafts WHERE id = ?')->execute([(int) ($params['id'] ?? 0)]);
        Response::json(['status' => 'deleted']);
    }

    /** @return array{id:int}|null */
    public static function generateDraft(): ?array
    {
        $pdo = Database::get();
        $source = self::findSource($pdo);
        $prompt = $source ? self::promptForSource($source) : self::generalPrompt();

        $text = AiText::generate($prompt, null, 20);
        if ($text === null) {
            error_log('Social draft generation: both Gemini and OpenRouter (if configured) failed.');
            return null;
        }

        $text = trim(preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $text));
        $parsed = json_decode($text, true);
        if (!is_array($parsed) || empty($parsed['content'])) {
            error_log('Social draft generation: could not parse JSON from model output: ' . substr($text, 0, 800));
            return null;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO social_post_drafts (source_type, source_id, content, short_content, hashtags) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $source['type'] ?? 'general',
            $source['id'] ?? null,
            (string) $parsed['content'],
            !empty($parsed['short_content']) ? (string) $parsed['short_content'] : null,
            !empty($parsed['hashtags']) ? (string) $parsed['hashtags'] : null,
        ]);

        return ['id' => (int) $pdo->lastInsertId()];
    }

    private static function findSource(\PDO $pdo): ?array
    {
        $stmt = $pdo->query(
            "SELECT id, slug, title, excerpt FROM blog_posts
             WHERE is_published = 1
               AND id NOT IN (SELECT source_id FROM social_post_drafts WHERE source_type = 'blog' AND source_id IS NOT NULL)
             ORDER BY created_at DESC LIMIT 1"
        );
        $blog = $stmt->fetch();
        if ($blog) {
            return [
                'type' => 'blog',
                'id' => (int) $blog['id'],
                'title' => $blog['title'],
                'summary' => $blog['excerpt'],
                'url' => self::absoluteUrl('/blog-post.html?slug=' . $blog['slug']),
            ];
        }

        $stmt = $pdo->query(
            "SELECT id, slug, title, summary FROM projects
             WHERE is_published = 1
               AND id NOT IN (SELECT source_id FROM social_post_drafts WHERE source_type = 'project' AND source_id IS NOT NULL)
             ORDER BY created_at DESC LIMIT 1"
        );
        $project = $stmt->fetch();
        if ($project) {
            return [
                'type' => 'project',
                'id' => (int) $project['id'],
                'title' => $project['title'],
                'summary' => $project['summary'],
                'url' => self::absoluteUrl('/project.html?slug=' . $project['slug']),
            ];
        }

        $stmt = $pdo->query(
            "SELECT id, client_name, project_reference, quote FROM testimonials
             WHERE status = 'approved'
               AND id NOT IN (SELECT source_id FROM social_post_drafts WHERE source_type = 'testimonial' AND source_id IS NOT NULL)
             ORDER BY submitted_at DESC LIMIT 1"
        );
        $testimonial = $stmt->fetch();
        if ($testimonial) {
            return [
                'type' => 'testimonial',
                'id' => (int) $testimonial['id'],
                'client_name' => $testimonial['client_name'],
                'project_reference' => $testimonial['project_reference'],
                'quote' => $testimonial['quote'],
            ];
        }

        return null;
    }

    private static function promptForSource(array $source): string
    {
        $base = 'You are drafting a social media post for Prince Caleb, a freelance web & mobile app developer. '
            . "Keep it authentic and professional, not salesy or hyperbolic — no invented statistics or false urgency.\n\n";
        $jsonSpec = 'Return JSON only: {"content": "2-4 sentence post for LinkedIn/Facebook", '
            . '"short_content": "a punchier version under 260 characters for X/Twitter", '
            . '"hashtags": "3-5 relevant hashtags separated by spaces"} — no markdown fences, no commentary.';

        if ($source['type'] === 'blog' || $source['type'] === 'project') {
            $kind = $source['type'] === 'blog' ? 'blog post' : 'case study';
            return $base . "Announce this new {$kind}:\nTitle: {$source['title']}\nSummary: {$source['summary']}\n"
                . "Link: {$source['url']}\n\nThe \"content\" and \"short_content\" fields must both include the link naturally.\n\n{$jsonSpec}";
        }

        $ref = $source['project_reference'] ? " for their {$source['project_reference']} project" : '';
        return $base . "Share this client testimonial{$ref}:\nClient: {$source['client_name']}\nQuote: \"{$source['quote']}\"\n\n{$jsonSpec}";
    }

    private static function generalPrompt(): string
    {
        $angles = [
            'a practical, specific web development tip business owners can actually use',
            'a common mistake businesses make with their website or online presence',
            'why custom software beats an off-the-shelf tool for a specific kind of business problem',
            'a behind-the-scenes insight into what it is like working with a freelance developer',
        ];
        $angle = $angles[array_rand($angles)];

        $jsonSpec = 'Return JSON only: {"content": "2-4 sentence post for LinkedIn/Facebook", '
            . '"short_content": "a punchier version under 260 characters for X/Twitter", '
            . '"hashtags": "3-5 relevant hashtags separated by spaces"} — no markdown fences, no commentary.';

        return 'You are drafting an original social media post for Prince Caleb, a freelance web & mobile app '
            . "developer based in Ghana. There is no new content to promote right now, so write about: {$angle}. "
            . "Keep it authentic and specific, not salesy or generic — no invented statistics or false urgency.\n\n{$jsonSpec}";
    }

    private static function absoluteUrl(string $path): string
    {
        $host = $_SERVER['HTTP_HOST'] ?? 'princecaleb.dev';
        $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https' ? 'https' : 'http';
        if ($host === 'princecaleb.dev' || str_ends_with($host, '.princecaleb.dev')) {
            $scheme = 'https';
        }

        return $scheme . '://' . $host . $path;
    }
}
