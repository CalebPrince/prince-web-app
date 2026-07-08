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

    private static function readingTime(string $body): int
    {
        return max(1, (int) ceil(str_word_count($body) / self::WORDS_PER_MINUTE));
    }

    /** GET /api/v1/blog — public, published only */
    public static function index(): void
    {
        $pdo = Database::get();
        $stmt = $pdo->query(
            'SELECT id, slug, title, excerpt, category, cover_image_path, body, created_at
             FROM blog_posts WHERE is_published = 1 ORDER BY sort_order ASC'
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
        $stmt = $pdo->query('SELECT * FROM blog_posts ORDER BY sort_order ASC');
        Response::json($stmt->fetchAll());
    }

    /** POST /api/v1/admin/blog */
    public static function store(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $errors = Validator::validateBlogPost($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();
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
            (int) ($data['sort_order'] ?? 0),
        ]);

        if (!empty($data['is_published'])) {
            MakeWebhook::send('content_published', [
                'type' => 'blog',
                'title' => $data['title'],
                'excerpt' => $data['excerpt'],
                'url' => self::absoluteUrl('/blog-post.html?slug=' . $data['slug']),
            ]);
        }

        Response::json(['id' => (int) $pdo->lastInsertId()], 201);
    }

    /** PUT /api/v1/admin/blog/{id} */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

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
            MakeWebhook::send('content_published', [
                'type' => 'blog',
                'title' => $data['title'],
                'excerpt' => $data['excerpt'],
                'url' => self::absoluteUrl('/blog-post.html?slug=' . $data['slug']),
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
