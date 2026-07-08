<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Audit trail for admin actions (deletes, status changes, price/content
 * edits). Called from controllers right after AuthMiddleware::requireAuth(),
 * passing that same user row through so the log captures who acted even if
 * the account is later deactivated (user_email is denormalized for that).
 * Never throws — a logging failure should never block the admin action
 * that triggered it.
 */
class ActivityLog
{
    public static function log(
        array $user,
        string $action,
        string $entityType,
        string|int|null $entityId = null,
        ?string $entityLabel = null,
        ?array $details = null
    ): void {
        try {
            Database::get()->prepare(
                'INSERT INTO admin_activity_log (user_id, user_email, action, entity_type, entity_id, entity_label, details)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $user['id'] ?? null,
                $user['email'] ?? null,
                $action,
                $entityType,
                $entityId !== null ? (string) $entityId : null,
                $entityLabel,
                $details !== null ? json_encode($details) : null,
            ]);
        } catch (\Throwable $e) {
            error_log('ActivityLog::log failed: ' . $e->getMessage());
        }
    }
}
