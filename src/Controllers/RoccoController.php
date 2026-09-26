<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiAgentEngine;
use App\Support\Database;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;
use App\Support\TypeSafeGate;
use App\Support\WhatsAppNotifier;

/**
 * Rocco: the bouncer on the door of Beacon's lead pipeline, owning the TypeSafe gate. A full agent in Wendy's mould, not just
 * a chat box. He watches the gate's shadow-mode audit (TypeSafeGate::report),
 * writes a periodic report with a plain verdict, and saves recommendations
 * (for example "safe to enforce", "leave in shadow", "the threshold looks too
 * strict") that wait on the admin Rocco page for Caleb to apply or dismiss.
 *
 * Rocco runs on his own cron (database/rocco_review.php, gated by
 * rocco_review_enabled, off by default) via runReviewPass(), and chat() stays
 * available any time. Restraint is the same as Wendy's: only a settled
 * finding backed by the report's real numbers is saved, and only
 * wants_attention earns Caleb an email and WhatsApp interruption.
 *
 * He can switch the gate mode, but only when Caleb asks in chat or presses
 * Apply on a recommendation. Enforcing is refused unless the report verdict
 * is "safe", except when Caleb explicitly overrides that in chat.
 */
class RoccoController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;
    private const ACTIONS = ['none', 'enforce', 'shadow', 'off', 'threshold', 'competitor_cutoff'];

    /** POST /api/v1/admin/agents/rocco/chat — body: {message, transcript: [{role,text}, ...]}. */
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
            self::buildSystemPrompt(false),
            self::toolDeclarations(),
            self::toolDispatcher($pdo, $user),
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply. Check that an AI provider is configured and reachable.', 502);
        }

        ActivityLog::log($user, 'reviewed', 'rocco_chat', null, mb_substr($message, 0, 120));

        Response::json(['reply' => SharedAgentTools::stripMarkdown($result['reply'])]);
    }

    /**
     * The autonomous entry point, run from database/rocco_review.php on a cron
     * and from the "Run review now" button. Same engine, tools and persona as
     * a chat turn, with a synthetic prompt. Mode changes are not available to
     * this pass: it recommends, Caleb decides.
     *
     * @return array{reply: ?string, mode: string, provider: ?string, ready: bool}
     */
    public static function runReviewPass(): array
    {
        $pdo = Database::get();
        $prompt = "Run your regular review of the TypeSafe gate. Call list_open_recommendations first so you "
            . "don't repeat one you've already made. Then call get_gate_report. Write the report with save_report "
            . "(a short plain-English summary of where the gate stands, using the real numbers). If the numbers "
            . "support a concrete next step (enforce, keep shadow, turn off, or a threshold worth re-tuning), call "
            . "save_recommendation with the evidence. If something you recommended earlier is now settled or no "
            . "longer true, call resolve_recommendation. Only set wants_attention true if Caleb should act now, "
            . "for example the gate has just become safe to enforce, or it has stopped logging entirely. If there "
            . "is too little data, say so in the report and do not manufacture a recommendation.";

        return AiAgentEngine::run(
            self::buildSystemPrompt(true),
            self::toolDeclarations(false),
            self::toolDispatcher($pdo, null),
            [['role' => 'user', 'text' => $prompt]],
            null,
            null,
            6
        );
    }

    // ---------------------------------------------------------------- tools

    /** @return array<int,array<string,mixed>> */
    private static function toolDeclarations(bool $withModeChange = true): array
    {
        $tools = [
            [
                'name' => 'get_gate_report',
                'description' => 'Read the TypeSafe gate shadow-mode results: current mode, whether an API key is '
                    . 'set, how many candidates were judged, per-path (post, engagement) threshold sweeps of calls '
                    . 'saved vs real leads missed, and a computed verdict. Call this before saying anything about '
                    . 'how the gate is doing.',
                'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
            ],
            [
                'name' => 'list_open_recommendations',
                'description' => 'Your own open recommendations and the last few reports, so you do not repeat yourself.',
                'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
            ],
            [
                'name' => 'save_report',
                'description' => 'Save a report snapshot: a short plain-English summary of where the gate stands, '
                    . 'stored with the current numbers so the history can be read later.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'summary' => ['type' => 'STRING', 'description' => 'Two to five plain sentences with the real numbers.'],
                    ],
                    'required' => ['summary'],
                ],
            ],
            [
                'name' => 'save_recommendation',
                'description' => 'Save a recommendation for Caleb to apply or dismiss on the Rocco page. Only for a '
                    . 'settled finding backed by get_gate_report numbers, never a passing impression.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'category' => ['type' => 'STRING', 'description' => 'One of: mode, threshold, data, cost.'],
                        'summary' => ['type' => 'STRING', 'description' => 'One short line: what you recommend.'],
                        'detail' => ['type' => 'STRING', 'description' => 'The fuller read: what it means and why.'],
                        'evidence' => ['type' => 'STRING', 'description' => 'Exactly which numbers back it (e.g. "post: 412 candidates, 68% saved, 0 leads missed at 1.0").'],
                        'action' => ['type' => 'STRING', 'description' => 'One of: none, enforce, shadow, off, threshold, competitor_cutoff. What Apply should do: switch the gate mode, set the score threshold, or set the competitor cutoff (the last two need action_value), or none if it is advice only.'],
                        'action_value' => ['type' => 'STRING', 'description' => 'Only for action=threshold or competitor_cutoff: the new value as a number. Score threshold 0.25 to 1.75 (e.g. 1.25), competitor cutoff 0.2 to 0.9 (e.g. 0.4).'],
                        'wants_attention' => ['type' => 'BOOLEAN', 'description' => 'True only if Caleb should act now. Sends a real email and WhatsApp message.'],
                    ],
                    'required' => ['summary', 'detail', 'evidence'],
                ],
            ],
            [
                'name' => 'resolve_recommendation',
                'description' => 'Mark one of your open recommendations resolved once it is settled or no longer true.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => ['recommendation_id' => ['type' => 'INTEGER', 'description' => 'ID from list_open_recommendations.']],
                    'required' => ['recommendation_id'],
                ],
            ],
        ];
        if ($withModeChange) {
            $tools[] = [
                'name' => 'set_gate_thresholds',
                'description' => 'Change how strict the gate is. score_threshold: candidates scoring below it are rejected '
                    . '(0.25 to 1.75, default 1.0, higher is stricter). competitor_cutoff: candidates whose competitor '
                    . 'probability is at or above it are rejected (0.2 to 0.9, default 0.5, lower is stricter). Only call '
                    . 'this when Caleb has explicitly asked for the change in this conversation. Out-of-range values are refused.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'score_threshold' => ['type' => 'NUMBER', 'description' => 'New score threshold, optional.'],
                        'competitor_cutoff' => ['type' => 'NUMBER', 'description' => 'New competitor cutoff, optional.'],
                    ],
                ],
            ];
            $tools[] = [
                'name' => 'set_gate_mode',
                'description' => 'Change the gate mode. Only call this when Caleb has explicitly asked for the change '
                    . 'in this conversation, never on your own initiative. Enforcing is refused unless the report '
                    . 'verdict is "safe", unless override_safety_check is true, which you may only set when Caleb '
                    . 'has explicitly said to enforce despite the warning.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'mode' => ['type' => 'STRING', 'description' => 'shadow, enforce or off.'],
                        'override_safety_check' => ['type' => 'BOOLEAN', 'description' => 'Only true if Caleb explicitly overrode the safety warning.'],
                    ],
                    'required' => ['mode'],
                ],
            ];
        }
        return $tools;
    }

    private static function toolDispatcher(\PDO $pdo, ?array $user): \Closure
    {
        return fn(string $name, array $args) => match ($name) {
            'get_gate_report' => TypeSafeGate::report(),
            'list_open_recommendations' => [
                'recommendations' => self::openRecommendations($pdo),
                'recent_reports' => $pdo->query(
                    'SELECT id, verdict, summary, total, created_at FROM rocco_reports ORDER BY id DESC LIMIT 3'
                )->fetchAll(\PDO::FETCH_ASSOC),
            ],
            'save_report' => self::saveReport($pdo, (string) ($args['summary'] ?? '')),
            'save_recommendation' => self::saveRecommendation($pdo, $args),
            'resolve_recommendation' => self::resolveRecommendation($pdo, (int) ($args['recommendation_id'] ?? 0)),
            'set_gate_mode' => $user === null
                ? ['error' => 'Mode changes are not available in a scheduled review. Save a recommendation instead.']
                : self::setGateMode($user, (string) ($args['mode'] ?? ''), (bool) ($args['override_safety_check'] ?? false)),
            'set_gate_thresholds' => $user === null
                ? ['error' => 'Threshold changes are not available in a scheduled review. Save a recommendation instead.']
                : self::setGateThresholds(
                    $user,
                    isset($args['score_threshold']) && is_numeric($args['score_threshold']) ? (float) $args['score_threshold'] : null,
                    isset($args['competitor_cutoff']) && is_numeric($args['competitor_cutoff']) ? (float) $args['competitor_cutoff'] : null
                ),
            default => ['error' => 'Unknown tool.'],
        };
    }

    /** @return array<int,array<string,mixed>> */
    private static function openRecommendations(\PDO $pdo): array
    {
        return $pdo->query(
            "SELECT id, category, summary, detail, evidence, action, action_value, wants_attention, created_at
             FROM rocco_recommendations WHERE status = 'open' ORDER BY created_at DESC"
        )->fetchAll(\PDO::FETCH_ASSOC) ?: [];
    }

    /** @return array<string,mixed> */
    private static function saveReport(\PDO $pdo, string $summary): array
    {
        $summary = trim($summary);
        if ($summary === '') {
            return ['error' => 'summary is required.'];
        }
        $report = TypeSafeGate::report();
        $stmt = $pdo->prepare(
            'INSERT INTO rocco_reports (verdict, summary, total, mode, snapshot_json) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$report['verdict'], $summary, $report['total'], $report['mode'], json_encode($report)]);
        return ['saved' => true, 'id' => (int) $pdo->lastInsertId()];
    }

    /** @return array<string,mixed> */
    private static function saveRecommendation(\PDO $pdo, array $args): array
    {
        $summary = trim((string) ($args['summary'] ?? ''));
        $detail = trim((string) ($args['detail'] ?? ''));
        $evidence = trim((string) ($args['evidence'] ?? ''));
        if ($summary === '' || $detail === '' || $evidence === '') {
            return ['error' => 'Missing required fields: need summary, detail, and evidence.'];
        }
        $category = in_array($args['category'] ?? '', ['mode', 'threshold', 'data', 'cost'], true) ? $args['category'] : 'mode';
        $action = in_array($args['action'] ?? '', self::ACTIONS, true) ? $args['action'] : 'none';
        $wants = !empty($args['wants_attention']);
        $actionValue = null;
        if ($action === 'threshold' || $action === 'competitor_cutoff') {
            [$min, $max] = $action === 'threshold'
                ? [TypeSafeGate::SCORE_MIN, TypeSafeGate::SCORE_MAX]
                : [TypeSafeGate::COMPETITOR_MIN, TypeSafeGate::COMPETITOR_MAX];
            $value = $args['action_value'] ?? null;
            if (!is_numeric($value) || (float) $value < $min || (float) $value > $max) {
                return ['error' => sprintf('action=%s needs action_value, a number between %.2f and %.2f.', $action, $min, $max)];
            }
            $actionValue = (string) (float) $value;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO rocco_recommendations (category, summary, detail, evidence, action, action_value, wants_attention)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$category, $summary, $detail, $evidence, $action, $actionValue, $wants ? 1 : 0]);
        $id = (int) $pdo->lastInsertId();
        if ($wants) {
            self::notifyAttention($pdo, $id);
        }
        return ['saved' => true, 'id' => $id];
    }

    /** @return array<string,mixed> */
    private static function resolveRecommendation(\PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare(
            "UPDATE rocco_recommendations SET status = 'resolved', resolved_at = datetime('now') WHERE id = ? AND status = 'open'"
        );
        $stmt->execute([$id]);
        return $stmt->rowCount() > 0 ? ['resolved' => true] : ['error' => 'No open recommendation with that ID.'];
    }

    /** @return array<string,mixed> */
    private static function setGateThresholds(array $user, ?float $score, ?float $competitor): array
    {
        $result = TypeSafeGate::setThresholds($score, $competitor);
        if (!empty($result['changed'])) {
            ActivityLog::log($user, 'changed', 'typesafe_gate_thresholds', null, json_encode($result['now']));
        }
        return $result;
    }

    /**
     * Shared by the chat tool and the page's Apply button. Enforcing needs
     * the report verdict to be "safe" unless explicitly overridden.
     *
     * @return array<string,mixed>
     */
    private static function setGateMode(array $user, string $mode, bool $override): array
    {
        if (!in_array($mode, ['shadow', 'enforce', 'off'], true)) {
            return ['error' => 'mode must be shadow, enforce or off.'];
        }
        $previous = TypeSafeGate::mode();
        if ($mode === 'enforce' && !$override) {
            $report = TypeSafeGate::report();
            if ($report['verdict'] !== 'safe') {
                return [
                    'changed' => false,
                    'reason' => 'Refused: the report does not say it is safe to enforce yet. ' . $report['verdict_text']
                        . ' Only retry with override_safety_check=true if Caleb explicitly said to enforce anyway.',
                ];
            }
        }
        Settings::set('typesafe_gate_mode', $mode);
        ActivityLog::log($user, 'changed', 'typesafe_gate_mode', null, "{$previous} -> {$mode}" . ($override ? ' (override)' : ''));
        return ['changed' => true, 'previous_mode' => $previous, 'new_mode' => $mode];
    }

    /**
     * The "Rocco needs you" alert, fired the moment wants_attention is set.
     * Same shape as Wendy's: per-channel emailed_at/whatsapp_sent_at guards so
     * a retry never double-sends, and the message is her own words.
     */
    private static function notifyAttention(\PDO $pdo, int $id): void
    {
        $stmt = $pdo->prepare('SELECT * FROM rocco_recommendations WHERE id = ?');
        $stmt->execute([$id]);
        $rec = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$rec) {
            return;
        }

        $name = Settings::get('rocco_assistant_name') ?: 'Rocco';
        $body = $rec['summary'] . "\n\n" . $rec['detail']
            . "\n\nBased on: " . $rec['evidence']
            . "\n\nReview it: https://princecaleb.dev/admin/rocco";

        $to = Settings::get('notification_email') ?: Settings::get('social_email');
        $emailDone = !$to || !empty($rec['emailed_at']);
        if (!$emailDone) {
            $emailDone = Mailer::send($to, $name . ': needs your attention: ' . $rec['summary'], "{$name} here. {$body}");
        }
        if ($emailDone && $to && empty($rec['emailed_at'])) {
            $pdo->prepare("UPDATE rocco_recommendations SET emailed_at = datetime('now') WHERE id = ?")->execute([$id]);
        }

        $waConfigured = WhatsAppNotifier::isOwnerConfigured();
        $waDone = !$waConfigured || !empty($rec['whatsapp_sent_at']);
        if (!$waDone) {
            $waBody = "\u{1F6AA} {$name}: needs your attention\n\n" . $body;
            $waDone = WhatsAppNotifier::sendOwnerAlert($waBody, [
                'name' => $name,
                'reason' => 'Attention: ' . $rec['summary'],
                'summary' => mb_substr((string) $rec['detail'], 0, 900),
                'message' => mb_substr($waBody, 0, 900),
            ]);
        }
        if ($waDone && $waConfigured && empty($rec['whatsapp_sent_at'])) {
            $pdo->prepare("UPDATE rocco_recommendations SET whatsapp_sent_at = datetime('now') WHERE id = ?")->execute([$id]);
        }
    }

    // --------------------------------------------------------------- prompt

    private static function buildSystemPrompt(bool $scheduled): string
    {
        $name = Settings::get('rocco_assistant_name') ?: 'Rocco';
        $genderLine = self::genderLine((string) Settings::get('rocco_voice_gender'));

        return "You are {$name}, the bouncer on Prince Caleb's AI team. Prince Caleb is a solo developer who builds "
            . "AI voice agents, chatbots and business automations, and runs princecaleb.dev.{$genderLine}\n\n"
            . "Your job is the door: nothing gets past the velvet rope into the expensive room unless it earns it. "
            . "You own the TypeSafe gate in front of Beacon, the social lead-finding agent. Beacon reads scraped "
            . "social posts and LinkedIn engagers and decides whether each is a real prospect, using an expensive "
            . "generative AI call. The gate is a cheap pre-check (TypeSafe's typed-judgment API) that could turn away "
            . "the obvious non-leads before that expensive call. It has three modes: shadow (default: it judges "
            . "and logs what it would have done but rejects nothing, so its thresholds can be checked), enforce "
            . "(a rejected candidate skips the expensive call), and off.\n\n"
            . "Always call get_gate_report before saying how the gate is doing, and quote its real numbers. Never "
            . "invent figures. If it has too little data, say so and roughly how much more is needed. If "
            . "table_missing is true, say to run php database/migrate.php on the server. If has_key is false, say to "
            . "save the TypeSafe API key in Admin, Settings, Integrations. If the gate has a key and is in shadow mode "
            . "but total is still 0 after several days, that is worth flagging: Beacon discovery may not be running, "
            . "or the TypeSafe calls are failing.\n\n"
            . "Explain things for a smart non-developer: no jargon, short sentences, concrete numbers. The two numbers "
            . "that matter are calls saved (expensive AI calls that would be skipped) and leads missed (real prospects "
            . "the gate would wrongly have thrown away). Missing leads is the costly mistake; saving fewer calls is "
            . "only a missed saving. Money matters too: get_gate_report includes a cost block with the gate's spend and the "
            . "AI calls saved, but only when Caleb has entered prices in Settings. If the prices are null, say so and ask him to "
            . "enter the TypeSafe cost per call and the estimated cost of one full Beacon scoring call, never guess a "
            . "price. When the prices are set, judge whether the gate is actually worth it: a gate that misses no leads "
            . "but costs more than it saves should be turned off, and you should say so plainly.\n\n"
            . "You keep memory in two ways: save_report writes a report snapshot with a plain summary, and "
            . "save_recommendation writes a recommendation that waits on the Rocco page for Caleb to apply or dismiss. "
            . "Save sparingly and only when backed by the numbers. A recommendation can carry an action (enforce, "
            . "shadow, off) that the page's Apply button performs, so only set one you would stand behind. The gate's strictness is a "
            . "score threshold (candidates scoring below it are rejected; higher is stricter) and a competitor cutoff. "
            . "get_gate_report shows, per path, a sweep of calls saved vs leads missed at each score threshold (sweep) and at each "
            . "competitor cutoff (competitor_sweep). If a different value would save more calls without missing leads, save a "
            . "recommendation with action threshold or competitor_cutoff and action_value set to that number, and Caleb can Apply it.\n\n"
            . ($scheduled
                ? "This is a scheduled review, not a conversation. You cannot change the gate mode or thresholds here; recommend, and Caleb decides.\n\n"
                : "You may change the gate mode with set_gate_mode and its strictness with set_gate_thresholds, but only when Caleb explicitly asks in this conversation. "
                . "Recommend, do not act on your own. If he asks to enforce and the tool refuses, explain why in plain "
                . "terms and offer to keep it in shadow. Only override the safety check if he explicitly says to enforce "
                . "anyway. Confirm afterwards exactly what changed.\n\n")
            . "Speak naturally, never output JSON unless asked. Voice: a seasoned club bouncer who is good at the "
            . "job. Calm, firm, few words, dry humour, never rattled. Door metaphors are welcome in small doses "
            . "(who is on the list, who gets turned away, letting the wrong one in), but never at the cost of "
            . "clarity or a real number. You are protective of Caleb's time and money, and you say so plainly when "
            . "the door is not ready to be trusted. Never salesy, never a pushover.";
    }

    private static function genderLine(string $gender): string
    {
        if ($gender === 'male') {
            return ' Internally you may think of yourself as he/him.';
        }
        if ($gender === 'female') {
            return ' Internally you may think of yourself as she/her.';
        }
        return '';
    }

    // ------------------------------------------------------------ admin API

    /** GET /api/v1/admin/rocco/overview — everything the Rocco page shows. */
    public static function overview(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        Response::json(self::overviewData($pdo));
    }

    /** @return array<string,mixed> */
    public static function overviewData(\PDO $pdo): array
    {
        $safe = static function (string $sql) use ($pdo): array {
            try {
                return $pdo->query($sql)->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            } catch (\Throwable $e) {
                return []; // tables appear once migrate.php has run
            }
        };
        return [
            'report' => TypeSafeGate::report(),
            'recommendations' => $safe('SELECT * FROM rocco_recommendations ORDER BY created_at DESC LIMIT 100'),
            'reports' => $safe('SELECT id, verdict, summary, total, mode, created_at FROM rocco_reports ORDER BY id DESC LIMIT 20'),
            'review_enabled' => (string) Settings::get('rocco_review_enabled') === '1',
            'review_frequency' => Settings::get('rocco_review_frequency') ?: 'weekly',
            'last_review_at' => Settings::get('rocco_review_last_run'),
        ];
    }

    /** POST /api/v1/admin/rocco/review — run a review pass now. */
    public static function reviewNow(): void
    {
        $user = AuthMiddleware::requireAuth();
        $result = self::runReviewPass();
        if ($result['reply'] === null) {
            Response::error('No AI provider produced a reply. Check that one is configured and reachable.', 502);
        }
        Settings::set('rocco_review_last_run', gmdate('Y-m-d H:i:s'));
        ActivityLog::log($user, 'reviewed', 'rocco_review', null, 'manual review');
        Response::json(['status' => 'done', 'reply' => $result['reply']]);
    }

    /** POST /api/v1/admin/rocco/recommendations/{id}/apply — perform the recommendation's action. */
    public static function applyRecommendation(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $id = (int) $params['id'];
        $stmt = $pdo->prepare("SELECT * FROM rocco_recommendations WHERE id = ? AND status = 'open'");
        $stmt->execute([$id]);
        $rec = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$rec) {
            Response::error('No open recommendation with that ID.', 404);
        }
        if ($rec['action'] === 'none') {
            Response::error('This recommendation is advice only, there is nothing to apply.', 422);
        }

        $value = is_numeric($rec['action_value']) ? (float) $rec['action_value'] : null;
        $result = match ($rec['action']) {
            'threshold' => self::setGateThresholds($user, $value, null),
            'competitor_cutoff' => self::setGateThresholds($user, null, $value),
            default => self::setGateMode($user, (string) $rec['action'], false),
        };
        if (empty($result['changed'])) {
            Response::error((string) ($result['reason'] ?? $result['error'] ?? 'Could not apply.'), 409);
        }
        $pdo->prepare("UPDATE rocco_recommendations SET status = 'applied', resolved_at = datetime('now') WHERE id = ?")->execute([$id]);
        ActivityLog::log($user, 'applied', 'rocco_recommendation', $id);
        Response::json(['status' => 'applied'] + $result);
    }

    /** POST /api/v1/admin/rocco/recommendations/{id}/dismiss */
    public static function dismissRecommendation(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) $params['id'];
        $stmt = Database::get()->prepare(
            "UPDATE rocco_recommendations SET status = 'dismissed', resolved_at = datetime('now') WHERE id = ? AND status = 'open'"
        );
        $stmt->execute([$id]);
        if ($stmt->rowCount() === 0) {
            Response::error('No open recommendation with that ID.', 404);
        }
        ActivityLog::log($user, 'dismissed', 'rocco_recommendation', $id);
        Response::json(['status' => 'dismissed']);
    }
}
