<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Support\Database;
use App\Support\Response;
use PDOException;

class RateLimitMiddleware
{
    /** Hourly-bucketed rate limit. Halts the request with a 429 if exceeded. */
    public static function enforce(string $endpoint, int $limit): void
    {
        $pdo = Database::get();
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $windowStart = date('Y-m-d H:00:00');

        // One atomic upsert avoids the former SELECT-then-UPDATE race between
        // concurrent PHP workers. A transient lock is retried; rate limiting
        // then fails open rather than turning optional analytics/error logging
        // into a fatal 500 for the visitor.
        for ($attempt = 0; $attempt < 3; $attempt++) {
            try {
                $pdo->prepare(
                    'INSERT INTO rate_limits (ip_address, endpoint, request_count, window_start)
                     VALUES (?, ?, 1, ?)
                     ON CONFLICT(ip_address, endpoint,window_start)
                     DO UPDATE SET request_count = request_count + 1'
                )->execute([$ip, $endpoint, $windowStart]);

                $stmt = $pdo->prepare(
                    'SELECT request_count FROM rate_limits
                     WHERE ip_address = ? AND endpoint = ? AND window_start = ?'
                );
                $stmt->execute([$ip, $endpoint, $windowStart]);
                $count = (int) $stmt->fetchColumn();
                if ($count > $limit) {
                    Response::error('Too many requests. Please try again later.', 429);
                }
                return;
            } catch (PDOException $e) {
                if (!str_contains(strtolower($e->getMessage()), 'database is locked')) {
                    throw $e;
                }
                if ($attempt < 2) {
                    usleep(50000 * ($attempt + 1));
                }
            }
        }

        error_log('Rate limiter skipped after SQLite remained locked: ' . $endpoint);
    }
}
