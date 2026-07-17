<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;

/**
 * Content Studio: the review workbench for everything the Content agent
 * ("Canvas") generates — captions, flyer images, and blog drafts. Kept in its
 * own table (content_studio_items) and admin page, deliberately separate from
 * the social_post_drafts / blog_posts publishing pipelines, so Caleb can
 * review, download the images, and correct the copy before anything is used.
 * Nothing here is ever published from this controller.
 *
 * The record* helpers are the write side used by ContentAgentController's tools;
 * index/update/destroy are the admin CRUD the Content Studio page calls.
 */
class ContentStudioController
{
    private const EDITABLE = ['title', 'body', 'excerpt', 'hashtags', 'notes'];
    private const STATUSES = ['draft', 'approved', 'used'];

    /** GET /api/v1/admin/content-studio */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query('SELECT * FROM content_studio_items ORDER BY created_at DESC, id DESC')->fetchAll();
        Response::json($rows);
    }

    /** PATCH /api/v1/admin/content-studio/{id} — correct copy / notes / status. */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $sets = [];
        $values = [];
        foreach (self::EDITABLE as $field) {
            if (array_key_exists($field, $data)) {
                $sets[] = "$field = ?";
                $value = trim((string) $data[$field]);
                $values[] = $value === '' ? null : $value;
            }
        }
        if (array_key_exists('status', $data)) {
            $status = (string) $data['status'];
            if (!in_array($status, self::STATUSES, true)) {
                Response::error('status must be one of: ' . implode(', ', self::STATUSES) . '.', 422);
            }
            $sets[] = 'status = ?';
            $values[] = $status;
        }
        if (!$sets) {
            Response::error('No editable fields provided.', 422);
        }

        $sets[] = "updated_at = datetime('now')";
        $values[] = $id;

        $pdo = Database::get();
        $stmt = $pdo->prepare('UPDATE content_studio_items SET ' . implode(', ', $sets) . ' WHERE id = ?');
        $stmt->execute($values);
        if ($stmt->rowCount() === 0) {
            Response::error('Item not found.', 404);
        }

        $get = $pdo->prepare('SELECT * FROM content_studio_items WHERE id = ?');
        $get->execute([$id]);
        Response::json($get->fetch());
    }

    /** DELETE /api/v1/admin/content-studio/{id} */
    public static function destroy(array $params): void
    {
        AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $pdo = Database::get();
        $stmt = $pdo->prepare('DELETE FROM content_studio_items WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            Response::error('Item not found.', 404);
        }
        Response::json(['deleted' => true]);
    }

    /**
     * POST /api/v1/admin/content-studio/{id}/promote — push a reviewed item
     * into the real publishing pipeline: a social/flyer item becomes a
     * social_post_drafts row, a blog item becomes an UNPUBLISHED blog_posts
     * row. The studio item is marked 'used' so it's clear it's been sent on.
     * Still nothing goes public — the destination is a draft either way.
     */
    public static function promote(array $params): void
    {
        AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $pdo = Database::get();

        $stmt = $pdo->prepare('SELECT * FROM content_studio_items WHERE id = ?');
        $stmt->execute([$id]);
        $item = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$item) {
            Response::error('Item not found.', 404);
        }

        if ($item['kind'] === 'blog') {
            $title = trim((string) $item['title']);
            $excerpt = trim((string) $item['excerpt']);
            $body = trim((string) $item['body']);
            if ($title === '' || $excerpt === '' || $body === '') {
                Response::error('This blog draft needs a title, excerpt, and body before it can be sent to the Blog.', 422);
            }
            // blog_posts.cover_image_path is NOT NULL — fall back to the site
            // share image when the draft has no cover of its own.
            $cover = trim((string) ($item['image_url'] ?? ''));
            if ($cover === '') {
                $cover = '/uploads/og-image.png';
            }
            $slug = self::uniqueSlug($title, $pdo);
            $ins = $pdo->prepare(
                'INSERT INTO blog_posts (slug, title, excerpt, body, cover_image_path, is_published) '
                . 'VALUES (?, ?, ?, ?, ?, 0)'
            );
            $ins->execute([$slug, $title, $excerpt, $body, $cover]);
            $target = 'blog';
            $newId = (int) $pdo->lastInsertId();
        } else {
            // social or flyer — needs a caption (body) to become a real post.
            $content = trim((string) ($item['body'] ?? ''));
            if ($content === '') {
                Response::error('Add a caption to this item before sending it to Social Drafts.', 422);
            }
            $ins = $pdo->prepare(
                "INSERT INTO social_post_drafts (source_type, source_id, content, short_content, hashtags, image_url, ai_provider, status) "
                . "VALUES ('general', NULL, ?, ?, ?, ?, 'content-agent', 'draft')"
            );
            $ins->execute([
                $content,
                ($item['excerpt'] ?? '') !== '' ? $item['excerpt'] : null,
                ($item['hashtags'] ?? '') !== '' ? $item['hashtags'] : null,
                ($item['image_url'] ?? '') !== '' ? $item['image_url'] : null,
            ]);
            $target = 'social';
            $newId = (int) $pdo->lastInsertId();
        }

        $upd = $pdo->prepare("UPDATE content_studio_items SET status = 'used', updated_at = datetime('now') WHERE id = ?");
        $upd->execute([$id]);

        Response::json(['promoted' => true, 'target' => $target, 'id' => $newId]);
    }

    /** Slugify a blog title and guarantee uniqueness against existing blog_posts. */
    private static function uniqueSlug(string $title, \PDO $pdo): string
    {
        $base = strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '-', $title), '-'));
        if ($base === '') {
            $base = 'post';
        }
        $base = substr($base, 0, 80);

        $slug = $base;
        $check = $pdo->prepare('SELECT 1 FROM blog_posts WHERE slug = ?');
        for ($i = 0; $i < 20; $i++) {
            $check->execute([$slug]);
            if ($check->fetchColumn() === false) {
                return $slug;
            }
            $slug = $base . '-' . bin2hex(random_bytes(2));
        }
        return $base . '-' . bin2hex(random_bytes(4));
    }

    // ---- write side, called by the Content agent's tools ----

    /** Record a generated flyer image (no caption yet). @return int new row id */
    public static function recordFlyer(\PDO $pdo, string $imageUrl, string $imageSize, ?string $prompt = null): int
    {
        $stmt = $pdo->prepare(
            "INSERT INTO content_studio_items (kind, title, image_url, image_size, notes, status) "
            . "VALUES ('flyer', ?, ?, ?, ?, 'draft')"
        );
        $stmt->execute([$imageSize ?: 'Flyer', $imageUrl, $imageSize ?: null, $prompt ?: null]);
        return (int) $pdo->lastInsertId();
    }

    /**
     * Record a social caption. If it references an image that was just generated
     * as a standalone flyer row, promote that row in place (caption + image as
     * one item) rather than leaving a bare flyer and a separate caption.
     *
     * @return int the row id (promoted flyer's id, or a new row's)
     */
    public static function recordSocial(\PDO $pdo, string $content, ?string $shortContent, ?string $hashtags, ?string $imageUrl): int
    {
        $imageUrl = ($imageUrl !== null && $imageUrl !== '') ? $imageUrl : null;

        if ($imageUrl !== null) {
            $find = $pdo->prepare(
                "SELECT id FROM content_studio_items WHERE kind = 'flyer' AND image_url = ? AND body IS NULL "
                . 'ORDER BY id DESC LIMIT 1'
            );
            $find->execute([$imageUrl]);
            $flyerId = $find->fetchColumn();
            if ($flyerId !== false) {
                $upd = $pdo->prepare(
                    "UPDATE content_studio_items SET kind = 'social', body = ?, excerpt = ?, hashtags = ?, "
                    . "updated_at = datetime('now') WHERE id = ?"
                );
                $upd->execute([$content, $shortContent ?: null, $hashtags ?: null, (int) $flyerId]);
                return (int) $flyerId;
            }
        }

        $stmt = $pdo->prepare(
            "INSERT INTO content_studio_items (kind, body, excerpt, hashtags, image_url, status) "
            . "VALUES ('social', ?, ?, ?, ?, 'draft')"
        );
        // excerpt column doubles as the "short variant" store for social items.
        $stmt->execute([$content, $shortContent ?: null, $hashtags ?: null, $imageUrl]);
        return (int) $pdo->lastInsertId();
    }

    /** Record a blog draft. @return int new row id */
    public static function recordBlog(\PDO $pdo, string $title, string $excerpt, string $body, ?string $imageUrl): int
    {
        $stmt = $pdo->prepare(
            "INSERT INTO content_studio_items (kind, title, excerpt, body, image_url, status) "
            . "VALUES ('blog', ?, ?, ?, ?, 'draft')"
        );
        $stmt->execute([$title, $excerpt, $body, ($imageUrl !== null && $imageUrl !== '') ? $imageUrl : null]);
        return (int) $pdo->lastInsertId();
    }
}
