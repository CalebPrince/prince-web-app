<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;

class DashboardController
{
    /**
     * GET /api/v1/health — lightweight public probe for uptime monitoring.
     * Reports DB connectivity, webhook-queue backlog, and which AI providers
     * are configured, without leaking any secret values. Returns 503 if the
     * database is unreachable so an external monitor can alert on it.
     */
    public static function health(): void
    {
        $dbOk = false;
        $queuePending = null;
        try {
            $pdo = Database::get();
            $pdo->query('SELECT 1');
            $dbOk = true;
            $queuePending = (int) $pdo->query("SELECT COUNT(*) FROM webhook_queue WHERE status = 'pending'")->fetchColumn();
        } catch (\Throwable $e) {
            $dbOk = false;
        }

        $providers = [
            'gemini' => !empty(Settings::get('gemini_api_key')),
            'openrouter' => !empty(Settings::get('openrouter_api_key')),
            'groq' => !empty(Settings::get('groq_api_key')),
        ];

        Response::json([
            'status' => $dbOk ? 'ok' : 'degraded',
            'database' => $dbOk,
            'webhook_queue_pending' => $queuePending,
            'ai_providers' => $providers,
            'ai_available' => in_array(true, $providers, true),
            'time' => date('c'),
        ], $dbOk ? 200 : 503);
    }

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

        // Abuse signal: the rate_limits table already buckets requests per
        // IP/endpoint/hour. Surface the last 24h so spikes and repeat
        // offenders are visible without digging into the DB. Wrapped in a
        // try/catch so a missing table on an older schema can't break the
        // whole dashboard.
        $rateLimit = ['window_hits' => 0, 'distinct_ips' => 0, 'top' => []];
        try {
            $rl = $pdo->query(
                "SELECT COALESCE(SUM(request_count), 0) AS hits, COUNT(DISTINCT ip_address) AS ips
                 FROM rate_limits WHERE window_start >= datetime('now', '-24 hours')"
            )->fetch();
            $rateLimit['window_hits'] = (int) ($rl['hits'] ?? 0);
            $rateLimit['distinct_ips'] = (int) ($rl['ips'] ?? 0);
            $rateLimit['top'] = $pdo->query(
                "SELECT ip_address, endpoint, SUM(request_count) AS hits
                 FROM rate_limits WHERE window_start >= datetime('now', '-24 hours')
                 GROUP BY ip_address, endpoint ORDER BY hits DESC LIMIT 5"
            )->fetchAll();
        } catch (\Throwable $e) {
            // older schema without rate_limits — leave the zeroed defaults
        }

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
            'rate_limit' => $rateLimit,
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

        $items = self::notificationItems($pdo);
        Response::json([
            'unread_inquiries' => $unreadInquiries,
            'unseen_chats' => $unseenChats,
            'total' => count($items),
            'items' => $items,
        ]);
    }

    public static function readNotification(array $params): void
    {
        AuthMiddleware::requireAuth();
        $key = rawurldecode((string) ($params['key'] ?? ''));
        if (!preg_match('/^[a-z_]+:\d+$/', $key)) Response::error('Invalid notification.', 422);
        $pdo = Database::get();
        $pdo->prepare("INSERT OR REPLACE INTO notification_reads (notification_key, read_at) VALUES (?, datetime('now'))")->execute([$key]);
        [$type, $id] = explode(':', $key, 2);
        if ($type === 'inquiry') $pdo->prepare("UPDATE inquiries SET status='read' WHERE id=? AND status='unread'")->execute([(int) $id]);
        if ($type === 'chat') $pdo->prepare('UPDATE chat_sessions SET admin_seen=1 WHERE id=?')->execute([(int) $id]);
        Response::json(['status' => 'read']);
    }

    public static function readAllNotifications(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $insert = $pdo->prepare("INSERT OR REPLACE INTO notification_reads (notification_key, read_at) VALUES (?, datetime('now'))");
        foreach (self::notificationItems($pdo) as $item) $insert->execute([$item['key']]);
        $pdo->exec("UPDATE inquiries SET status='read' WHERE status='unread'");
        $pdo->exec("UPDATE chat_sessions SET admin_seen=1 WHERE admin_seen=0 AND (transcript_json!='[]' OR client_email IS NOT NULL)");
        Response::json(['status' => 'read']);
    }

    private static function notificationItems(\PDO $pdo): array
    {
        $read = [];
        $exists = $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='notification_reads'")->fetchColumn();
        if ($exists) foreach ($pdo->query('SELECT notification_key FROM notification_reads') as $row) $read[$row['notification_key']] = true;
        $items = [];
        $add = static function (string $key, string $type, string $title, string $detail, string $href, string $date, string $level = 'info') use (&$items, $read): void {
            if (!isset($read[$key])) $items[] = compact('key', 'type', 'title', 'detail', 'href', 'date', 'level');
        };
        foreach ($pdo->query("SELECT id,name,email,message,type,created_at FROM inquiries WHERE status='unread'") as $r)
            $add('inquiry:'.$r['id'], 'Inquiry', $r['name'] ?: $r['email'], $r['message'], ($r['type']==='project_request'?'/admin/quote-requests.html':'/admin/inquiries.html').'?open='.$r['id'], $r['created_at']);
        foreach ($pdo->query("SELECT id,client_name,client_email,created_at,updated_at FROM chat_sessions WHERE admin_seen=0 AND (transcript_json!='[]' OR client_email IS NOT NULL)") as $r)
            $add('chat:'.$r['id'], 'Chat', $r['client_name'] ?: ($r['client_email'] ?: 'New chat activity'), 'A visitor has new chat activity.', '/admin/chats.html?open='.$r['id'], $r['updated_at'] ?: $r['created_at']);
        foreach ($pdo->query("SELECT id,client_name,topic,created_at FROM appointments WHERE status='confirmed' AND created_at>=datetime('now','-30 days')") as $r)
            $add('booking:'.$r['id'], 'Booking', $r['client_name'].' booked a call', $r['topic'] ?: 'New discovery call', '/admin/appointments.html', $r['created_at']);
        foreach ($pdo->query("SELECT id,customer_name,email,status,amount,currency,updated_at FROM payments WHERE status IN ('success','failed') AND updated_at>=datetime('now','-30 days')") as $r)
            $add('payment:'.$r['id'], 'Payment', ($r['status']==='success'?'Payment received':'Payment failed'), ($r['customer_name'] ?: $r['email']).' · '.$r['currency'].' '.number_format(((int)$r['amount'])/100,2), '/admin/payments.html', $r['updated_at'], $r['status']==='failed'?'danger':'success');
        foreach ($pdo->query("SELECT id,client_name,title,status,updated_at FROM proposals WHERE status IN ('accepted','declined') AND updated_at>=datetime('now','-30 days')") as $r)
            $add('proposal:'.$r['id'], 'Proposal', 'Proposal '.$r['status'], $r['client_name'].' · '.$r['title'], '/admin/proposals.html', $r['updated_at'], $r['status']==='declined'?'warning':'success');
        foreach ($pdo->query("SELECT id,invoice_number,client_name,due_date,updated_at FROM invoices WHERE status='sent' AND due_date IS NOT NULL AND due_date<date('now')") as $r)
            $add('invoice:'.$r['id'], 'Invoice', 'Invoice '.$r['invoice_number'].' is overdue', $r['client_name'].' · due '.$r['due_date'], '/admin/invoices.html', $r['updated_at'], 'warning');
        foreach ($pdo->query("SELECT id,name,url,last_status_changed_at,created_at FROM uptime_monitors WHERE is_active=1 AND last_status='down'") as $r)
            $add('uptime:'.$r['id'], 'Uptime', $r['name'].' is down', $r['url'], '/admin/uptime.html', $r['last_status_changed_at'] ?: $r['created_at'], 'danger');
        usort($items, static fn($a,$b) => strcmp($b['date'], $a['date']));
        return array_slice($items, 0, 100);
    }
}
