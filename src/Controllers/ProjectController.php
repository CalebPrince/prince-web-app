<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Database;
use App\Support\MakeWebhook;
use App\Support\Response;
use App\Support\Validator;

class ProjectController
{
    private static function slugify(string $title): string
    {
        $slug = strtolower(trim($title));
        $slug = preg_replace('/&+/', ' and ', $slug) ?? $slug;
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? $slug;
        $slug = trim($slug, '-');
        return $slug !== '' ? $slug : 'project';
    }

    private static function normalizeSlugData(array &$data): void
    {
        $slug = trim((string) ($data['slug'] ?? ''));
        $data['slug'] = $slug !== '' ? self::slugify($slug) : self::slugify((string) ($data['title'] ?? ''));
    }

    private static function attachTags(\PDO $pdo, array $projects): array
    {
        if (!$projects) {
            return $projects;
        }
        $ids = array_column($projects, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare(
            "SELECT pt.project_id, t.name, t.slug FROM project_tags pt
             JOIN tags t ON t.id = pt.tag_id
             WHERE pt.project_id IN ($placeholders)"
        );
        $stmt->execute($ids);
        $tagsByProject = [];
        foreach ($stmt->fetchAll() as $row) {
            $tagsByProject[$row['project_id']][] = ['name' => $row['name'], 'slug' => $row['slug']];
        }

        // Only ever surface a testimonial that's been admin-approved — a
        // project can point at one that's still pending/rejected, but it
        // shouldn't render anywhere until approved.
        $testimonialIds = array_values(array_unique(array_filter(array_column($projects, 'testimonial_id'))));
        $testimonialsById = [];
        if ($testimonialIds) {
            $tPlaceholders = implode(',', array_fill(0, count($testimonialIds), '?'));
            $tStmt = $pdo->prepare(
                "SELECT id, client_name, quote, rating FROM testimonials WHERE id IN ($tPlaceholders) AND status = 'approved'"
            );
            $tStmt->execute($testimonialIds);
            foreach ($tStmt->fetchAll() as $row) {
                $testimonialsById[$row['id']] = $row;
            }
        }

        foreach ($projects as &$project) {
            $project['tags'] = $tagsByProject[$project['id']] ?? [];
            $project['gallery'] = $project['gallery_json'] ? json_decode($project['gallery_json'], true) : [];
            unset($project['gallery_json']);
            $project['testimonial'] = $project['testimonial_id'] !== null
                ? ($testimonialsById[$project['testimonial_id']] ?? null)
                : null;
        }
        return $projects;
    }

    /** GET /api/v1/projects?tag=react */
    public static function index(): void
    {
        $pdo = Database::get();
        $tagSlug = $_GET['tag'] ?? null;

        if ($tagSlug) {
            $stmt = $pdo->prepare(
                'SELECT DISTINCT p.* FROM projects p
                 JOIN project_tags pt ON pt.project_id = p.id
                 JOIN tags t ON t.id = pt.tag_id
                 WHERE p.is_published = 1 AND t.slug = ?
                 ORDER BY p.sort_order ASC'
            );
            $stmt->execute([$tagSlug]);
        } else {
            $stmt = $pdo->query('SELECT * FROM projects WHERE is_published = 1 ORDER BY sort_order ASC');
        }

        $projects = self::attachTags($pdo, $stmt->fetchAll());
        Response::json($projects);
    }

    /** GET /api/v1/projects/{slug} */
    public static function show(array $params): void
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM projects WHERE slug = ? AND is_published = 1');
        $stmt->execute([$params['slug']]);
        $project = $stmt->fetch();

        if (!$project) {
            Response::error('Project not found', 404);
        }

        [$project] = self::attachTags($pdo, [$project]);
        Response::json($project);
    }

    /** GET /api/v1/admin/projects — includes unpublished, admin-only */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->query('SELECT * FROM projects ORDER BY sort_order ASC');
        Response::json(self::attachTags($pdo, $stmt->fetchAll()));
    }

    /** POST /api/v1/admin/projects */
    public static function store(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        self::normalizeSlugData($data);

        $errors = Validator::validateProject($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare(
            'INSERT INTO projects (slug, title, summary, case_study_body, category, live_url, repo_url, cover_image_path, gallery_json, is_embeddable, is_published, is_featured, sort_order, outcome_metrics, testimonial_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $data['slug'],
            $data['title'],
            $data['summary'],
            $data['case_study_body'] ?? null,
            $data['category'],
            $data['live_url'] ?? null,
            $data['repo_url'] ?? null,
            $data['cover_image_path'],
            self::encodeGallery($data['gallery'] ?? []),
            !empty($data['is_embeddable']) ? 1 : 0,
            !empty($data['is_published']) ? 1 : 0,
            !empty($data['is_featured']) ? 1 : 0,
            (int) ($data['sort_order'] ?? 0),
            trim((string) ($data['outcome_metrics'] ?? '')) ?: null,
            !empty($data['testimonial_id']) ? (int) $data['testimonial_id'] : null,
        ]);
        $projectId = (int) $pdo->lastInsertId();

        self::syncTags($pdo, $projectId, $data['tags'] ?? []);

        if (!empty($data['is_published'])) {
            MakeWebhook::send('content_published', [
                'type' => 'project',
                'title' => $data['title'],
                'summary' => $data['summary'],
                'url' => self::absoluteUrl('/project.html?slug=' . $data['slug']),
            ]);
        }

        Response::json(['id' => $projectId], 201);
    }

    /** PUT /api/v1/admin/projects/{id} */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        self::normalizeSlugData($data);
        $id = (int) $params['id'];

        $errors = Validator::validateProject($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();

        $stmt = $pdo->prepare('SELECT is_published FROM projects WHERE id = ?');
        $stmt->execute([$id]);
        $wasPublished = (bool) $stmt->fetchColumn();

        $stmt = $pdo->prepare(
            "UPDATE projects SET slug=?, title=?, summary=?, case_study_body=?, category=?, live_url=?, repo_url=?,
             cover_image_path=?, gallery_json=?, is_embeddable=?, is_published=?, is_featured=?, sort_order=?,
             outcome_metrics=?, testimonial_id=?, updated_at=datetime('now') WHERE id=?"
        );
        $stmt->execute([
            $data['slug'],
            $data['title'],
            $data['summary'],
            $data['case_study_body'] ?? null,
            $data['category'],
            $data['live_url'] ?? null,
            $data['repo_url'] ?? null,
            $data['cover_image_path'],
            self::encodeGallery($data['gallery'] ?? []),
            !empty($data['is_embeddable']) ? 1 : 0,
            !empty($data['is_published']) ? 1 : 0,
            !empty($data['is_featured']) ? 1 : 0,
            (int) ($data['sort_order'] ?? 0),
            trim((string) ($data['outcome_metrics'] ?? '')) ?: null,
            !empty($data['testimonial_id']) ? (int) $data['testimonial_id'] : null,
            $id,
        ]);

        self::syncTags($pdo, $id, $data['tags'] ?? []);

        if (!$wasPublished && !empty($data['is_published'])) {
            MakeWebhook::send('content_published', [
                'type' => 'project',
                'title' => $data['title'],
                'summary' => $data['summary'],
                'url' => self::absoluteUrl('/project.html?slug=' . $data['slug']),
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

    /** PATCH /api/v1/admin/projects/reorder — body: {order: [id, id, ...]} in new display order */
    public static function reorder(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $order = $data['order'] ?? [];

        if (!is_array($order) || !$order) {
            Response::error('order must be a non-empty array of project IDs.', 422);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('UPDATE projects SET sort_order = ? WHERE id = ?');
        foreach (array_values($order) as $index => $id) {
            $stmt->execute([$index, (int) $id]);
        }

        Response::json(['status' => 'reordered']);
    }

    /** DELETE /api/v1/admin/projects/{id} */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) $params['id'];
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT title FROM projects WHERE id = ?');
        $stmt->execute([$id]);
        $title = $stmt->fetchColumn();

        $pdo->prepare('DELETE FROM projects WHERE id = ?')->execute([$id]);
        ActivityLog::log($user, 'deleted', 'project', $id, $title ?: null);
        Response::json(['status' => 'deleted']);
    }

    /** @param array<int,string> $paths */
    private static function encodeGallery(array $paths): ?string
    {
        $paths = array_values(array_filter(array_map('trim', $paths), fn($p) => $p !== ''));
        return $paths ? json_encode($paths) : null;
    }

    /** @param array<int,string> $tagNames */
    private static function syncTags(\PDO $pdo, int $projectId, array $tagNames): void
    {
        $pdo->prepare('DELETE FROM project_tags WHERE project_id = ?')->execute([$projectId]);

        foreach ($tagNames as $name) {
            $name = trim((string) $name);
            if ($name === '') {
                continue;
            }
            $slug = strtolower(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)));

            $stmt = $pdo->prepare('SELECT id FROM tags WHERE slug = ?');
            $stmt->execute([$slug]);
            $tag = $stmt->fetch();

            if ($tag) {
                $tagId = $tag['id'];
            } else {
                $pdo->prepare('INSERT INTO tags (name, slug) VALUES (?, ?)')->execute([$name, $slug]);
                $tagId = (int) $pdo->lastInsertId();
            }

            $pdo->prepare('INSERT OR IGNORE INTO project_tags (project_id, tag_id) VALUES (?, ?)')
                ->execute([$projectId, $tagId]);
        }
    }
}
