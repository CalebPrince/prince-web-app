<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiAgentEngine;
use App\Support\ChloeInvestigator;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * Chloe — Technical Operations & Monitoring. The investigation and
 * escalation logic itself lives in ChloeInvestigator (run continuously from
 * database/check_uptime.php's cron); this controller is her chat surface
 * (Radar-style admin console agent) plus the read/manage API behind the
 * admin incidents feed.
 */
class ChloeController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;

    /**
     * POST /api/v1/admin/agents/chloe/chat — body: {message, transcript: [{role,text}, ...]}.
     * Stateless: the transcript lives in the browser and is replayed each turn.
     */
    public static function chat(): void
    {
        $user = AuthMiddleware::requireAuth();

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim((string) ($data['message'] ?? ''));
        $transcript = is_array($data['transcript'] ?? null) ? $data['transcript'] : [];

        if ($message === '' || mb_strlen($message) > self::MAX_MESSAGE_LENGTH) {
            Response::error('A message under ' . self::MAX_MESSAGE_LENGTH . ' characters is required.', 422);
        }
        if (count($transcript) > self::MAX_CHAT_TRANSCRIPT_TURNS) {
            $transcript = array_slice($transcript, -self::MAX_CHAT_TRANSCRIPT_TURNS);
        }
        $transcript[] = ['role' => 'user', 'text' => $message];

        $pdo = Database::get();
        $result = AiAgentEngine::run(
            self::buildChatSystemPrompt(),
            [
                SharedAgentTools::siteInfoToolDeclaration(),
                self::operationalStatusToolDeclaration(),
                self::listIncidentsToolDeclaration(),
                self::getIncidentToolDeclaration(),
                self::investigateNowToolDeclaration(),
            ],
            fn(string $name, array $args) => match ($name) {
                'get_site_info' => SharedAgentTools::getSiteInfo(),
                'get_operational_status' => ChloeInvestigator::snapshot($pdo),
                'list_incidents' => [
                    'incidents' => ChloeInvestigator::listIncidents(
                        $pdo,
                        trim((string) ($args['status'] ?? '')) ?: null,
                        (int) ($args['limit'] ?? 20)
                    ),
                ],
                'get_incident' => ChloeInvestigator::getIncident($pdo, (int) ($args['incident_id'] ?? 0))
                    ?? ['error' => 'No incident with that ID.'],
                'investigate_now' => ChloeInvestigator::investigateNowByQuery($pdo, (string) ($args['site'] ?? '')),
                default => ['error' => 'Unknown tool.'],
            },
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        ActivityLog::log($user, 'reported', 'chloe_chat', null, mb_substr($message, 0, 120));

        Response::json(['reply' => SharedAgentTools::stripMarkdown($result['reply'])]);
    }

    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('chloe_assistant_name') ?: 'Chloe';

        return "You are {$name}, the Technical Operations & Monitoring specialist on Prince Caleb's AI team — "
            . "Caleb runs princecaleb.dev, a one-person web studio, and relies on you to watch every site and "
            . "system he manages so he doesn't have to.\n\n"
            . "Your mission: continuously understand the operational health of everything monitored, investigate "
            . "anomalies, and escalate only what actually requires his attention. You already do this unattended — "
            . "every few minutes a cron job (ChloeInvestigator::runCycle) checks every monitored site, and when one "
            . "goes down you gather real evidence before saying anything: whether DNS resolves, the actual HTTP "
            . "status, whether other monitored sites are down at the same time (shared infrastructure vs. one "
            . "app), and whether a deployment landed recently. You only page Caleb by email/WhatsApp once you're "
            . "confident AND the problem has actually persisted a few minutes — never on a single blip. This chat "
            . "is where Caleb asks you what's going on, asks about a specific incident, or asks you to check a "
            . "site right now.\n\n"
            . "Tools: get_operational_status gives real counts (monitors up/down, open incidents by category, "
            . "recent incidents) — start here for any \"how are things\" question. list_incidents and get_incident "
            . "let you pull a specific incident's full narrative and evidence. investigate_now runs a fresh, live "
            . "investigation of one site by name right now (not just its last cron result) — use it whenever Caleb "
            . "asks you to check something specific.\n\n"
            . "CRITICAL: never state a number, status, or fact you did not just get from a tool call in this "
            . "conversation. If nothing is wrong, say so plainly rather than manufacturing concern — a monitoring "
            . "agent that cries wolf trains Caleb to ignore it, which defeats the entire point of you. When you do "
            . "report a problem, lead with what's actually broken and your best-supported explanation, the way an "
            . "on-call engineer would brief a colleague — not a generic alert.\n\n"
            . "Speak naturally, never output raw JSON, and be concise — Caleb wants the read, not a transcript of "
            . "your tool calls.";
    }

    private static function operationalStatusToolDeclaration(): array
    {
        return [
            'name' => 'get_operational_status',
            'description' => 'Real, current counts: how many monitored sites are up/down, how many incidents are '
                . 'currently open by category (uptime, dns, deploy, infra, automation), and the most recent '
                . 'incidents overall. Use this for any general "how are things" or "anything wrong" question.',
            'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
        ];
    }

    private static function listIncidentsToolDeclaration(): array
    {
        return [
            'name' => 'list_incidents',
            'description' => 'List recent incidents, optionally filtered by status.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'status' => ['type' => 'STRING', 'description' =>
                        'One of investigating, confirmed, escalated, resolved, dismissed. Omit for all statuses.'],
                    'limit' => ['type' => 'INTEGER', 'description' => 'Max incidents to return. Default 20.'],
                ],
                'required' => [],
            ],
        ];
    }

    private static function getIncidentToolDeclaration(): array
    {
        return [
            'name' => 'get_incident',
            'description' => 'Get one incident in full — its narrative, category, confidence, status, and the raw '
                . 'evidence gathered (DNS result, HTTP status, other-sites-down count, deploy timing).',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'incident_id' => ['type' => 'INTEGER', 'description' => 'The incident ID.'],
                ],
                'required' => ['incident_id'],
            ],
        ];
    }

    private static function investigateNowToolDeclaration(): array
    {
        return [
            'name' => 'investigate_now',
            'description' => 'Run a fresh, live investigation of one monitored site right now — a real DNS check '
                . 'and HTTP probe, not just the last cron result. Use whenever Caleb names a specific site and '
                . 'wants to know its current state.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'site' => ['type' => 'STRING', 'description' => 'The site name, project name, or URL to check.'],
                ],
                'required' => ['site'],
            ],
        ];
    }

    // ------------------------------------------------------------ admin API

    /** GET /api/v1/admin/chloe/incidents?status=escalated&limit=50 */
    public static function incidentsIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $status = trim((string) ($_GET['status'] ?? '')) ?: null;
        $limit = (int) ($_GET['limit'] ?? 50);

        Response::json([
            'incidents' => ChloeInvestigator::listIncidents($pdo, $status, $limit),
            'snapshot' => ChloeInvestigator::snapshot($pdo),
            'chloe_name' => Settings::get('chloe_assistant_name') ?: 'Chloe',
        ]);
    }

    /** GET /api/v1/admin/chloe/incidents/{id} */
    public static function incidentShow(array $params): void
    {
        AuthMiddleware::requireAuth();
        $incident = ChloeInvestigator::getIncident(Database::get(), (int) $params['id']);
        if ($incident === null) {
            Response::error('Incident not found.', 404);
        }
        Response::json(['incident' => $incident]);
    }

    /** POST /api/v1/admin/chloe/incidents/{id}/dismiss — manually close an incident that doesn't need action. */
    public static function dismissIncident(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) $params['id'];
        $ok = ChloeInvestigator::dismissIncident(Database::get(), $id);
        if (!$ok) {
            Response::error('Incident not found or already dismissed.', 404);
        }
        ActivityLog::log($user, 'dismissed', 'chloe_incident', $id);
        Response::json(['status' => 'dismissed']);
    }

    /** POST /api/v1/admin/chloe/investigate — body: {site: "name or URL"}. On-demand check from the admin UI. */
    public static function investigateNow(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $site = trim((string) ($data['site'] ?? ''));
        if ($site === '') {
            Response::error('A site name, project name, or URL is required.', 422);
        }
        Response::json(ChloeInvestigator::investigateNowByQuery(Database::get(), $site));
    }
}
