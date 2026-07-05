<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;

class TagController
{
    /** GET /api/v1/tags */
    public static function index(): void
    {
        $pdo = Database::get();
        $stmt = $pdo->query(
            'SELECT t.id, t.name, t.slug, COUNT(pt.project_id) AS project_count
             FROM tags t
             LEFT JOIN project_tags pt ON pt.tag_id = t.id
             LEFT JOIN projects p ON p.id = pt.project_id AND p.is_published = 1
             GROUP BY t.id
             HAVING project_count > 0
             ORDER BY t.name ASC'
        );
        Response::json($stmt->fetchAll());
    }

    /** GET /api/v1/admin/tags — every tag with usage across drafts too, admin-only */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->query(
            'SELECT t.id, t.name, t.slug, COUNT(pt.project_id) AS project_count
             FROM tags t
             LEFT JOIN project_tags pt ON pt.tag_id = t.id
             GROUP BY t.id
             ORDER BY t.name ASC'
        );
        Response::json($stmt->fetchAll());
    }

    /** POST /api/v1/admin/tags */
    public static function store(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $name = self::validateName($data);
        $slug = self::slugify($name);

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM tags WHERE slug = ? OR name = ?');
        $stmt->execute([$slug, $name]);
        if ($stmt->fetch()) {
            Response::error('A tag with that name already exists.', 409);
        }

        $pdo->prepare('INSERT INTO tags (name, slug) VALUES (?, ?)')->execute([$name, $slug]);
        Response::json(['id' => (int) $pdo->lastInsertId()], 201);
    }

    /** PUT /api/v1/admin/tags/{id} */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $id = (int) $params['id'];
        $name = self::validateName($data);
        $slug = self::slugify($name);

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM tags WHERE (slug = ? OR name = ?) AND id != ?');
        $stmt->execute([$slug, $name, $id]);
        if ($stmt->fetch()) {
            Response::error('A tag with that name already exists.', 409);
        }

        $stmt = $pdo->prepare('UPDATE tags SET name = ?, slug = ? WHERE id = ?');
        $stmt->execute([$name, $slug, $id]);
        if ($stmt->rowCount() === 0) {
            Response::error('Tag not found', 404);
        }
        Response::json(['status' => 'updated']);
    }

    /** DELETE /api/v1/admin/tags/{id} — project_tags rows cascade */
    public static function destroy(array $params): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $pdo->prepare('DELETE FROM tags WHERE id = ?')->execute([(int) $params['id']]);
        Response::json(['status' => 'deleted']);
    }

    /** Halts with a 422 unless the payload carries a usable tag name. */
    private static function validateName(array $data): string
    {
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 50) {
            Response::error('Tag name is required and must be under 50 characters.', 422);
        }
        return $name;
    }

    // Must stay identical to the slug expression in ProjectController::syncTags
    // so tags created here are found (not duplicated) when projects save.
    private static function slugify(string $name): string
    {
        return strtolower(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)));
    }
}
