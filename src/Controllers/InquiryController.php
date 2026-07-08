<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\Database;
use App\Support\Response;
use App\Support\Validator;

class InquiryController
{
    /** POST /api/v1/inquiries — public, honeypot + rate-limited + validated */
    public static function create(): void
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        $config = appConfig();
        RateLimitMiddleware::enforce('contact', $config['contact_rate_limit']);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        // Honeypot: a hidden field real users never fill in. If it has a value, silently
        // pretend success so bots don't learn their submission was rejected.
        if (!empty($data['website'])) {
            Response::json(['status' => 'received'], 201);
        }

        $errors = Validator::validateInquiry($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare(
            'INSERT INTO inquiries (name, email, message, source_project_id, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            trim($data['name']),
            trim($data['email']),
            trim($data['message']),
            !empty($data['source_project_id']) ? (int) $data['source_project_id'] : null,
            $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            $_SERVER['HTTP_USER_AGENT'] ?? null,
        ]);
        $inquiryId = (int) $pdo->lastInsertId();

        $pdo->prepare('INSERT INTO webhook_queue (inquiry_id) VALUES (?)')->execute([$inquiryId]);

        Response::json(['status' => 'received'], 201);
    }

    /** GET /api/v1/admin/inquiries?status=unread&type=project_request&pipeline_stage=won */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $status = $_GET['status'] ?? null;
        $type = $_GET['type'] ?? null;
        $pipelineStage = $_GET['pipeline_stage'] ?? null;

        $select = "SELECT i.*, wq.status AS notify_status, wq.attempts AS notify_attempts,
                          wq.slack_sent, wq.email_sent
                   FROM inquiries i
                   LEFT JOIN webhook_queue wq ON wq.inquiry_id = i.id";

        $where = [];
        $params = [];
        if ($status) {
            $where[] = 'i.status = ?';
            $params[] = $status;
        }
        if ($type) {
            $where[] = 'i.type = ?';
            $params[] = $type;
        }
        if ($pipelineStage) {
            $where[] = 'i.pipeline_stage = ?';
            $params[] = $pipelineStage;
        }

        $sql = $select . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY i.created_at DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        Response::json($stmt->fetchAll());
    }

    /** GET /api/v1/admin/inquiries/export?type=contact — CSV download */
    public static function exportCsv(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $type = $_GET['type'] ?? null;

        $sql = 'SELECT name, email, message, type, project_type, budget, timeline, features, status, pipeline_stage, created_at FROM inquiries';
        if ($type) {
            $stmt = $pdo->prepare("$sql WHERE type = ? ORDER BY created_at DESC");
            $stmt->execute([$type]);
        } else {
            $stmt = $pdo->query("$sql ORDER BY created_at DESC");
        }
        $rows = $stmt->fetchAll();

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="inquiries-' . date('Y-m-d') . '.csv"');

        $out = fopen('php://output', 'w');
        fputcsv($out, ['Name', 'Email', 'Message', 'Type', 'Project Type', 'Budget', 'Timeline', 'Features', 'Status', 'Pipeline Stage', 'Created At'], ',', '"', '\\');
        foreach ($rows as $row) {
            fputcsv($out, [
                $row['name'], $row['email'], $row['message'], $row['type'],
                $row['project_type'], $row['budget'], $row['timeline'], $row['features'],
                $row['status'], $row['pipeline_stage'], $row['created_at'],
            ], ',', '"', '\\');
        }
        fclose($out);
        exit;
    }

    /** PATCH /api/v1/admin/inquiries/{id} — body: {status?, pipeline_stage?} */
    public static function updateStatus(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $fields = [];
        $values = [];
        if (array_key_exists('status', $data)) {
            if (!in_array($data['status'], ['unread', 'read', 'flagged', 'archived'], true)) {
                Response::error('Invalid status', 422);
            }
            $fields[] = 'status = ?';
            $values[] = $data['status'];
        }
        if (array_key_exists('pipeline_stage', $data)) {
            if (!in_array($data['pipeline_stage'], ['new', 'reviewing', 'proposal_sent', 'won', 'lost'], true)) {
                Response::error('Invalid pipeline stage', 422);
            }
            $fields[] = 'pipeline_stage = ?';
            $values[] = $data['pipeline_stage'];
        }
        if (!$fields) {
            Response::error('Nothing to update.', 422);
        }

        $values[] = (int) $params['id'];
        $pdo = Database::get();
        $pdo->prepare('UPDATE inquiries SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);

        Response::json(['status' => 'updated']);
    }
}
