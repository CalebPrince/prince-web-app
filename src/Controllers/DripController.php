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
    /** GET /api/v1/admin/drip/steps?automation_id=N — omit the filter for every automation's steps. */
    public static function steps(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $automationId = isset($_GET['automation_id']) ? (int) $_GET['automation_id'] : null;
        $where = $automationId !== null ? 'WHERE s.automation_id = ?' : '';
        $stmt = $pdo->prepare(
            "SELECT s.*, (SELECT COUNT(*) FROM drip_sends ds WHERE ds.step_id = s.id) AS sent_count
             FROM drip_steps s {$where} ORDER BY s.automation_id ASC, s.day_offset ASC, s.id ASC"
        );
        $stmt->execute($automationId !== null ? [$automationId] : []);
        Response::json($stmt->fetchAll());
    }

    /** POST /api/v1/admin/drip/steps — body: {automation_id, day_offset, subject, body, is_active?} */
    public static function storeStep(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        [$fields, $errors] = self::validateStep($data);

        $pdo = Database::get();
        $automationId = (int) ($data['automation_id'] ?? 0);
        $exists = $pdo->prepare('SELECT 1 FROM automations WHERE id = ?');
        $exists->execute([$automationId]);
        if (!$exists->fetchColumn()) {
            $errors[] = 'A valid automation_id is required.';
        }
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo->prepare('INSERT INTO drip_steps (automation_id, day_offset, subject, body, is_active) VALUES (?, ?, ?, ?, ?)')
            ->execute([$automationId, $fields['day_offset'], $fields['subject'], $fields['body'], $fields['is_active']]);

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

    /** GET /api/v1/admin/drip/enrollments?automation_id=N&email=... — omit either filter for a broader match. */
    public static function enrollments(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $automationId = isset($_GET['automation_id']) ? (int) $_GET['automation_id'] : null;
        $email = isset($_GET['email']) ? trim((string) $_GET['email']) : '';

        $conditions = [];
        $args = [];
        if ($automationId !== null) {
            $conditions[] = 'e.automation_id = ?';
            $args[] = $automationId;
        }
        if ($email !== '') {
            $conditions[] = 'lower(e.email) = lower(?)';
            $args[] = $email;
        }
        $where = $conditions ? 'WHERE ' . implode(' AND ', $conditions) : '';

        $stmt = $pdo->prepare(
            "SELECT e.*, a.name AS automation_name,
                    (SELECT COUNT(*) FROM drip_sends ds WHERE ds.enrollment_id = e.id) AS steps_received,
                    (SELECT MAX(ds.sent_at) FROM drip_sends ds WHERE ds.enrollment_id = e.id) AS last_sent_at
             FROM drip_enrollments e
             JOIN automations a ON a.id = e.automation_id
             {$where} ORDER BY e.enrolled_at DESC"
        );
        $stmt->execute($args);
        Response::json($stmt->fetchAll());
    }

    /** POST /api/v1/admin/drip/enrollments — body: {automation_id?, email, name?, lead_industry?, last_action?, nurturer_enabled?} */
    public static function enroll(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $automationId = (int) ($data['automation_id'] ?? 1);
        $email = trim((string) ($data['email'] ?? ''));
        $name = trim((string) ($data['name'] ?? '')) ?: null;
        $leadIndustry = trim((string) ($data['lead_industry'] ?? '')) ?: null;
        $lastAction = trim((string) ($data['last_action'] ?? '')) ?: null;
        $nurturerEnabled = !empty($data['nurturer_enabled']);

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('A valid email is required.', 422);
        }

        $pdo = Database::get();
        $exists = $pdo->prepare('SELECT 1 FROM automations WHERE id = ?');
        $exists->execute([$automationId]);
        if (!$exists->fetchColumn()) {
            Response::error('A valid automation_id is required.', 422);
        }

        $created = self::enrollEmail($pdo, $automationId, $email, $name, 'manual', null, $nurturerEnabled, $leadIndustry, $lastAction);
        if (!$created) {
            Response::error('That email is already enrolled in this automation.', 422);
        }

        ActivityLog::log($user, 'enrolled', 'drip_enrollment', $email, $name ?: $email);
        Response::json(['status' => 'enrolled'], 201);
    }

    /** PATCH /api/v1/admin/drip/enrollments/{id} — body: {status: 'active'|'stopped'} */
    /**
     * Partial update: send only the fields you're changing. It used to take
     * status and nothing else, which meant an enrollment created without
     * Nurturer could never be opted in — and since the automated path creates
     * every lead that way, that was all of them, short of hand-written SQL.
     */
    public static function updateEnrollment(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $fields = [];
        $values = [];

        if (array_key_exists('status', $data)) {
            if (!in_array($data['status'], ['active', 'stopped'], true)) {
                Response::error('Status must be active or stopped.', 422);
            }
            $fields[] = 'status = ?';
            $values[] = $data['status'];
        }
        if (array_key_exists('nurturer_enabled', $data)) {
            $fields[] = 'nurturer_enabled = ?';
            $values[] = !empty($data['nurturer_enabled']) ? 1 : 0;
        }
        if (array_key_exists('lead_industry', $data)) {
            $fields[] = 'lead_industry = ?';
            $values[] = trim((string) $data['lead_industry']) ?: null;
        }
        if (array_key_exists('last_action', $data)) {
            $fields[] = 'last_action = ?';
            $values[] = trim((string) $data['last_action']) ?: null;
        }

        if (!$fields) {
            Response::error('Nothing to update — send status, nurturer_enabled, lead_industry or last_action.', 422);
        }

        $values[] = (int) $params['id'];
        $pdo = Database::get();
        $stmt = $pdo->prepare('UPDATE drip_enrollments SET ' . implode(', ', $fields) . ' WHERE id = ?');
        $stmt->execute($values);
        if ($stmt->rowCount() === 0) {
            Response::error('Enrollment not found.', 404);
        }
        Response::json(['status' => 'updated']);
    }

    /** DELETE /api/v1/admin/drip/enrollments/{id} */
    public static function destroyEnrollment(array $params): void
    {
        AuthMiddleware::requireAuth();
        Database::get()->prepare('DELETE FROM drip_enrollments WHERE id = ?')->execute([(int) $params['id']]);
        Response::json(['status' => 'deleted']);
    }

    /** GET /api/v1/admin/drip/nurturer-sends — AI-personalized sends, for the "AI Sends" tab. */
    public static function nurturerSends(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            'SELECT ns.*, e.email, e.name
             FROM nurturer_sends ns
             JOIN drip_enrollments e ON e.id = ns.enrollment_id
             ORDER BY ns.sent_at DESC LIMIT 100'
        )->fetchAll();
        Response::json($rows);
    }

    /** GET /api/v1/drip/unsubscribe?token=... — public, linked from every drip email */
    public static function unsubscribe(): void
    {
        $token = trim((string) ($_GET['token'] ?? ''));
        if ($token !== '') {
            // One unsubscribe click stops this person everywhere, not just the
            // one automation the link came from — a contact can now be enrolled
            // in several at once, and "no longer interested" means all of them.
            // Look up the email behind the token, then stop every enrollment for
            // it (their other automations each have their own token, so a
            // token-only update would leave those quietly still sending).
            $pdo = Database::get();
            $stmt = $pdo->prepare('SELECT email FROM drip_enrollments WHERE unsubscribe_token = ?');
            $stmt->execute([$token]);
            $email = $stmt->fetchColumn();
            if ($email !== false) {
                $pdo->prepare("UPDATE drip_enrollments SET status = 'stopped' WHERE email = ?")->execute([$email]);
            }
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
    /**
     * Nurturer fields are parameters rather than defaults because this is the
     * automated path (markSent), and it used to set none of them — so every
     * auto-enrolled lead was stuck at nurturer_enabled = 0 with no industry or
     * last action, i.e. permanently excluded from Nurturer. The whole outbound
     * pipeline bypassed it, and only hand-typed enrollments ever got an AI
     * follow-up.
     */
    public static function enrollEmail(
        \PDO $pdo,
        int $automationId,
        string $email,
        ?string $name,
        string $source,
        ?int $leadId,
        bool $nurturerEnabled = false,
        ?string $leadIndustry = null,
        ?string $lastAction = null
    ): bool {
        $stmt = $pdo->prepare(
            'INSERT OR IGNORE INTO drip_enrollments (automation_id, email, name, source, lead_id, unsubscribe_token, nurturer_enabled, lead_industry, last_action)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $automationId, strtolower($email), $name, $source, $leadId, bin2hex(random_bytes(16)),
            $nurturerEnabled ? 1 : 0, $leadIndustry, $lastAction,
        ]);
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
