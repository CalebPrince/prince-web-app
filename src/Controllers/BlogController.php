<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Database;
use App\Support\MakeWebhook;
use App\Support\Response;
use App\Support\Validator;

class BlogController
{
    private const WORDS_PER_MINUTE = 200;

    private static function slugify(string $title): string
    {
        $slug = strtolower(trim($title));
        $slug = preg_replace('/&+/', ' and ', $slug) ?? $slug;
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? $slug;
        $slug = trim($slug, '-');
        return $slug !== '' ? $slug : 'post';
    }

    private static function normalizeSlugData(array &$data): void
    {
        $slug = trim((string) ($data['slug'] ?? ''));
        $data['slug'] = $slug !== '' ? self::slugify($slug) : self::slugify((string) ($data['title'] ?? ''));
    }

    private static function readingTime(string $body): int
    {
        return max(1, (int) ceil(str_word_count($body) / self::WORDS_PER_MINUTE));
    }

    /** GET /api/v1/blog — public, published only */
    public static function index(): void
    {
        $pdo = Database::get();
        // Highest sort_order first: new posts get max+1 (see store()), so the
        // newest post always leads the archive, homepage, and nav dropdown.
        $stmt = $pdo->query(
            'SELECT id, slug, title, excerpt, category, cover_image_path, body, created_at
             FROM blog_posts WHERE is_published = 1 ORDER BY sort_order DESC, id DESC'
        );
        $posts = $stmt->fetchAll();
        foreach ($posts as &$post) {
            $post['reading_time'] = self::readingTime($post['body']);
            unset($post['body']);
        }
        Response::json($posts);
    }

    /** GET /api/v1/blog/{slug} */
    public static function show(array $params): void
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM blog_posts WHERE slug = ? AND is_published = 1');
        $stmt->execute([$params['slug']]);
        $post = $stmt->fetch();

        if (!$post) {
            Response::error('Post not found', 404);
        }

        $post['reading_time'] = self::readingTime($post['body']);
        Response::json($post);
    }

    /** GET /api/v1/admin/blog — includes unpublished, admin-only */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->query('SELECT * FROM blog_posts ORDER BY sort_order DESC, id DESC');
        Response::json($stmt->fetchAll());
    }

    /** POST /api/v1/admin/blog */
    public static function store(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        self::normalizeSlugData($data);

        $errors = Validator::validateBlogPost($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();

        // Posts are listed by sort_order DESC (newest first). Unless the admin
        // sets an explicit position, a new post takes the top spot.
        $sortOrder = (int) ($data['sort_order'] ?? 0);
        if ($sortOrder === 0) {
            $sortOrder = (int) $pdo->query('SELECT COALESCE(MAX(sort_order), 0) FROM blog_posts')->fetchColumn() + 1;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO blog_posts (slug, title, excerpt, body, category, cover_image_path, is_published, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['slug'],
            $data['title'],
            $data['excerpt'],
            $data['body'],
            trim((string) ($data['category'] ?? '')) ?: null,
            $data['cover_image_path'],
            !empty($data['is_published']) ? 1 : 0,
            $sortOrder,
        ]);
        $postId = (int) $pdo->lastInsertId();

        if (!empty($data['is_published'])) {
            self::queueNewsletterDraft($pdo, $postId, $data);
            MakeWebhook::send('content_published', [
                'type' => 'blog',
                'title' => $data['title'],
                'excerpt' => $data['excerpt'],
                'url' => self::absoluteUrl('/archive-post.html?slug=' . $data['slug']),
            ]);
        }

        Response::json(['id' => $postId], 201);
    }

    /** PUT /api/v1/admin/blog/{id} */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        self::normalizeSlugData($data);

        $errors = Validator::validateBlogPost($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();
        $id = (int) $params['id'];

        $stmt = $pdo->prepare('SELECT is_published FROM blog_posts WHERE id = ?');
        $stmt->execute([$id]);
        $wasPublished = (bool) $stmt->fetchColumn();

        $stmt = $pdo->prepare(
            "UPDATE blog_posts SET slug=?, title=?, excerpt=?, body=?, category=?, cover_image_path=?,
             is_published=?, sort_order=?, updated_at=datetime('now') WHERE id=?"
        );
        $stmt->execute([
            $data['slug'],
            $data['title'],
            $data['excerpt'],
            $data['body'],
            trim((string) ($data['category'] ?? '')) ?: null,
            $data['cover_image_path'],
            !empty($data['is_published']) ? 1 : 0,
            (int) ($data['sort_order'] ?? 0),
            $id,
        ]);

        if (!$wasPublished && !empty($data['is_published'])) {
            self::queueNewsletterDraft($pdo, $id, $data);
            MakeWebhook::send('content_published', [
                'type' => 'blog',
                'title' => $data['title'],
                'excerpt' => $data['excerpt'],
                'url' => self::absoluteUrl('/archive-post.html?slug=' . $data['slug']),
            ]);
        }

        Response::json(['status' => 'updated']);
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

    private static function queueNewsletterDraft(\PDO $pdo, int $postId, array $data): void
    {
        try {
            $pdo->prepare(
                "INSERT OR IGNORE INTO newsletter_drafts (blog_post_id, article_title, article_excerpt, article_url, status) VALUES (?, ?, ?, ?, 'queued')"
            )->execute([
                $postId,
                $data['title'],
                $data['excerpt'],
                self::absoluteUrl('/archive-post.html?slug=' . $data['slug']),
            ]);
        } catch (\Throwable $e) {
            // Publishing the article is primary; a queue problem must not make
            // a successful publish look like a failure.
            error_log('Newsletter draft queue failed: ' . $e->getMessage());
        }
    }

    /** DELETE /api/v1/admin/blog/{id} */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) $params['id'];
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT title FROM blog_posts WHERE id = ?');
        $stmt->execute([$id]);
        $title = $stmt->fetchColumn();

        $pdo->prepare('DELETE FROM blog_posts WHERE id = ?')->execute([$id]);
        ActivityLog::log($user, 'deleted', 'blog_post', $id, $title ?: null);
        Response::json(['status' => 'deleted']);
    }
}
