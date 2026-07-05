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

    /** GET /api/v1/admin/inquiries?status=unread */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $status = $_GET['status'] ?? null;

        if ($status) {
            $stmt = $pdo->prepare('SELECT * FROM inquiries WHERE status = ? ORDER BY created_at DESC');
            $stmt->execute([$status]);
        } else {
            $stmt = $pdo->query('SELECT * FROM inquiries ORDER BY created_at DESC');
        }

        Response::json($stmt->fetchAll());
    }

    /** PATCH /api/v1/admin/inquiries/{id} — body: {"status": "read"|"flagged"|"archived"} */
    public static function updateStatus(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $status = $data['status'] ?? '';

        if (!in_array($status, ['unread', 'read', 'flagged', 'archived'], true)) {
            Response::error('Invalid status', 422);
        }

        $pdo = Database::get();
        $pdo->prepare('UPDATE inquiries SET status = ? WHERE id = ?')
            ->execute([$status, (int) $params['id']]);

        Response::json(['status' => 'updated']);
    }
}
