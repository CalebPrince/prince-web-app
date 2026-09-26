<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AgentJudgment;
use App\Support\Database;
use App\Support\OwnerMessages;
use App\Support\Response;
use App\Support\Settings;

/**
 * Admin view of Jev as the decision layer across every agent: what each agent
 * asked Jev, what Jev said, what the code did (or, in shadow mode, would have
 * done), and the routine messages held for the digest. Read-only apart from
 * "Send the digest now". Modes and limits are ordinary Settings.
 */
final class AgentDecisionsController
{
    /** GET /api/v1/admin/agent-decisions */
    public static function overview(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = static function (string $sql) use ($pdo): array {
            try {
                return $pdo->query($sql)->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            } catch (\Throwable $e) {
                return []; // tables appear once migrate.php has run
            }
        };

        $byAgent = [];
        foreach ($rows("SELECT agent, area, decision, COUNT(*) AS n FROM agent_decisions WHERE created_at >= datetime('now', '-7 days') GROUP BY agent, area, decision") as $r) {
            $byAgent[$r['agent']][] = ['area' => $r['area'], 'decision' => $r['decision'], 'n' => (int) $r['n']];
        }

        Response::json([
            'has_key' => AgentJudgment::available(),
            'owner_mode' => AgentJudgment::mode('owner'),
            'customer_mode' => AgentJudgment::mode('customer'),
            'decisions_mode' => AgentJudgment::mode('decisions'),
            'digest_times' => Settings::get('agent_digest_times') ?: '09:00,17:00',
            'last_digest_slot' => Settings::get('agent_digest_last_slot') ?: null,
            'counts_7d' => $byAgent,
            'held' => $rows("SELECT id, agent, kind, subject, body, importance, reason, duplicate_of, created_at FROM owner_message_queue WHERE status = 'held' ORDER BY created_at ASC LIMIT 100"),
            'recent' => $rows("SELECT id, area, agent, kind, ref, mode, jev_json, decision, detail, outcome, created_at FROM agent_decisions ORDER BY id DESC LIMIT 150"),
        ]);
    }

    /** POST /api/v1/admin/agent-decisions/digest — send the digest now, outside its schedule. */
    public static function digestNow(): void
    {
        $user = AuthMiddleware::requireAuth();
        $result = OwnerMessages::flushDigest(Database::get(), true);
        ActivityLog::log($user, 'sent', 'agent_digest', null, json_encode($result));
        Response::json($result);
    }
}
