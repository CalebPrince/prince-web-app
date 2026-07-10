<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;

class ActivityLogController
{
    private const PER_PAGE = 10;

    /** GET /api/v1/admin/activity-log?entity_type=&action=&page= */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $where = [];
        $params = [];
        if (!empty($_GET['entity_type'])) {
            $where[] = 'entity_type = ?';
            $params[] = $_GET['entity_type'];
        }
        if (!empty($_GET['action'])) {
            $where[] = 'action = ?';
            $params[] = $_GET['action'];
        }
        $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $offset = ($page - 1) * self::PER_PAGE;

        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM admin_activity_log{$whereSql}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $pdo->prepare(
            "SELECT * FROM admin_activity_log{$whereSql} ORDER BY created_at DESC, id DESC LIMIT " . self::PER_PAGE . " OFFSET {$offset}"
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        Response::json([
            'rows' => $rows,
            'total' => $total,
            'page' => $page,
            'per_page' => self::PER_PAGE,
        ]);
    }

    /** GET /api/v1/admin/activity-log/entity-types — distinct values for the filter dropdown */
    public static function entityTypes(): void
    {
        AuthMiddleware::requireAuth();
        $rows = Database::get()
            ->query('SELECT DISTINCT entity_type FROM admin_activity_log ORDER BY entity_type ASC')
            ->fetchAll(\PDO::FETCH_COLUMN);
        Response::json($rows);
    }
}
