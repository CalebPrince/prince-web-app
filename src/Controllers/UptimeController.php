<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Database;
use App\Support\Response;

/**
 * Uptime monitors for client sites. The actual pinging happens in
 * database/check_uptime.php on a cron — this controller only manages the
 * monitor list and reads results. Uptime percentages are computed from
 * uptime_checks on demand; at one check per ~5 minutes the 30-day window
 * is small enough that no rollup table is needed.
 */
class UptimeController
{
    /** GET /api/v1/admin/uptime */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $monitors = $pdo->query(
            'SELECT m.*, c.name AS client_name
             FROM uptime_monitors m
             LEFT JOIN clients c ON c.id = m.client_id
             ORDER BY m.created_at ASC'
        )->fetchAll();

        foreach ($monitors as &$monitor) {
            $monitor = array_merge($monitor, self::stats($pdo, (int) $monitor['id']));
        }
        unset($monitor);

        Response::json($monitors);
    }

    /** GET /api/v1/admin/uptime/{id}/checks — recent history for charts */
    public static function checks(array $params): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare(
            "SELECT status, http_status, response_time_ms, checked_at
             FROM uptime_checks
             WHERE monitor_id = ? AND checked_at >= datetime('now', '-1 day')
             ORDER BY checked_at ASC"
        );
        $stmt->execute([(int) $params['id']]);
        Response::json($stmt->fetchAll());
    }

    /** POST /api/v1/admin/uptime — body: {name, url, client_id?} */
    public static function store(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $name = trim((string) ($data['name'] ?? ''));
        $url = trim((string) ($data['url'] ?? ''));
        $clientId = !empty($data['client_id']) ? (int) $data['client_id'] : null;

        $errors = [];
        if ($name === '') $errors[] = 'A name is required.';
        if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
            $errors[] = 'A valid http(s) URL is required.';
        }
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();
        $pdo->prepare('INSERT INTO uptime_monitors (name, url, client_id) VALUES (?, ?, ?)')
            ->execute([$name, $url, $clientId]);

        ActivityLog::log($user, 'created', 'uptime_monitor', (string) $pdo->lastInsertId(), $name, ['url' => $url]);
        Response::json(['status' => 'created'], 201);
    }

    /** PATCH /api/v1/admin/uptime/{id} — body: {name?, url?, client_id?, is_active?} */
    public static function update(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM uptime_monitors WHERE id = ?');
        $stmt->execute([(int) $params['id']]);
        $monitor = $stmt->fetch();
        if (!$monitor) {
            Response::error('Monitor not found.', 404);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $fields = [];
        $values = [];
        if (array_key_exists('name', $data) && trim((string) $data['name']) !== '') {
            $fields[] = 'name = ?';
            $values[] = trim((string) $data['name']);
        }
        if (array_key_exists('url', $data)) {
            $url = trim((string) $data['url']);
            if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
                Response::error('A valid http(s) URL is required.', 422);
            }
            $fields[] = 'url = ?';
            $values[] = $url;
        }
        if (array_key_exists('client_id', $data)) {
            $fields[] = 'client_id = ?';
            $values[] = !empty($data['client_id']) ? (int) $data['client_id'] : null;
        }
        if (array_key_exists('is_active', $data)) {
            $fields[] = 'is_active = ?';
            $values[] = !empty($data['is_active']) ? 1 : 0;
        }
        if (!$fields) {
            Response::error('Nothing to update.', 422);
        }

        $values[] = $monitor['id'];
        $pdo->prepare('UPDATE uptime_monitors SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);

        ActivityLog::log($user, 'updated', 'uptime_monitor', (string) $monitor['id'], $monitor['name']);
        Response::json(['status' => 'updated']);
    }

    /** DELETE /api/v1/admin/uptime/{id} */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT name FROM uptime_monitors WHERE id = ?');
        $stmt->execute([(int) $params['id']]);
        $monitor = $stmt->fetch();
        if (!$monitor) {
            Response::error('Monitor not found.', 404);
        }

        $pdo->prepare('DELETE FROM uptime_monitors WHERE id = ?')->execute([(int) $params['id']]);
        ActivityLog::log($user, 'deleted', 'uptime_monitor', $params['id'], $monitor['name']);
        Response::json(['status' => 'deleted']);
    }

    /**
     * Uptime % + average response time over a window, shared by the admin
     * page and the client portal widget.
     *
     * @return array{uptime_24h: ?float, uptime_30d: ?float, avg_response_ms: ?int}
     */
    public static function stats(\PDO $pdo, int $monitorId): array
    {
        $out = [];
        foreach (['uptime_24h' => '-1 day', 'uptime_30d' => '-30 days'] as $key => $window) {
            $stmt = $pdo->prepare(
                "SELECT COUNT(*) AS total, SUM(status = 'up') AS up
                 FROM uptime_checks WHERE monitor_id = ? AND checked_at >= datetime('now', ?)"
            );
            $stmt->execute([$monitorId, $window]);
            $row = $stmt->fetch();
            $out[$key] = ((int) $row['total']) > 0 ? round(100 * (int) $row['up'] / (int) $row['total'], 2) : null;
        }

        $stmt = $pdo->prepare(
            "SELECT AVG(response_time_ms) FROM uptime_checks
             WHERE monitor_id = ? AND status = 'up' AND checked_at >= datetime('now', '-1 day')"
        );
        $stmt->execute([$monitorId]);
        $avg = $stmt->fetchColumn();
        $out['avg_response_ms'] = $avg !== null && $avg !== false ? (int) round((float) $avg) : null;

        return $out;
    }
}
