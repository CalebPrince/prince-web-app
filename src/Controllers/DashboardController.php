<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;

class DashboardController
{
    /** GET /api/v1/admin/dashboard — stats + recent activity for the overview page */
    public static function overview(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $projects = $pdo->query(
            'SELECT COUNT(*) AS total, COALESCE(SUM(is_published), 0) AS published FROM projects'
        )->fetch();

        $inquiries = $pdo->query(
            "SELECT COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END), 0) AS unread,
                    COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END), 0) AS last_30_days
             FROM inquiries"
        )->fetch();

        $tagsInUse = (int) $pdo->query('SELECT COUNT(DISTINCT tag_id) FROM project_tags')->fetchColumn();
        $webhooksPending = (int) $pdo->query("SELECT COUNT(*) FROM webhook_queue WHERE status = 'pending'")->fetchColumn();
        $newChatFeedback = (int) $pdo->query(
            "SELECT COUNT(*) FROM chat_sessions
             WHERE admin_seen = 0
               AND (prototype_status IN ('approved', 'changes_requested') OR client_email IS NOT NULL)"
        )->fetchColumn();

        $recentInquiries = $pdo->query(
            'SELECT id, name, email, status, created_at FROM inquiries ORDER BY created_at DESC LIMIT 5'
        )->fetchAll();

        $draftProjects = $pdo->query(
            'SELECT id, title, updated_at FROM projects WHERE is_published = 0 ORDER BY updated_at DESC LIMIT 5'
        )->fetchAll();

        Response::json([
            'projects' => [
                'total' => (int) $projects['total'],
                'published' => (int) $projects['published'],
                'drafts' => (int) $projects['total'] - (int) $projects['published'],
            ],
            'inquiries' => [
                'total' => (int) $inquiries['total'],
                'unread' => (int) $inquiries['unread'],
                'last_30_days' => (int) $inquiries['last_30_days'],
            ],
            'tags_in_use' => $tagsInUse,
            'webhooks_pending' => $webhooksPending,
            'new_chat_feedback' => $newChatFeedback,
            'recent_inquiries' => $recentInquiries,
            'draft_projects' => $draftProjects,
        ]);
    }
}
