<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Database;
use App\Support\GrowthAuditor;
use App\Support\Response;

/**
 * Admin-only "run the Free Growth Roadmap audit for real" tool — see
 * GrowthAuditor for what it actually checks. Exists so Caleb can run the
 * same audit he's selling clients against any real URL, starting with his
 * own site, before pitching it. Decoupled from marketing_leads on purpose:
 * a run here isn't a sales lead, it's a report.
 */
class GrowthRoadmapController
{
    /** POST /api/v1/admin/growth-roadmap — body: {url} */
    public static function generate(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $url = trim((string) ($data['url'] ?? ''));
        if ($url === '') {
            Response::error('A URL is required.', 422);
        }
        if (!preg_match('#^https?://#i', $url)) {
            $url = 'https://' . $url;
        }
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            Response::error('That does not look like a valid URL.', 422);
        }

        $result = GrowthAuditor::run($url);

        $pdo = Database::get();
        $stmt = $pdo->prepare(
            'INSERT INTO growth_roadmap_runs (url, final_url, reachable, score, signals, findings, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $url,
            $result['final_url'],
            $result['reachable'] ? 1 : 0,
            $result['findings']['score'] ?? null,
            json_encode($result['signals']),
            $result['findings'] !== null ? json_encode($result['findings']) : null,
            $user['id'],
        ]);
        $id = (int) $pdo->lastInsertId();

        ActivityLog::log($user, 'ran_growth_roadmap', 'growth_roadmap_run', $id, $url);

        Response::json(array_merge(['id' => $id], $result), 201);
    }

    /** GET /api/v1/admin/growth-roadmap — recent run history */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            'SELECT id, url, final_url, reachable, score, created_at FROM growth_roadmap_runs
             ORDER BY created_at DESC LIMIT 50'
        )->fetchAll();
        Response::json($rows);
    }

    /** GET /api/v1/admin/growth-roadmap/{id} — full signals + findings for one run */
    public static function show(array $params): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM growth_roadmap_runs WHERE id = ?');
        $stmt->execute([(int) $params['id']]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Run not found.', 404);
        }

        $row['signals'] = json_decode($row['signals'], true);
        $row['findings'] = $row['findings'] !== null ? json_decode($row['findings'], true) : null;
        Response::json($row);
    }

    /** DELETE /api/v1/admin/growth-roadmap/{id} */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) $params['id'];

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT url FROM growth_roadmap_runs WHERE id = ?');
        $stmt->execute([$id]);
        $url = $stmt->fetchColumn();
        if ($url === false) {
            Response::error('Run not found.', 404);
        }

        $pdo->prepare('DELETE FROM growth_roadmap_runs WHERE id = ?')->execute([$id]);
        ActivityLog::log($user, 'deleted', 'growth_roadmap_run', $id, $url ?: null);
        Response::json(['status' => 'deleted']);
    }
}
