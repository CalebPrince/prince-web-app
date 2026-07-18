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
        foreach ($projects as &$project) self::removePrivateFinance($project);
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
        self::removePrivateFinance($project);
        Response::json($project);
    }

    /** GET /api/v1/admin/projects — includes unpublished, admin-only */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->query('SELECT p.*, c.name AS client_name, c.email AS client_email FROM projects p LEFT JOIN clients c ON c.id=p.client_id ORDER BY p.sort_order ASC');
        $projects = self::attachTags($pdo, $stmt->fetchAll());
        $projects = self::attachOperations($pdo, $projects);
        foreach ($projects as &$project) self::attachFinanceMetrics($project);
        Response::json($projects);
    }

    /** POST /api/v1/admin/projects */
    public static function store(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        self::normalizeSlugData($data);
        $milestones = self::normalizeMilestones($data['milestones'] ?? []);

        $errors = Validator::validateProject($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();
        $clientId = self::validatedClientId($pdo, $data['client_id'] ?? null);
        $stmt = $pdo->prepare(
            'INSERT INTO projects (client_id, slug, title, summary, case_study_body, category, live_url, repo_url, cover_image_path, gallery_json, is_embeddable, is_published, is_featured, sort_order, outcome_metrics, testimonial_id, delivery_status, progress_percent, contract_value, estimated_cost, actual_cost, hours_worked, finance_currency, deadline, assigned_agent_key)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $clientId,
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
            $data['delivery_status'] ?? 'on_track',
            max(0, min(100, (int) ($data['progress_percent'] ?? 0))),
            self::moneyValue($data['contract_value'] ?? 0),
            self::moneyValue($data['estimated_cost'] ?? 0),
            self::moneyValue($data['actual_cost'] ?? 0),
            self::hoursValue($data['hours_worked'] ?? 0),
            self::currencyValue($data['finance_currency'] ?? 'GHS'),
            self::dateValue($data['deadline'] ?? null),
            self::agentKeyValue($data['assigned_agent_key'] ?? null),
        ]);
        $projectId = (int) $pdo->lastInsertId();

        self::syncTags($pdo, $projectId, $data['tags'] ?? []);
        self::syncMilestones($pdo, $projectId, $milestones);

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
        $milestones = self::normalizeMilestones($data['milestones'] ?? []);
        $id = (int) $params['id'];

        $errors = Validator::validateProject($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();
        $clientId = self::validatedClientId($pdo, $data['client_id'] ?? null);

        $stmt = $pdo->prepare('SELECT is_published FROM projects WHERE id = ?');
        $stmt->execute([$id]);
        $wasPublished = (bool) $stmt->fetchColumn();

        $stmt = $pdo->prepare(
            "UPDATE projects SET client_id=?, slug=?, title=?, summary=?, case_study_body=?, category=?, live_url=?, repo_url=?,
             cover_image_path=?, gallery_json=?, is_embeddable=?, is_published=?, is_featured=?, sort_order=?,
             outcome_metrics=?, testimonial_id=?, delivery_status=?, progress_percent=?, contract_value=?, estimated_cost=?,
             actual_cost=?, hours_worked=?, finance_currency=?, deadline=?, assigned_agent_key=?, updated_at=datetime('now') WHERE id=?"
        );
        $stmt->execute([
            $clientId,
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
            $data['delivery_status'] ?? 'on_track',
            max(0, min(100, (int) ($data['progress_percent'] ?? 0))),
            self::moneyValue($data['contract_value'] ?? 0),
            self::moneyValue($data['estimated_cost'] ?? 0),
            self::moneyValue($data['actual_cost'] ?? 0),
            self::hoursValue($data['hours_worked'] ?? 0),
            self::currencyValue($data['finance_currency'] ?? 'GHS'),
            self::dateValue($data['deadline'] ?? null),
            self::agentKeyValue($data['assigned_agent_key'] ?? null),
            $id,
        ]);

        self::syncTags($pdo, $id, $data['tags'] ?? []);
        self::syncMilestones($pdo, $id, $milestones);

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

    private static function validatedClientId(\PDO $pdo, mixed $value): ?int
    {
        if ($value === null || $value === '') return null;
        $id = (int) $value;
        if ($id < 1) Response::error('Invalid client.', 422);
        $stmt = $pdo->prepare('SELECT id FROM clients WHERE id=?');
        $stmt->execute([$id]);
        if (!$stmt->fetchColumn()) Response::error('Selected client no longer exists.', 422);
        return $id;
    }

    private static function moneyValue(mixed $value): int
    {
        if (!is_numeric($value) || (float) $value < 0 || (float) $value > 999999999) {
            Response::error('Project financial amounts must be valid positive numbers.', 422);
        }
        return (int) round((float) $value * 100);
    }

    private static function hoursValue(mixed $value): float
    {
        if (!is_numeric($value) || (float) $value < 0 || (float) $value > 100000) {
            Response::error('Hours worked must be a valid positive number.', 422);
        }
        return round((float) $value, 2);
    }

    private static function currencyValue(mixed $value): string
    {
        $currency = strtoupper(trim((string) $value));
        if (!preg_match('/^[A-Z]{3}$/', $currency)) Response::error('Choose a valid project currency.', 422);
        return $currency;
    }

    private static function attachFinanceMetrics(array &$project): void
    {
        $value = (int) ($project['contract_value'] ?? 0);
        $actual = (int) ($project['actual_cost'] ?? 0);
        $profit = $value - $actual;
        $project['profit'] = $profit;
        $project['margin_percent'] = $value > 0 ? round(($profit / $value) * 100, 1) : null;
        $project['cost_variance'] = (int) ($project['estimated_cost'] ?? 0) - $actual;
    }

    private static function attachOperations(\PDO $pdo, array $projects): array
    {
        if (!$projects) return $projects;
        $ids = array_column($projects, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT * FROM project_milestones WHERE project_id IN ($placeholders) ORDER BY sort_order,id");
        $stmt->execute($ids);
        $byProject = [];
        foreach ($stmt->fetchAll() as $milestone) $byProject[$milestone['project_id']][] = $milestone;
        $today = date('Y-m-d');
        foreach ($projects as &$project) {
            $project['milestones'] = $byProject[$project['id']] ?? [];
            $project['overdue_milestones'] = count(array_filter($project['milestones'], fn($m) => !$m['is_completed'] && $m['due_date'] && $m['due_date'] < $today));
            $project['is_overdue'] = !empty($project['deadline']) && $project['deadline'] < $today && (int) $project['progress_percent'] < 100;
        }
        return $projects;
    }

    private static function normalizeMilestones(mixed $value): array
    {
        if (!is_array($value) || count($value) > 50) Response::error('Milestones must be a list of up to 50 items.', 422);
        $out = [];
        foreach ($value as $index => $item) {
            if (!is_array($item)) Response::error('Invalid milestone.', 422);
            $title = trim((string) ($item['title'] ?? ''));
            if ($title === '' || mb_strlen($title) > 160) Response::error('Each milestone needs a title under 160 characters.', 422);
            $out[] = ['id' => max(0, (int) ($item['id'] ?? 0)), 'title' => $title, 'due_date' => self::dateValue($item['due_date'] ?? null), 'is_completed' => !empty($item['is_completed']) ? 1 : 0, 'sort_order' => $index];
        }
        return $out;
    }

    private static function syncMilestones(\PDO $pdo, int $projectId, array $milestones): void
    {
        $existingStmt = $pdo->prepare('SELECT id FROM project_milestones WHERE project_id=?');
        $existingStmt->execute([$projectId]);
        $existing = array_map('intval', $existingStmt->fetchAll(\PDO::FETCH_COLUMN));
        $kept = [];
        $update = $pdo->prepare("UPDATE project_milestones SET title=?,due_date=?,is_completed=?,sort_order=?,completed_at=CASE WHEN ?=1 AND is_completed=0 THEN datetime('now') WHEN ?=0 THEN NULL ELSE completed_at END,updated_at=datetime('now') WHERE id=? AND project_id=?");
        $insert = $pdo->prepare("INSERT INTO project_milestones (project_id,title,due_date,is_completed,sort_order,completed_at) VALUES (?,?,?,?,?,CASE WHEN ?=1 THEN datetime('now') ELSE NULL END)");
        foreach ($milestones as $item) {
            if ($item['id'] > 0 && in_array($item['id'], $existing, true)) {
                $update->execute([$item['title'], $item['due_date'], $item['is_completed'], $item['sort_order'], $item['is_completed'], $item['is_completed'], $item['id'], $projectId]);
                $kept[] = $item['id'];
            } else {
                $insert->execute([$projectId, $item['title'], $item['due_date'], $item['is_completed'], $item['sort_order'], $item['is_completed']]);
                $kept[] = (int) $pdo->lastInsertId();
            }
        }
        foreach (array_diff($existing, $kept) as $id) $pdo->prepare('DELETE FROM project_milestones WHERE id=? AND project_id=?')->execute([$id, $projectId]);
    }

    private static function dateValue(mixed $value): ?string
    {
        $date = trim((string) ($value ?? ''));
        if ($date === '') return null;
        $parsed = \DateTimeImmutable::createFromFormat('!Y-m-d', $date);
        if (!$parsed || $parsed->format('Y-m-d') !== $date) Response::error('Choose a valid date.', 422);
        return $date;
    }

    private static function agentKeyValue(mixed $value): ?string
    {
        $key = trim((string) ($value ?? ''));
        if ($key === '') return null;
        if (!in_array($key, ['lisa','nurturer','beacon','dossier','proposal','content','arch'], true)) Response::error('Choose a valid AI agent.', 422);
        return $key;
    }

    private static function removePrivateFinance(array &$project): void
    {
        unset(
            $project['contract_value'], $project['estimated_cost'], $project['actual_cost'],
            $project['hours_worked'], $project['finance_currency'], $project['deadline'], $project['assigned_agent_key']
        );
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
