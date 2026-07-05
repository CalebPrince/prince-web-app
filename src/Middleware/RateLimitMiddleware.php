<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Support\Database;
use App\Support\Response;

class RateLimitMiddleware
{
    /** Hourly-bucketed rate limit. Halts the request with a 429 if exceeded. */
    public static function enforce(string $endpoint, int $limit): void
    {
        $pdo = Database::get();
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $windowStart = date('Y-m-d H:00:00');

        $stmt = $pdo->prepare(
            'SELECT id, request_count FROM rate_limits WHERE ip_address = ? AND endpoint = ? AND window_start = ?'
        );
        $stmt->execute([$ip, $endpoint, $windowStart]);
        $row = $stmt->fetch();

        if ($row) {
            if ((int) $row['request_count'] >= $limit) {
                Response::error('Too many requests. Please try again later.', 429);
            }
            $pdo->prepare('UPDATE rate_limits SET request_count = request_count + 1 WHERE id = ?')
                ->execute([$row['id']]);
            return;
        }

        $pdo->prepare(
            'INSERT INTO rate_limits (ip_address, endpoint, request_count, window_start) VALUES (?, ?, 1, ?)'
        )->execute([$ip, $endpoint, $windowStart]);
    }
}
