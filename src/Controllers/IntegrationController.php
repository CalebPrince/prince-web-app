<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;

/**
 * Pull-based feed of integration events (see IntegrationEvent). Not an admin
 * session endpoint — authenticated with a static API key
 * (Settings::integration_api_key) that a consumer sends as a Bearer token,
 * since a third-party automation tool can't hold an admin JWT session.
 */
class IntegrationController
{
    /** GET /api/v1/integrations/events?since_id=0&limit=50&include_delivered=0 */
    public static function events(): void
    {
        $expectedKey = Settings::get('integration_api_key');
        $providedKey = self::bearerToken();
        if (!$expectedKey || !$providedKey || !hash_equals($expectedKey, $providedKey)) {
            Response::error('Unauthorized', 401);
        }

        $sinceId = (int) ($_GET['since_id'] ?? 0);
        $limit = min(200, max(1, (int) ($_GET['limit'] ?? 50)));
        // Default to catch-up mode: only events the live push never delivered.
        // A poller can safely run alongside the push webhook with zero
        // overlap — anything push already handled is excluded here, so
        // there's nothing for the poller to double-process. Pass
        // include_delivered=1 to see the full log instead (e.g. for an
        // admin audit view).
        $includeDelivered = !empty($_GET['include_delivered']);

        $sql = 'SELECT id, event, data, push_delivered, created_at FROM integration_events WHERE id > ?';
        if (!$includeDelivered) {
            $sql .= ' AND push_delivered = 0';
        }
        $sql .= ' ORDER BY id ASC LIMIT ?';

        $pdo = Database::get();
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(1, $sinceId, \PDO::PARAM_INT);
        $stmt->bindValue(2, $limit, \PDO::PARAM_INT);
        $stmt->execute();

        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['data'] = json_decode($row['data'], true);
            $row['push_delivered'] = (bool) $row['push_delivered'];
        }
        unset($row);

        Response::json($rows);
    }

    private static function bearerToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($header, 'Bearer ')) {
            return substr($header, 7);
        }
        return null;
    }
}
