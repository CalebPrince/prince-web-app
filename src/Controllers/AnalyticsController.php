<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\Database;
use App\Support\Response;

/**
 * Minimal first-party analytics: page path + referrer + timestamp only.
 * No IP address, no visitor/cookie ID, no third-party service — enough to
 * see which pages get read without tracking who's reading them.
 */
class AnalyticsController
{
    /**
     * POST /api/v1/analytics/track — public, rate-limited (abuse guard, not a
     * usage cap). Called both by this site's own beacon (public/js/analytics.js,
     * no `site`) and by public/js/pixel.js embedded on client sites (`site` =
     * a project's tracking_key, plus anonymous visitor/session ids). Body is
     * read as raw JSON regardless of Content-Type, since the pixel sends via
     * sendBeacon (defaults to text/plain) to stay a CORS-free "simple request".
     */
    public static function track(): void
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        RateLimitMiddleware::enforce('analytics_track', appConfig()['contact_rate_limit'] * 20);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $path = trim((string) ($data['path'] ?? ''));
        if ($path === '' || mb_strlen($path) > 255) {
            Response::json(['status' => 'ignored'], 202);
        }

        $referrer = trim((string) ($data['referrer'] ?? ''));
        $pdo = Database::get();

        $projectId = null;
        $siteKey = trim((string) ($data['site'] ?? ''));
        if ($siteKey !== '') {
            $stmt = $pdo->prepare('SELECT id FROM projects WHERE tracking_key = ?');
            $stmt->execute([$siteKey]);
            $projectId = $stmt->fetchColumn() ?: null;
        }

        $visitorId = trim((string) ($data['visitor_id'] ?? ''));
        $sessionId = trim((string) ($data['session_id'] ?? ''));

        $pdo->prepare(
            'INSERT INTO page_views (path, referrer, project_id, visitor_id, session_id) VALUES (?, ?, ?, ?, ?)'
        )->execute([
            $path,
            $referrer !== '' ? mb_substr($referrer, 0, 255) : null,
            $projectId,
            $visitorId !== '' ? mb_substr($visitorId, 0, 64) : null,
            $sessionId !== '' ? mb_substr($sessionId, 0, 64) : null,
        ]);

        Response::json(['status' => 'ok'], 201);
    }

    /** GET /api/v1/admin/analytics/summary?days=30 */
    public static function summary(): void
    {
        AuthMiddleware::requireAuth();
        $days = max(1, min(365, (int) ($_GET['days'] ?? 30)));
        $pdo = Database::get();
        $since = date('Y-m-d H:i:s', strtotime("-{$days} days"));

        $stmt = $pdo->prepare('SELECT COUNT(*) AS c FROM page_views WHERE created_at >= ?');
        $stmt->execute([$since]);
        $totalViews = (int) $stmt->fetch()['c'];

        $stmt = $pdo->prepare(
            "SELECT path, COUNT(*) AS views FROM page_views WHERE created_at >= ? AND path NOT LIKE '/__event/%'
               GROUP BY path ORDER BY views DESC LIMIT 10"
        );
        $stmt->execute([$since]);
        $topPages = $stmt->fetchAll();

        $stmt = $pdo->prepare(
            "SELECT path, COUNT(*) AS views FROM page_views WHERE created_at >= ? AND path LIKE '/__event/%'
             GROUP BY path ORDER BY views DESC LIMIT 15"
        );
        $stmt->execute([$since]);
        $topEvents = $stmt->fetchAll();

        $eventCounts = [];
        foreach ($topEvents as $row) {
            $eventCounts[$row['path']] = (int) $row['views'];
        }
        $funnel = [
            'calculator_runs' => $eventCounts['/__event/pricing_calculator_run'] ?? 0,
            'request_prefill' => $eventCounts['/__event/request_prefill_from_pricing'] ?? 0,
            'request_step_2' => $eventCounts['/__event/request_step_2'] ?? 0,
            'request_step_3' => $eventCounts['/__event/request_step_3'] ?? 0,
            'request_submit_success' => $eventCounts['/__event/request_submit_success'] ?? 0,
            'request_submit_failed' => $eventCounts['/__event/request_submit_failed'] ?? 0,
            'checkout_opened' => $eventCounts['/__event/pricing_checkout_opened'] ?? 0,
            'checkout_failed_open' => $eventCounts['/__event/pricing_checkout_failed_open'] ?? 0,
        ];

        $stmt = $pdo->prepare(
            "SELECT date(created_at) AS day, COUNT(*) AS views FROM page_views WHERE created_at >= ?
             GROUP BY day ORDER BY day ASC"
        );
        $stmt->execute([$since]);
        $byDay = $stmt->fetchAll();

        $stmt = $pdo->prepare(
            "SELECT
                CASE
                    WHEN referrer IS NULL OR referrer = '' THEN 'Direct / no referrer'
                    ELSE referrer
                END AS referrer,
                COUNT(*) AS views
             FROM page_views WHERE created_at >= ?
             GROUP BY referrer ORDER BY views DESC LIMIT 10"
        );
        $stmt->execute([$since]);
        $topReferrers = $stmt->fetchAll();

        Response::json([
            'total_views' => $totalViews,
            'top_pages' => $topPages,
            'top_events' => $topEvents,
            'funnel' => $funnel,
            'by_day' => $byDay,
            'top_referrers' => $topReferrers,
            'days' => $days,
        ]);
    }
}
