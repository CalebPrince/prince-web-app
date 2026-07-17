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
