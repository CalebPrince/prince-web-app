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
    /** POST /api/v1/analytics/track — public, rate-limited (abuse guard, not a usage cap) */
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
        $pdo->prepare('INSERT INTO page_views (path, referrer) VALUES (?, ?)')
            ->execute([$path, $referrer !== '' ? mb_substr($referrer, 0, 255) : null]);

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
            'SELECT path, COUNT(*) AS views FROM page_views WHERE created_at >= ?
             GROUP BY path ORDER BY views DESC LIMIT 10'
        );
        $stmt->execute([$since]);
        $topPages = $stmt->fetchAll();

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
            'by_day' => $byDay,
            'top_referrers' => $topReferrers,
            'days' => $days,
        ]);
    }
}
