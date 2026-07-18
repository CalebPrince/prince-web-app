<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Automations;
use App\Support\ActivityLog;
use App\Support\Database;
use App\Support\Response;

/**
 * CRUD for email automations — the named, trigger-driven sequences that
 * replaced the single global drip. Each automation owns a set of drip_steps
 * (managed via DripController) and, when active, auto-enrolls contacts whose
 * trigger event fires (see App\Support\Automations::fire). The steps and the
 * enrollments a contact runs through are all keyed by automation_id.
 *
 * is_active is the master switch: it gates both new trigger enrollment and
 * whether this automation's steps send at all, so a half-written automation
 * sits inert until it's switched on.
 */
class AutomationController
{
    /** GET /api/v1/admin/automations */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            "SELECT a.*,
                    (SELECT COUNT(*) FROM drip_steps s WHERE s.automation_id = a.id) AS step_count,
                    (SELECT COUNT(*) FROM drip_steps s WHERE s.automation_id = a.id AND s.is_active = 1) AS active_step_count,
                    (SELECT COUNT(*) FROM drip_enrollments e WHERE e.automation_id = a.id) AS enrollment_count,
                    (SELECT COUNT(*) FROM drip_enrollments e WHERE e.automation_id = a.id AND e.status = 'active') AS active_enrollment_count
             FROM automations a ORDER BY a.id ASC"
        )->fetchAll();
        Response::json($rows);
    }

    /** POST /api/v1/admin/automations — body: {name, description?, trigger_event, is_active?} */
    public static function store(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        [$fields, $errors] = self::validate($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo = Database::get();
        $pdo->prepare('INSERT INTO automations (name, description, trigger_event, is_active, nurturer_enabled) VALUES (?, ?, ?, ?, ?)')
            ->execute([$fields['name'], $fields['description'], $fields['trigger_event'], $fields['is_active'], $fields['nurturer_enabled']]);

        $id = (string) $pdo->lastInsertId();
        ActivityLog::log($user, 'created', 'automation', $id, $fields['name']);
        Response::json(['status' => 'created', 'id' => (int) $id], 201);
    }

    /** PUT /api/v1/admin/automations/{id} */
    public static function update(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM automations WHERE id = ?');
        $stmt->execute([(int) $params['id']]);
        $automation = $stmt->fetch();
        if (!$automation) {
            Response::error('Automation not found.', 404);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        [$fields, $errors] = self::validate($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $pdo->prepare(
            "UPDATE automations SET name = ?, description = ?, trigger_event = ?, is_active = ?, nurturer_enabled = ?, updated_at = datetime('now') WHERE id = ?"
        )->execute([$fields['name'], $fields['description'], $fields['trigger_event'], $fields['is_active'], $fields['nurturer_enabled'], $automation['id']]);

        ActivityLog::log($user, 'updated', 'automation', (string) $automation['id'], $fields['name']);
        Response::json(['status' => 'updated']);
    }

    /**
     * PATCH /api/v1/admin/automations/{id} — partial update, for flipping just
     * is_active (the "pause/activate" toggle) without resending name/trigger.
     */
    public static function patch(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $set = [];
        $values = [];
        if (array_key_exists('is_active', $data)) {
            $set[] = 'is_active = ?';
            $values[] = !empty($data['is_active']) ? 1 : 0;
        }
        if (array_key_exists('nurturer_enabled', $data)) {
            $set[] = 'nurturer_enabled = ?';
            $values[] = !empty($data['nurturer_enabled']) ? 1 : 0;
        }
        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            if ($name === '') {
                Response::error('Name cannot be empty.', 422);
            }
            $set[] = 'name = ?';
            $values[] = $name;
        }
        if (array_key_exists('description', $data)) {
            $set[] = 'description = ?';
            $values[] = trim((string) $data['description']) ?: null;
        }
        if (!$set) {
            Response::error('Nothing to update — send is_active, name or description.', 422);
        }

        $set[] = "updated_at = datetime('now')";
        $values[] = (int) $params['id'];
        $pdo = Database::get();
        $stmt = $pdo->prepare('UPDATE automations SET ' . implode(', ', $set) . ' WHERE id = ?');
        $stmt->execute($values);
        if ($stmt->rowCount() === 0) {
            Response::error('Automation not found.', 404);
        }

        ActivityLog::log($user, 'updated', 'automation', $params['id']);
        Response::json(['status' => 'updated']);
    }

    /** DELETE /api/v1/admin/automations/{id} — cascades to its steps and enrollments. */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT name FROM automations WHERE id = ?');
        $stmt->execute([(int) $params['id']]);
        $automation = $stmt->fetch();
        if (!$automation) {
            Response::error('Automation not found.', 404);
        }

        // FK ON DELETE CASCADE clears drip_steps + drip_enrollments (and, via
        // drip_enrollments, their drip_sends/nurturer_sends) — but only if this
        // connection has foreign keys enforced, which isn't guaranteed. Delete
        // the children explicitly so a deleted automation can never strand rows.
        $pdo->prepare('DELETE FROM drip_steps WHERE automation_id = ?')->execute([(int) $params['id']]);
        $pdo->prepare('DELETE FROM drip_enrollments WHERE automation_id = ?')->execute([(int) $params['id']]);
        $pdo->prepare('DELETE FROM automations WHERE id = ?')->execute([(int) $params['id']]);

        ActivityLog::log($user, 'deleted', 'automation', $params['id'], $automation['name']);
        Response::json(['status' => 'deleted']);
    }

    /**
     * @return array{0: array<string,mixed>, 1: list<string>}
     */
    private static function validate(array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        $description = trim((string) ($data['description'] ?? '')) ?: null;
        $trigger = trim((string) ($data['trigger_event'] ?? 'manual'));
        $isActive = !empty($data['is_active']) ? 1 : 0;
        $nurturerEnabled = !empty($data['nurturer_enabled']) ? 1 : 0;

        $errors = [];
        if ($name === '') {
            $errors[] = 'Name is required.';
        }
        if (!in_array($trigger, Automations::TRIGGERS, true)) {
            $errors[] = 'Unknown trigger event.';
        }

        return [
            [
                'name' => $name, 'description' => $description, 'trigger_event' => $trigger,
                'is_active' => $isActive, 'nurturer_enabled' => $nurturerEnabled,
            ],
            $errors,
        ];
    }
}
