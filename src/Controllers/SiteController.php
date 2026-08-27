<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;

/**
 * Read-aggregator for the admin "Sites" page — combines projects, their
 * linked uptime monitor, and page_views analytics into one payload per site.
 * Writes stay where they already lived: ProjectController for project
 * fields, UptimeController for monitor CRUD, AnalyticsController::track()
 * for ingest.
 */
class SiteController
{
    /** @return string[] */
    private static function decodeStack(?string $raw): array
    {
        if ($raw === null || trim($raw) === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? array_values($decoded) : [];
    }

    private static function baseQuery(): string
    {
        return "SELECT p.id, p.slug, p.title, p.client_name, p.live_url, p.repo_url, p.stack_json,
                       p.ssl_expires_at, p.domain_expires_at, p.domain_registrar,
                       p.perf_desktop_score, p.perf_mobile_score, p.perf_lcp_ms, p.perf_cls,
                       p.last_deployed_at, p.technical_checked_at, p.tracking_key,
                       m.id AS monitor_id, m.last_status, m.last_checked_at
                FROM projects p
                LEFT JOIN uptime_monitors m ON m.project_id = p.id";
    }

    /** Attaches uptime stats (reusing UptimeController::stats) and decodes stack_json. */
    private static function attachDerived(\PDO $pdo, array &$site): void
    {
        $site['stack'] = self::decodeStack($site['stack_json'] ?? null);
        unset($site['stack_json']);

        if ($site['monitor_id']) {
            $site = array_merge($site, UptimeController::stats($pdo, (int) $site['monitor_id']));
        } else {
            $site['uptime_24h'] = null;
            $site['uptime_30d'] = null;
            $site['avg_response_ms'] = null;
        }
    }

    /** GET /api/v1/admin/sites */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $sites = $pdo->query(
            self::baseQuery() . " WHERE p.live_url IS NOT NULL AND p.live_url != '' ORDER BY p.sort_order ASC"
        )->fetchAll();

        foreach ($sites as &$site) {
            self::attachDerived($pdo, $site);
        }
        unset($site);

        Response::json($sites);
    }

    /** GET /api/v1/admin/sites/{id} */
    public static function adminShow(array $params): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare(self::baseQuery() . ' WHERE p.id = ?');
        $stmt->execute([(int) $params['id']]);
        $site = $stmt->fetch();
        if (!$site) {
            Response::error('Site not found.', 404);
        }

        self::attachDerived($pdo, $site);
        Response::json($site);
    }

    /** GET /api/v1/admin/sites/{id}/analytics?days=30 */
    public static function analytics(array $params): void
    {
        AuthMiddleware::requireAuth();
        $projectId = (int) $params['id'];
        $pdo = Database::get();

        $stmt = $pdo->prepare('SELECT live_url FROM projects WHERE id = ?');
        $stmt->execute([$projectId]);
        $liveUrl = $stmt->fetchColumn();
        if ($liveUrl === false) {
            Response::error('Site not found.', 404);
        }
        $ownHost = $liveUrl ? preg_replace('/^www\./', '', strtolower((string) parse_url($liveUrl, PHP_URL_HOST))) : null;

        $days = max(1, min(365, (int) ($_GET['days'] ?? 30)));
        $since = date('Y-m-d H:i:s', strtotime("-{$days} days"));

        $pageviewStmt = $pdo->prepare(
            "SELECT path, referrer, visitor_id, session_id FROM page_views
             WHERE project_id = ? AND created_at >= ? AND path NOT LIKE '/__event/%'"
        );
        $pageviewStmt->execute([$projectId, $since]);
        $pageviews = $pageviewStmt->fetchAll();

        $visitors = [];
        $sessionCounts = [];
        $topPages = [];
        $sourceCounts = ['Direct' => 0, 'Google' => 0, 'Social' => 0, 'Referral' => 0];
        $socialHosts = ['facebook.com', 'instagram.com', 'linkedin.com', 'tiktok.com', 'twitter.com', 'x.com'];

        foreach ($pageviews as $row) {
            if ($row['visitor_id']) {
                $visitors[$row['visitor_id']] = true;
            }
            if ($row['session_id']) {
                $sessionCounts[$row['session_id']] = ($sessionCounts[$row['session_id']] ?? 0) + 1;
            }
            $topPages[$row['path']] = ($topPages[$row['path']] ?? 0) + 1;

            $referrerHost = $row['referrer'] ? parse_url($row['referrer'], PHP_URL_HOST) : null;
            $referrerHost = $referrerHost ? preg_replace('/^www\./', '', strtolower($referrerHost)) : null;
            // No referrer, or a referrer on the site's own domain (page-to-page
            // navigation within a visit) both count as Direct.
            if (!$referrerHost || $referrerHost === $ownHost) {
                $sourceCounts['Direct']++;
            } elseif (str_contains($referrerHost, 'google.')) {
                $sourceCounts['Google']++;
            } elseif (in_array($referrerHost, $socialHosts, true)) {
                $sourceCounts['Social']++;
            } else {
                $sourceCounts['Referral']++;
            }
        }

        $sessionTotal = count($sessionCounts);
        $bounced = count(array_filter($sessionCounts, fn($c) => $c === 1));

        arsort($topPages);
        $topPagesOut = [];
        foreach (array_slice($topPages, 0, 10, true) as $path => $count) {
            $topPagesOut[] = ['path' => $path, 'views' => $count];
        }

        $eventStmt = $pdo->prepare(
            "SELECT path, COUNT(*) AS c FROM page_views
             WHERE project_id = ? AND created_at >= ? AND path LIKE '/__event/%'
             GROUP BY path ORDER BY c DESC LIMIT 15"
        );
        $eventStmt->execute([$projectId, $since]);
        $conversions = array_map(
            static fn($row) => ['name' => substr($row['path'], strlen('/__event/')), 'count' => (int) $row['c']],
            $eventStmt->fetchAll()
        );

        Response::json([
            'days' => $days,
            'pageviews' => count($pageviews),
            'visitors' => count($visitors),
            'sessions' => $sessionTotal,
            'bounce_rate' => $sessionTotal > 0 ? round(100 * $bounced / $sessionTotal, 1) : null,
            'pages_per_session' => $sessionTotal > 0 ? round(count($pageviews) / $sessionTotal, 1) : null,
            'traffic_sources' => $sourceCounts,
            'top_pages' => $topPagesOut,
            'conversions' => $conversions,
        ]);
    }
}
