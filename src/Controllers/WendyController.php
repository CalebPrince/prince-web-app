<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Agents\Chief;
use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiAgentEngine;
use App\Support\ChloeInvestigator;
use App\Support\Database;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;
use App\Support\WhatsAppNotifier;

/**
 * Wendy Rhoades — performance coach and conflict mediator, sitting above the
 * rest of the team. Named for the Billions character: the one person at the
 * fund with visibility into everyone's real state, who reads people rather
 * than just their P&L, and tells Bobby or Chuck the truth they don't want to
 * hear rather than the one they do.
 *
 * Deliberately NOT a second Chief. Chief (src/Agents/Chief.php) is the
 * quantitative reporter — it counts what each agent did, writes a daily
 * brief, and pushes it out on a cron. Wendy still isn't that: she doesn't
 * recite numbers on a schedule, and chat() stays available for Caleb to go
 * to her directly any time. But she's no longer purely reactive either — her
 * own cron (database/wendy_review.php, gated by wendy_review_enabled, off by
 * default) runs runReviewPass() on a cadence so she actually looks without
 * being asked, the same restraint she already applies in chat: save
 * sparingly, and only wants_session=true earns Caleb an interruption (see
 * notifySessionRequest). She reuses Chief's and Chloe's own data rather than
 * re-deriving it (Chief::snapshot, Chief::waitingOnYou,
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
            self::toolDeclarations(),
            self::toolDispatcher($pdo),
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        ActivityLog::log($user, 'reported', 'wendy_chat', null, mb_substr($message, 0, 120));

        Response::json(['reply' => SharedAgentTools::stripMarkdown($result['reply'])]);
    }

    /** @return array<int,array<string,mixed>> */
    private static function toolDeclarations(): array
    {
        return [
            self::teamActivityToolDeclaration(),
            self::operationalHealthToolDeclaration(),
            self::founderWorkloadToolDeclaration(),
            self::patternHistoryToolDeclaration(),
            self::listOpenObservationsToolDeclaration(),
            self::saveObservationToolDeclaration(),
            self::resolveObservationToolDeclaration(),
            self::listPendingToolReviewsToolDeclaration(),
            self::submitToolReviewToolDeclaration(),
            SharedAgentTools::inteliSpaceLookupToolDeclaration(),
        ];
    }

    private static function toolDispatcher(\PDO $pdo): \Closure
    {
        return fn(string $name, array $args) => match ($name) {
            'lookup_inteli_space_project' => SharedAgentTools::inteliSpaceLookup((string) ($args['query'] ?? '')),
            'team_activity' => Chief::snapshot($pdo, (int) ($args['hours'] ?? 24)),
            'operational_health' => ChloeInvestigator::snapshot($pdo),
            'founder_workload' => self::founderWorkload($pdo),
            'pattern_history' => self::patternHistory($pdo, (int) ($args['days'] ?? 14)),
            'list_open_observations' => ['observations' => self::listOpenObservations($pdo)],
            'save_observation' => self::saveObservation($pdo, $args),
            'resolve_observation' => self::resolveObservation($pdo, (int) ($args['observation_id'] ?? 0)),
            'list_pending_tool_reviews' => ['reviews' => self::listPendingToolReviews($pdo)],
            'submit_tool_review' => self::submitToolReview(
                $pdo,
                (int) ($args['evaluation_id'] ?? 0),
                (string) ($args['impact_notes'] ?? '')
            ),
            default => ['error' => 'Unknown tool.'],
        };
    }

    /**
     * The autonomous entry point, run from database/wendy_review.php on a
     * cron. Same engine, same tools, same persona and same restraint as a
     * real chat turn — a synthetic prompt standing in for Caleb actually
     * opening a conversation with her. She still only interrupts him via
     * wants_session/notifySessionRequest for something that genuinely earns
     * it; this just means she looks on a schedule instead of only when he
     * happens to ask. A generous tool-round budget since one real pass can
     * chain: list_open_observations, then several read tools, then
     * list_pending_tool_reviews, then zero or more save_observation/
     * submit_tool_review calls.
     *
     * @return array{reply: ?string, mode: string, provider: ?string, ready: bool}
     */
    public static function runReviewPass(): array
    {
        $pdo = Database::get();
        $prompt = "Run your regular review. Call list_open_observations first so you don't repeat a finding "
            . "you've already flagged. Then check team_activity, operational_health, founder_workload, and "
            . "pattern_history for anything genuinely worth surfacing — a real pattern, an unresolved tension, "
            . "something stuck or quietly failing. Also call list_pending_tool_reviews and give an honest "
            . "team-impact read on anything waiting there via submit_tool_review. Only call save_observation for "
            . "a settled finding actually backed by tool data, and only set wants_session true for something that "
            . "genuinely earns interrupting Caleb right now. If nothing meets that bar, say so plainly and don't "
            . "manufacture a finding just to have one.";

        return AiAgentEngine::run(
            self::buildChatSystemPrompt(),
            self::toolDeclarations(),
            self::toolDispatcher($pdo),
            [['role' => 'user', 'text' => $prompt]],
            null,
            null,
            6
        );
    }

    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('wendy_assistant_name') ?: 'Wendy';

        return "You are {$name}, sitting above the rest of Caleb's AI team — the same role Wendy Rhoades plays at "
            . "Axe Capital: not a trader or a reporter, the one person with real visibility into how everyone "
            . "(and Caleb himself) is actually doing, who reads the person and the pattern, not just the number.\n\n"
            . "Your job has three parts. First, performance oversight of the whole team: pull real activity from "
            . "team_activity (what every agent did, what's switched off, what's config-broken) and real technical "
            . "health from operational_health (site uptime, open incidents Chloe is tracking), and tell Caleb the "
            . "truth about how the studio is actually running — never a flattering gloss, never padding.\n\n"
            . "Second, watch Caleb himself — not just his workload but his decisions and working patterns over "
            . "time. founder_workload gives you his real project load, deadlines, and exactly what's sitting "
            . "unreviewed in his queue right now; pattern_history gives you real day-by-day history — team "
            . "action counts, whether his queue was empty or piling up each day and its trend, and which "
            . "chat-agents were first used within the window, a real signal for \"a new agent just got added.\" "
            . "Reach for pattern_history whenever the question is about a pattern rather than a moment — a queue "
            . "that keeps refilling rather than emptying, a habit of standing up a new agent while an existing "
            . "one's output sits unreviewed. When it shows a real pattern, name it plainly and push back — "
            . "including unresolved tension, like an agent's config_note or health field flagging something he's "
            . "visibly not acted on. A coach who lets a repeat happen to keep the peace isn't doing the job, and "
            . "that goes both directions: challenge the agents' output when it doesn't hold up too, not only "
            . "Caleb.\n\n"
            . "Third, mediate: when Caleb tells you two agents (or two signals) are pointing different directions "
            . "— Beacon likes a lead Dossier's research makes him wary of, Chief's brief reads one way and "
            . "Chloe's incidents read another — don't referee from instinct. Pull the real data each one is "
            . "actually built on via your tools and reconcile it with him, the way she'd sit Bobby and Chuck down "
            . "and work the actual facts rather than picking a side.\n\n"
            . "Fourth, you have real memory across conversations now — not of what was said, but of what you've "
            . "actually found. Open any conversation that touches patterns or performance by calling "
            . "list_open_observations, so you don't re-discover and re-save the same thing Caleb already knows "
            . "about. When pattern_history, team_activity, or founder_workload shows something genuinely worth "
            . "flagging — not every session, only a settled finding backed by real data — call save_observation "
            . "with a short summary, the fuller detail, and evidence naming exactly what backed it (which tool, "
            . "which numbers). Set wants_session true only for something that actually warrants Caleb opening "
            . "this chat specifically to deal with it, not routine commentary — this isn't cosmetic, it sends "
            . "him a real email and WhatsApp message immediately, in your own words (your summary and detail, "
            . "verbatim), not just a quiet count on the Team page. Interrupting him is a real cost; reserve it "
            . "for what actually earns it. Once he's actually dealt with something you flagged, call "
            . "resolve_observation so it stops showing as open. Save sparingly: a coach who logs every passing "
            . "thought is noise, not oversight.\n\n"
            . "Fifth, you're the team-impact gate on Allie's tool-adoption recommendations. Once she flags "
            . "one for you (call list_pending_tool_reviews to see what's waiting), read it and think about it "
            . "the way a coach thinks about a decision, not a technologist: what does adopting this actually "
            . "do to how the team works — whose workload shifts, what process changes, where a new dependency "
            . "or a new habit could quietly cause friction. Then call submit_tool_review with your honest "
            . "impact read; that's what clears it for Caleb's own final call, so don't rubber-stamp it and "
            . "don't invent a concern that isn't real either.\n\n"
            . "CRITICAL: never state a number, status, or fact you did not just get from a tool call in this "
            . "conversation. pattern_history is built from Chief's own daily briefs, so it only has real history "
            . "as far back as that cron has actually been running — when it reports too few days of data, say so "
            . "plainly and treat anything it still shows as provisional, not a confirmed pattern. You have no "
            . "memory of the words in a past conversation — every fact still has to come from a tool call this "
            . "turn, including list_open_observations for anything you've previously found; never claim to "
            . "recall something Caleb said in an earlier session that isn't sitting in an open observation you "
            . "just read. If a queue is empty or nothing is wrong, say so — manufacturing concern to sound "
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
                . 'Dossier, Ledger/Proposal, Sketch, Danielle/Content, Arch, Ada, Allie) over the last N hours, '
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

    private static function patternHistoryToolDeclaration(): array
    {
        return [
            'name' => 'pattern_history',
            'description' => 'Real day-by-day history, not just right now: team action counts, whether Caleb\'s '
                . 'waiting-on-you queue was empty or piling up each day and its trend (rising/falling/flat), and '
                . 'which chat-agents were first used within the window — a real, honest signal for "a new agent '
                . 'got added," since agent creation itself isn\'t a logged event but first use is. Built from '
                . 'Chief\'s own daily briefs, so it only has data as far back as that cron has actually run, and '
                . 'will say so plainly when there isn\'t enough history yet — never invent a trend when this tool '
                . 'reports insufficient data.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'days' => ['type' => 'INTEGER', 'description' => 'How many days back to look. Default 14, min 3, max 60.'],
                ],
                'required' => [],
            ],
        ];
    }

    /**
     * Reuses Chief's own daily-brief history (agent_daily_briefs) rather
     * than a second snapshot table — that cron already captures exactly the
     * numbers a pattern needs, one row per day, for free. "New agent" isn't
     * a logged event anywhere, so it's approximated honestly by the first
     * admin_activity_log row for each chat-agent's own entity_type — a real
     * timestamp, not a guess.
     *
     * @return array<string,mixed>
     */
    private static function patternHistory(\PDO $pdo, int $days): array
    {
        $days = max(3, min(60, $days ?: 14));
        $briefs = Chief::recentSnapshots($pdo, $days);

        $dailySnapshots = [];
        $queueTotals = [];
        foreach ($briefs as $brief) {
            $snapshot = json_decode((string) $brief['snapshot_json'], true) ?: [];
            $waiting = $snapshot['waiting_on_you'] ?? [];
            $queueTotal = array_sum(array_column($waiting, 'count'));
            $dailySnapshots[] = [
                'date' => $brief['brief_date'],
                'team_actions' => (int) ($snapshot['totals']['actions'] ?? 0),
                'agents_active' => (int) ($snapshot['totals']['agents_that_worked'] ?? 0),
                'queue_total' => $queueTotal,
                'queue_labels' => array_column($waiting, 'label'),
            ];
            $queueTotals[] = $queueTotal;
        }

        $trend = 'insufficient_data';
        if (count($queueTotals) >= 4) {
            $half = (int) floor(count($queueTotals) / 2);
            $firstAvg = array_sum(array_slice($queueTotals, 0, $half)) / max(1, $half);
            $secondAvg = array_sum(array_slice($queueTotals, -$half)) / max(1, $half);
            if ($secondAvg > $firstAvg * 1.2) {
                $trend = 'rising';
            } elseif ($secondAvg < $firstAvg * 0.8) {
                $trend = 'falling';
            } else {
                $trend = 'flat';
            }
        }

        $newAgents = [];
        try {
            $since = date('Y-m-d H:i:s', strtotime("-{$days} days"));
            $stmt = $pdo->prepare(
                "SELECT entity_type, MIN(created_at) AS first_used_at
                 FROM admin_activity_log
                 WHERE entity_type LIKE '%\\_chat' ESCAPE '\\'
                 GROUP BY entity_type
                 HAVING first_used_at >= ?
                 ORDER BY first_used_at ASC"
            );
            $stmt->execute([$since]);
            $newAgents = array_map(static fn(array $r): array => [
                'agent' => str_replace('_chat', '', (string) $r['entity_type']),
                'first_used_at' => $r['first_used_at'],
            ], $stmt->fetchAll(\PDO::FETCH_ASSOC));
        } catch (\Throwable $e) {
            // admin_activity_log always exists — an unexpected failure here
            // shouldn't fail the whole tool, just omit this one signal.
        }

        return [
            'window_days' => $days,
            'daily_snapshots_available' => count($dailySnapshots),
            'daily_snapshots' => $dailySnapshots,
            'queue_nonzero_days' => count(array_filter($queueTotals, static fn($n) => $n > 0)),
            'queue_trend' => $trend,
            'new_agents_first_used_in_window' => $newAgents,
            'note' => count($dailySnapshots) < 3
                ? "Fewer than 3 daily briefs exist in this window — Chief's daily-brief cron "
                    . '(database/send_daily_brief.php) needs to run for several more days before a real trend is '
                    . 'visible. Treat anything above as provisional, not a confirmed pattern.'
                : null,
        ];
    }

    // ------------------------------------------------------- observations

    private static function listOpenObservationsToolDeclaration(): array
    {
        return [
            'name' => 'list_open_observations',
            'description' => 'Your own open findings from past conversations — what you\'ve already flagged and '
                . 'haven\'t resolved yet. Call this at the start of any conversation touching patterns or '
                . 'performance so you don\'t re-discover and re-save something Caleb already knows about.',
            'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
        ];
    }

    /** @return array<int,array<string,mixed>> */
    private static function listOpenObservations(\PDO $pdo): array
    {
        return $pdo->query(
            "SELECT id, category, summary, detail, evidence, wants_session, created_at
             FROM wendy_observations WHERE status = 'open' ORDER BY created_at DESC"
        )->fetchAll(\PDO::FETCH_ASSOC) ?: [];
    }

    private static function saveObservationToolDeclaration(): array
    {
        return [
            'name' => 'save_observation',
            'description' => 'Save a genuine finding so it persists across conversations — this is what gives '
                . 'you real memory. Only call this for a settled finding actually backed by pattern_history, '
                . 'team_activity, founder_workload, or operational_health data, never a passing impression. Not '
                . 'for every conversation — save sparingly, the way a real coach writes down a real pattern, not '
                . 'every session\'s small talk.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'category' => ['type' => 'STRING', 'description' => 'One of: pattern, tension, mediation.'],
                    'summary' => ['type' => 'STRING', 'description' => 'One short line — what you found.'],
                    'detail' => ['type' => 'STRING', 'description' => 'The fuller read: what it means and why it matters.'],
                    'evidence' => ['type' => 'STRING', 'description' =>
                        'Exactly what data backed this — which tool, which numbers (e.g. "pattern_history: queue '
                        . 'non-zero 11 of last 14 days, trend rising; 2 new chat-agents first used in the same '
                        . 'window"). Never leave this vague.'],
                    'wants_session' => ['type' => 'BOOLEAN', 'description' =>
                        'True only if this genuinely warrants Caleb opening this chat specifically to deal with '
                        . 'it. This is not cosmetic: it sends him a real email and WhatsApp message right now, '
                        . 'in your voice (your summary and detail, verbatim), and marks the Team page with a '
                        . 'session-requested flag until he deals with it. Reserve it for what actually earns an '
                        . 'interruption — false for routine findings that can just sit as an open observation.'],
                ],
                'required' => ['summary', 'detail', 'evidence'],
            ],
        ];
    }

    /** @return array{saved:true,id:int}|array{error:string} */
    private static function saveObservation(\PDO $pdo, array $args): array
    {
        $summary = trim((string) ($args['summary'] ?? ''));
        $detail = trim((string) ($args['detail'] ?? ''));
        $evidence = trim((string) ($args['evidence'] ?? ''));
        if ($summary === '' || $detail === '' || $evidence === '') {
            return ['error' => 'Missing required fields — need summary, detail, and evidence.'];
        }
        $category = in_array($args['category'] ?? '', ['pattern', 'tension', 'mediation'], true)
            ? $args['category'] : 'pattern';

        $wantsSession = !empty($args['wants_session']);

        $stmt = $pdo->prepare(
            'INSERT INTO wendy_observations (category, summary, detail, evidence, wants_session)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$category, $summary, $detail, $evidence, $wantsSession ? 1 : 0]);
        $id = (int) $pdo->lastInsertId();

        if ($wantsSession) {
            self::notifySessionRequest($pdo, $id);
        }

        return ['saved' => true, 'id' => $id];
    }

    /**
     * Fires the actual "Wendy requests you" alert — the moment
     * wants_session is set, not something Caleb has to notice on the Team
     * page himself. Same shape as ChloeInvestigator::escalate(): per-channel
     * emailed_at/whatsapp_sent_at guards so a retry can never double-send,
     * and the message is Wendy's own summary/detail verbatim rather than a
     * generic template — she wrote it, she should sound like herself saying it.
     */
    private static function notifySessionRequest(\PDO $pdo, int $observationId): void
    {
        $stmt = $pdo->prepare('SELECT * FROM wendy_observations WHERE id = ?');
        $stmt->execute([$observationId]);
        $observation = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$observation) {
            return;
        }

        $name = Settings::get('wendy_assistant_name') ?: 'Wendy';
        $body = $observation['summary'] . "\n\n" . $observation['detail']
            . "\n\nBased on: " . $observation['evidence']
            . "\n\nTalk to her: https://princecaleb.dev/admin/agent-chat";

        $to = Settings::get('notification_email') ?: Settings::get('social_email');
        $emailDone = !$to || !empty($observation['emailed_at']);
        if (!$emailDone) {
            // The subject already said whose alert this was, but the body
            // itself didn't — unlike the WhatsApp send below, which already
            // prefixes $waBody with her name. Same fix, same reason.
            $emailDone = Mailer::send(
                $to,
                $name . ': session requested — ' . $observation['summary'],
                "{$name} here — {$body}"
            );
        }
        if ($emailDone && $to && empty($observation['emailed_at'])) {
            $pdo->prepare("UPDATE wendy_observations SET emailed_at = datetime('now') WHERE id = ?")
                ->execute([$observationId]);
        }

        $waConfigured = WhatsAppNotifier::isOwnerConfigured();
        $waDone = !$waConfigured || !empty($observation['whatsapp_sent_at']);
        if (!$waDone) {
            $waBody = "\u{1F534} {$name} — session requested\n\n" . $body;
            $waDone = WhatsAppNotifier::sendOwnerAlert($waBody, [
                'name' => $name,
                'reason' => 'Session requested: ' . $observation['summary'],
                'summary' => mb_substr((string) $observation['detail'], 0, 900),
                'message' => mb_substr($waBody, 0, 900),
            ]);
        }
        if ($waDone && $waConfigured && empty($observation['whatsapp_sent_at'])) {
            $pdo->prepare("UPDATE wendy_observations SET whatsapp_sent_at = datetime('now') WHERE id = ?")
                ->execute([$observationId]);
        }
    }

    private static function resolveObservationToolDeclaration(): array
    {
        return [
            'name' => 'resolve_observation',
            'description' => 'Mark a previously saved observation resolved once Caleb has actually dealt with '
                . 'it — in this conversation, he told you he\'s handled it or you both agreed it no longer '
                . 'applies. Do not resolve something he has only acknowledged hearing; resolve means dealt with.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'observation_id' => ['type' => 'INTEGER', 'description' => 'The observation ID, from list_open_observations.'],
                ],
                'required' => ['observation_id'],
            ],
        ];
    }

    /** @return array{resolved:true}|array{error:string} */
    private static function resolveObservation(\PDO $pdo, int $id): array
    {
        if ($id <= 0) {
            return ['error' => 'A valid observation_id is required.'];
        }
        $stmt = $pdo->prepare(
            "UPDATE wendy_observations SET status = 'resolved', resolved_at = datetime('now') WHERE id = ? AND status = 'open'"
        );
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            return ['error' => 'No open observation with that ID.'];
        }
        return ['resolved' => true];
    }

    // ------------------------------------------------------- tool reviews

    private static function listPendingToolReviewsToolDeclaration(): array
    {
        return [
            'name' => 'list_pending_tool_reviews',
            'description' => 'Tool-adoption recommendations Allie has flagged for your team-impact review — '
                . 'each one is waiting on your read before Caleb makes his final adopt/reject call. Call this '
                . 'whenever Caleb asks what\'s waiting on you, or at the start of a conversation about a tool.',
            'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
        ];
    }

    /** @return array<int,array<string,mixed>> */
    private static function listPendingToolReviews(\PDO $pdo): array
    {
        return $pdo->query(
            "SELECT id, tool_name, vendor_url, category, evaluation_findings, comparison_findings,
                    recommendation, recommendation_rationale, pilot_metric, pilot_owner, pilot_stop_loss, updated_at
             FROM allie_evaluations WHERE status = 'wendy_review' ORDER BY updated_at ASC"
        )->fetchAll(\PDO::FETCH_ASSOC) ?: [];
    }

    private static function submitToolReviewToolDeclaration(): array
    {
        return [
            'name' => 'submit_tool_review',
            'description' => 'Submit your team-impact review of a tool-adoption recommendation, from '
                . 'list_pending_tool_reviews. This clears it into Caleb\'s own approval queue — only call it '
                . 'once you\'ve actually thought through the impact, not as a formality.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'evaluation_id' => ['type' => 'INTEGER', 'description' => 'The evaluation ID, from list_pending_tool_reviews.'],
                    'impact_notes' => ['type' => 'STRING', 'description' =>
                        'Your honest read on what adopting this would actually do to how the team works — '
                        . 'whose workload shifts, what process changes, any friction or dependency risk you see. '
                        . 'Say plainly if you see no real concern rather than inventing one.'],
                ],
                'required' => ['evaluation_id', 'impact_notes'],
            ],
        ];
    }

    /** @return array{reviewed:true}|array{error:string} */
    private static function submitToolReview(\PDO $pdo, int $id, string $impactNotes): array
    {
        $impactNotes = trim($impactNotes);
        if ($id <= 0 || $impactNotes === '') {
            return ['error' => 'A valid evaluation_id and impact_notes are required.'];
        }
        $stmt = $pdo->prepare(
            "UPDATE allie_evaluations SET wendy_review_notes = ?, wendy_reviewed_at = datetime('now'), "
            . "status = 'pending_approval', updated_at = datetime('now') WHERE id = ? AND status = 'wendy_review'"
        );
        $stmt->execute([$impactNotes, $id]);
        if ($stmt->rowCount() === 0) {
            return ['error' => 'No evaluation awaiting review at that ID.'];
        }
        return ['reviewed' => true];
    }

    // ------------------------------------------------------------ admin API

    /** GET /api/v1/admin/wendy/observations?status=open */
    public static function observationsIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $status = trim((string) ($_GET['status'] ?? '')) ?: null;

        if ($status !== null) {
            $stmt = $pdo->prepare('SELECT * FROM wendy_observations WHERE status = ? ORDER BY created_at DESC');
            $stmt->execute([$status]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        } else {
            $rows = $pdo->query('SELECT * FROM wendy_observations ORDER BY created_at DESC LIMIT 100')->fetchAll(\PDO::FETCH_ASSOC);
        }

        Response::json(['observations' => $rows]);
    }

    /** POST /api/v1/admin/wendy/observations/{id}/dismiss — Caleb dismisses one directly, outside chat. */
    public static function dismissObservation(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) $params['id'];
        $stmt = Database::get()->prepare(
            "UPDATE wendy_observations SET status = 'dismissed', resolved_at = datetime('now') WHERE id = ? AND status = 'open'"
        );
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            Response::error('No open observation with that ID.', 404);
        }
        ActivityLog::log($user, 'dismissed', 'wendy_observation', $id);
        Response::json(['status' => 'dismissed']);
    }
}
