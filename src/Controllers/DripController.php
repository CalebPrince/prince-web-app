<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Database;
use App\Support\Response;

/**
 * A single global drip sequence: steps go out N days after enrollment,
 * sent by database/send_drip_emails.php on a cron. Enrollment happens
 * automatically when a marketing-lead pitch is sent (follow-up sequence)
 * or manually from the admin page. Steps are created inactive so nothing
 * emails anyone until the copy has been reviewed and switched on.
 */
class DripController
{
    /** GET /api/v1/admin/drip/steps */
    public static function steps(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            'SELECT s.*, (SELECT COUNT(*) FROM drip_sends ds WHERE ds.step_id = s.id) AS sent_count
             FROM drip_steps s ORDER BY s.day_offset ASC, s.id ASC'
        )->fetchAll();
        Response::json($rows);
    }

    /** POST /api/v1/admin/drip/steps — body: {day_offset, subject, body, is_active?} */
    public static function storeStep(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        [$fields, $errors] = self::validateStep($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();
        $pdo->prepare('INSERT INTO drip_steps (day_offset, subject, body, is_active) VALUES (?, ?, ?, ?)')
            ->execute([$fields['day_offset'], $fields['subject'], $fields['body'], $fields['is_active']]);

        ActivityLog::log($user, 'created', 'drip_step', (string) $pdo->lastInsertId(), $fields['subject']);
        Response::json(['status' => 'created'], 201);
    }

    /** PUT /api/v1/admin/drip/steps/{id} */
    public static function updateStep(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM drip_steps WHERE id = ?');
        $stmt->execute([(int) $params['id']]);
        $step = $stmt->fetch();
        if (!$step) {
            Response::error('Step not found.', 404);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        [$fields, $errors] = self::validateStep($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo->prepare("UPDATE drip_steps SET day_offset = ?, subject = ?, body = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?")
            ->execute([$fields['day_offset'], $fields['subject'], $fields['body'], $fields['is_active'], $step['id']]);

        ActivityLog::log($user, 'updated', 'drip_step', (string) $step['id'], $fields['subject']);
        Response::json(['status' => 'updated']);
    }

    /** DELETE /api/v1/admin/drip/steps/{id} */
    public static function destroyStep(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT subject FROM drip_steps WHERE id = ?');
        $stmt->execute([(int) $params['id']]);
        $step = $stmt->fetch();
        if (!$step) {
            Response::error('Step not found.', 404);
        }
        $pdo->prepare('DELETE FROM drip_steps WHERE id = ?')->execute([(int) $params['id']]);
        ActivityLog::log($user, 'deleted', 'drip_step', $params['id'], $step['subject']);
        Response::json(['status' => 'deleted']);
    }

    /** GET /api/v1/admin/drip/enrollments */
    public static function enrollments(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            'SELECT e.*,
                    (SELECT COUNT(*) FROM drip_sends ds WHERE ds.enrollment_id = e.id) AS steps_received,
                    (SELECT MAX(ds.sent_at) FROM drip_sends ds WHERE ds.enrollment_id = e.id) AS last_sent_at
             FROM drip_enrollments e ORDER BY e.enrolled_at DESC'
        )->fetchAll();
        Response::json($rows);
    }

    /** POST /api/v1/admin/drip/enrollments — body: {email, name?} */
    public static function enroll(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $email = trim((string) ($data['email'] ?? ''));
        $name = trim((string) ($data['name'] ?? '')) ?: null;

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('A valid email is required.', 422);
        }

        $created = self::enrollEmail(Database::get(), $email, $name, 'manual', null);
        if (!$created) {
            Response::error('That email is already enrolled.', 422);
        }

        ActivityLog::log($user, 'enrolled', 'drip_enrollment', $email, $name ?: $email);
        Response::json(['status' => 'enrolled'], 201);
    }

    /** PATCH /api/v1/admin/drip/enrollments/{id} — body: {status: 'active'|'stopped'} */
    public static function updateEnrollment(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $status = $data['status'] ?? '';
        if (!in_array($status, ['active', 'stopped'], true)) {
            Response::error('Status must be active or stopped.', 422);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('UPDATE drip_enrollments SET status = ? WHERE id = ?');
        $stmt->execute([$status, (int) $params['id']]);
        if ($stmt->rowCount() === 0) {
            Response::error('Enrollment not found.', 404);
        }
        Response::json(['status' => $status]);
    }

    /** DELETE /api/v1/admin/drip/enrollments/{id} */
    public static function destroyEnrollment(array $params): void
    {
        AuthMiddleware::requireAuth();
        Database::get()->prepare('DELETE FROM drip_enrollments WHERE id = ?')->execute([(int) $params['id']]);
        Response::json(['status' => 'deleted']);
    }

    /** GET /api/v1/drip/unsubscribe?token=... — public, linked from every drip email */
    public static function unsubscribe(): void
    {
        $token = trim((string) ($_GET['token'] ?? ''));
        if ($token !== '') {
            Database::get()->prepare("UPDATE drip_enrollments SET status = 'stopped' WHERE unsubscribe_token = ?")
                ->execute([$token]);
        }

        // Same landing page the newsletter uses — the message fits both.
        header('Location: /newsletter-unsubscribed.html');
        exit;
    }

    /**
     * Shared enrollment insert, also called from MarketingLeadController when
     * a pitch goes out. Returns false when the email is already enrolled
     * (whatever its status — someone who unsubscribed must never be
     * silently re-enrolled).
     */
    public static function enrollEmail(\PDO $pdo, string $email, ?string $name, string $source, ?int $leadId): bool
    {
        $stmt = $pdo->prepare(
            'INSERT OR IGNORE INTO drip_enrollments (email, name, source, lead_id, unsubscribe_token) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([strtolower($email), $name, $source, $leadId, bin2hex(random_bytes(16))]);
        return $stmt->rowCount() > 0;
    }

    /** @return array{0: array<string,mixed>, 1: list<string>} */
    private static function validateStep(array $data): array
    {
        $dayOffset = (int) ($data['day_offset'] ?? -1);
        $subject = trim((string) ($data['subject'] ?? ''));
        $body = trim((string) ($data['body'] ?? ''));
        $isActive = !empty($data['is_active']) ? 1 : 0;

        $errors = [];
        if ($dayOffset < 0) $errors[] = 'Day offset must be 0 or more (days after enrollment).';
        if ($subject === '') $errors[] = 'Subject is required.';
        if ($body === '') $errors[] = 'Body is required.';

        return [
            ['day_offset' => $dayOffset, 'subject' => $subject, 'body' => $body, 'is_active' => $isActive],
            $errors,
        ];
    }
}
