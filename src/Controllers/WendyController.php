<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Agents\Chief;
use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiAgentEngine;
use App\Support\ChloeInvestigator;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * Wendy Rhoades — performance coach and conflict mediator, sitting above the
 * rest of the team. Named for the Billions character: the one person at the
 * fund with visibility into everyone's real state, who reads people rather
 * than just their P&L, and tells Bobby or Chuck the truth they don't want to
 * hear rather than the one they do.
 *
 * Deliberately NOT a second Chief. Chief (src/Agents/Chief.php) is the
 * quantitative reporter — it counts what each agent did, writes a daily
 * brief, and pushes it out on a cron. A second daily-brief agent would be
 * exactly the "another agent constantly throwing alerts at me" problem Caleb
 * already pushed back on once (see Chloe's design). So Wendy is chat-only,
 * on demand, no cron, no push notification of her own — Caleb goes to her,
 * not the other way round. She reuses Chief's and Chloe's own data rather
 * than re-deriving it (Chief::snapshot, Chief::waitingOnYou,
 * ChloeInvestigator::snapshot, TeamController::projectCapacity), because the
 * facts are already computed correctly elsewhere; what she adds is the
 * coaching read on them and, when Caleb describes two agents giving
 * conflicting signals, working through the real data from each to reconcile
 * it rather than guessing which one is right.
 */
class WendyController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;

    /**
     * POST /api/v1/admin/agents/wendy/chat — body: {message, transcript: [{role,text}, ...]}.
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
                self::teamActivityToolDeclaration(),
                self::operationalHealthToolDeclaration(),
                self::founderWorkloadToolDeclaration(),
            ],
            fn(string $name, array $args) => match ($name) {
                'team_activity' => Chief::snapshot($pdo, (int) ($args['hours'] ?? 24)),
                'operational_health' => ChloeInvestigator::snapshot($pdo),
                'founder_workload' => self::founderWorkload($pdo),
                default => ['error' => 'Unknown tool.'],
            },
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        ActivityLog::log($user, 'reported', 'wendy_chat', null, mb_substr($message, 0, 120));

        Response::json(['reply' => SharedAgentTools::stripMarkdown($result['reply'])]);
    }

    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('wendy_assistant_name') ?: 'Wendy';

        return "You are {$name}, sitting above the rest of Caleb's AI team — the same role Wendy Rhoades plays at "
            . "Axe Capital: not a trader or a reporter, the one person with real visibility into how everyone "
            . "(and Caleb himself) is actually doing, who reads the person and the pattern, not just the number.\n\n"
            . "Your job has two parts. First, performance oversight of the whole team: pull real activity from "
            . "team_activity (what every agent did, what's switched off, what's config-broken) and real technical "
            . "health from operational_health (site uptime, open incidents Chloe is tracking), and tell Caleb the "
            . "truth about how the studio is actually running — never a flattering gloss, never padding. Second, "
            . "coach Caleb on his own performance: founder_workload gives you his real project load, overdue and "
            . "due-soon deadlines, and exactly what's sitting in his queue unreviewed (quote requests, chat leads, "
            . "draft proposals, overdue milestones). When that queue is piling up or he's overcommitted, say so "
            . "plainly and push him to clear it or cut scope — a coach who lets things slide to keep the peace "
            . "isn't doing the job.\n\n"
            . "You also mediate: when Caleb tells you two agents (or two signals) are pointing different "
            . "directions — Beacon likes a lead Dossier's research makes him wary of, Chief's brief reads one way "
            . "and Chloe's incidents read another — don't referee from instinct. Pull the real data each one is "
            . "actually built on via your tools and reconcile it with him, the way she'd sit Bobby and Chuck down "
            . "and work the actual facts rather than picking a side.\n\n"
            . "CRITICAL: never state a number, status, or fact you did not just get from a tool call in this "
            . "conversation. If a queue is empty or nothing is wrong, say so — manufacturing concern to sound "
            . "useful is exactly the flattery-shaped failure a real coach doesn't commit. You are direct and "
            . "unsentimental, but never cruel for its own sake — the read is always in service of Caleb doing "
            . "better, not of you sounding sharp.\n\n"
            . "Speak naturally, never output raw JSON. Be concise and lead with the read, not a recitation of "
            . "every number your tools returned.";
    }

    private static function teamActivityToolDeclaration(): array
    {
        return [
            'name' => 'team_activity',
            'description' => 'Real activity from every business agent (Lisa, Jason/Nurturer, Joan/Beacon, Sharon/'
                . 'Dossier, Ledger/Proposal, Sketch, Danielle/Content, Arch, Ada, Scout) over the last N hours, '
                . 'plus command-center activity (Caleb\'s own logged actions, payments, inquiries) and what is '
                . 'currently waiting on him. Same data Chief\'s daily brief is built from — use this for any '
                . '"how is the team doing" question.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'hours' => ['type' => 'INTEGER', 'description' => 'Hours to look back. Default 24.'],
                ],
                'required' => [],
            ],
        ];
    }

    private static function operationalHealthToolDeclaration(): array
    {
        return [
            'name' => 'operational_health',
            'description' => 'Real technical health from Chloe\'s monitoring: how many monitored sites are up/'
                . 'down right now, open incidents by category (uptime, dns, deploy, infra, automation, anomaly), '
                . 'and the most recent incidents. Use this for anything touching site health, automation '
                . 'failures, or "is anything technically broken".',
            'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
        ];
    }

    private static function founderWorkloadToolDeclaration(): array
    {
        return [
            'name' => 'founder_workload',
            'description' => 'Caleb\'s own real workload: active/overdue/due-soon-in-14-days project counts and '
                . 'capacity level (clear/available/focused/full), plus exactly what is sitting unreviewed in his '
                . 'queue right now (quote requests, chat leads not opened, draft proposals, overdue milestones, '
                . 'unsent newsletters, and more). This is the real signal for "how is Caleb himself doing" and '
                . '"is he overcommitted" — never estimate this from team activity alone.',
            'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
        ];
    }

    /** @return array<string,mixed> */
    private static function founderWorkload(\PDO $pdo): array
    {
        $capacity = \App\Controllers\TeamController::projectCapacity($pdo);
        return [
            'capacity' => $capacity['owner'],
            'waiting_on_you' => Chief::waitingOnYou($pdo),
        ];
    }
}
