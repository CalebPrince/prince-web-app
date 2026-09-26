<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Database;
use App\Support\LisaFollowups;
use App\Support\LisaJudgment;
use App\Support\LisaQuoting;
use App\Support\Response;
use App\Support\Settings;
use App\Support\TypeSafeClient;
use App\Support\WhatsAppConversationFollowupTemplateManager;

/**
 * Admin view of what Jev is deciding for Lisa: the readings of inbound
 * messages, the cold-conversation follow-ups (sent, or in shadow mode what
 * would have been), and the alerts sent to the owner's WhatsApp. Read-only
 * apart from "Run now". Modes and timing are ordinary Settings.
 */
final class LisaDecisionsController
{
    /** GET /api/v1/admin/lisa-decisions */
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

        $counts = [];
        foreach ($rows("SELECT status, COUNT(*) AS n FROM lisa_followups WHERE created_at >= datetime('now', '-7 days') GROUP BY status") as $r) {
            $counts[$r['status']] = (int) $r['n'];
        }

        Response::json([
            'has_key' => TypeSafeClient::hasKey(),
            'jev_mode' => LisaJudgment::mode(),
            'followup_mode' => LisaFollowups::mode(),
            'quiet_now' => LisaJudgment::inQuietHours(),
            'timing' => LisaFollowups::timing(),
            'template' => WhatsAppConversationFollowupTemplateManager::status(),
            'counts_7d' => $counts,
            'followups' => $rows(
                "SELECT id, contact_name, phone, mode, window_state, action, template_key, body_text, decision_json, skip_reason, status, error, created_at, sent_at
                 FROM lisa_followups ORDER BY id DESC LIMIT 60"
            ),
            'judgments' => $rows(
                "SELECT j.id, j.channel, j.mode, j.signals_json, j.actions_json, j.created_at, cs.client_name
                 FROM lisa_judgments j LEFT JOIN chat_sessions cs ON cs.token = j.session_token
                 ORDER BY j.id DESC LIMIT 60"
            ),
            'quote_mode' => LisaQuoting::mode(),
            'quotes' => $rows("SELECT id, contact_name, contact_phone, channel, project_type, low_ghs, high_ghs, decision, reason, basis_json, quoted_to_customer, summary_sent_at, created_at, updated_at FROM lisa_quotes ORDER BY updated_at DESC LIMIT 40"),
            'owner_alerts' => $rows("SELECT id, reason, summary, mode, delivered, created_at FROM lisa_owner_alerts ORDER BY id DESC LIMIT 30"),
        ]);
    }

    /** POST /api/v1/admin/lisa-decisions/run — one follow-up pass now, in whatever mode is set. */
    public static function runNow(): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $result = LisaFollowups::run($pdo);
        $result['quote_summaries'] = LisaQuoting::sendDueSummaries($pdo);
        ActivityLog::log($user, 'ran', 'lisa_followups', null, json_encode($result));
        Response::json($result);
    }
}
