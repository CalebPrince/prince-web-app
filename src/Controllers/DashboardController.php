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

        $upcomingAppointments = $pdo->query(
            "SELECT id, client_name, appointment_date, appointment_time, topic FROM appointments
             WHERE status = 'confirmed' AND appointment_date >= date('now')
             ORDER BY appointment_date ASC, appointment_time ASC LIMIT 5"
        )->fetchAll();

        // Grouped by currency rather than summed outright — payment links can be
        // issued in a different currency than the site's default pricing_currency.
        $revenueByCurrency = $pdo->query(
            "SELECT currency, COALESCE(SUM(amount), 0) AS total FROM payments
             WHERE status = 'success' GROUP BY currency"
        )->fetchAll();
        $paymentsPending = (int) $pdo->query("SELECT COUNT(*) FROM payments WHERE status = 'pending'")->fetchColumn();
        $recentPayments = $pdo->query(
            'SELECT reference, email, customer_name, amount, currency, status, created_at
             FROM payments ORDER BY created_at DESC LIMIT 5'
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
            'payments' => [
                'revenue_by_currency' => array_map(
                    fn($r) => ['currency' => $r['currency'], 'total' => (int) $r['total']],
                    $revenueByCurrency
                ),
                'pending' => $paymentsPending,
            ],
            'recent_inquiries' => $recentInquiries,
            'draft_projects' => $draftProjects,
            'upcoming_appointments' => $upcomingAppointments,
            'recent_payments' => $recentPayments,
        ]);
    }

    /** GET /api/v1/admin/notifications — lightweight unread counts for the sidebar badges */
    public static function notifications(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $unreadInquiries = (int) $pdo->query(
            "SELECT COUNT(*) FROM inquiries WHERE status = 'unread'"
        )->fetchColumn();

        // Matches LiveChatController::adminIndex's own listing filter, so the
        // badge count always agrees with the "new" pills shown on that page.
        $unseenChats = (int) $pdo->query(
            "SELECT COUNT(*) FROM chat_sessions
             WHERE admin_seen = 0 AND (transcript_json != '[]' OR client_email IS NOT NULL)"
        )->fetchColumn();

        Response::json([
            'unread_inquiries' => $unreadInquiries,
            'unseen_chats' => $unseenChats,
        ]);
    }
}
