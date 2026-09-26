<?php

declare(strict_types=1);

namespace App\Support;

use App\Controllers\LiveChatController;

/**
 * Jev (TypeSafe System One) as Lisa's decision layer, on the live chat and on
 * WhatsApp. One call per inbound message asks several narrow typed questions
 * over the same state (the newest message plus the recent conversation): what
 * the person wants, whether they want a human, are upset, are opting out, how
 * urgent and how ready to buy they are. Jev returns probabilities; this class
 * turns them into a small, explicit set of actions with fixed thresholds.
 * Code owns the decisions and the side effects, Jev only supplies the reading.
 *
 * Actions: opt the contact out of all follow-ups, hand off to Caleb (the
 * existing inquiry path), message Caleb's WhatsApp (hot lead, needs you,
 * urgent), and a short steering note for Lisa's reply (empathise first, do not
 * pitch someone who is opting out).
 *
 * Setting `lisa_jev_mode`: 'shadow' (default) assesses and records what it
 * would do but changes nothing and does not touch Lisa's reply; 'live' acts;
 * 'off' disables. Fails open: no TypeSafe key, a timeout or a bad response
 * means Lisa behaves exactly as she did before.
 */
final class LisaJudgment
{
    // Thresholds are deliberately explicit and conservative. A noul answer is a
    // probability of yes; a score runs 0..(levels-1).
    public const OPT_OUT_AT = 0.80;
    public const WANTS_HUMAN_AT = 0.75;
    public const UPSET_AT = 0.80;
    public const HOT_LEAD_AT = 2.4;   // buying_intent, 0..3
    public const URGENT_AT = 1.6;     // urgency, 0..2
    public const COMPLAINT_CONFIDENCE_AT = 0.70;
    private const DEFAULT_DAILY_ALERT_CAP = 8;

    private const INTENTS = [
        'booking_request', 'pricing_question', 'new_project_inquiry',
        'existing_client_support', 'complaint_or_dispute', 'spam_or_irrelevant', 'general_chat',
    ];

    /**
     * Test seam: fn(string $body, array $fields): bool, used instead of WhatsAppNotifier so a test can
     * capture an owner alert without messaging anyone. Never set in production code.
     *
     * @var callable|null
     */
    public static $ownerSender = null;

    public static function mode(): string
    {
        $mode = strtolower(trim((string) Settings::get('lisa_jev_mode')));
        return in_array($mode, ['off', 'live'], true) ? $mode : 'shadow';
    }

    /**
     * One Jev call over the newest message and the recent conversation.
     *
     * @param array<int,array<string,mixed>> $transcript ends with the newest user turn
     * @return array<string,mixed>|null null on any failure (fail open)
     */
    public static function assess(string $message, array $transcript, string $channel): ?array
    {
        $recent = [];
        foreach (array_slice($transcript, -9, 8) as $turn) { // the 8 turns before the newest one
            $text = trim((string) ($turn['text'] ?? ''));
            if ($text === '') {
                continue;
            }
            $recent[] = [
                'speaker' => (($turn['role'] ?? '') === 'user') ? 'customer' : 'Lisa (our assistant)',
                'text' => mb_substr($text, 0, 500),
            ];
        }
        $state = [
            'channel' => $channel,
            'business' => 'A one-person web, mobile and AI automation studio (Prince Caleb) run through an assistant called Lisa.',
            'earlier_conversation' => $recent,
            'newest_customer_message' => mb_substr($message, 0, 1000),
        ];

        $answers = TypeSafeClient::ask($state, self::questions(), 5, 'LisaJudgment');
        if ($answers === null) {
            return null;
        }

        $intent = TypeSafeClient::choice($answers, 'intent');
        $optOut = TypeSafeClient::noul($answers, 'opt_out');
        $wantsHuman = TypeSafeClient::noul($answers, 'wants_human');
        $upset = TypeSafeClient::noul($answers, 'upset');
        $urgency = TypeSafeClient::score($answers, 'urgency');
        $buying = TypeSafeClient::score($answers, 'buying_intent');
        if ($intent === null || $optOut === null || $wantsHuman === null || $upset === null || $urgency === null || $buying === null) {
            error_log('LisaJudgment: incomplete answers: ' . substr((string) json_encode($answers), 0, 500));
            return null;
        }

        return [
            'intent' => in_array($intent['choice'], self::INTENTS, true) ? $intent['choice'] : 'general_chat',
            'intent_confidence' => round($intent['confidence'], 3),
            'opt_out' => round($optOut, 3),
            'wants_human' => round($wantsHuman, 3),
            'upset' => round($upset, 3),
            'urgency' => round($urgency, 3),
            'buying_intent' => round($buying, 3),
        ];
    }

    /** @return array<string,array<string,mixed>> */
    private static function questions(): array
    {
        return [
            'intent' => [
                'type' => 'choice',
                'instructions' => 'What is the customer\'s newest message mainly about, given the conversation so far?',
                'criteria' => [
                    'booking_request' => 'Wants to book, move or cancel a call or meeting.',
                    'pricing_question' => 'Asks what something costs, or asks for a quote.',
                    'new_project_inquiry' => 'Describes a website, app or automation they want built, or asks what the studio can do for them.',
                    'existing_client_support' => 'An existing client asking about work in progress, an invoice, files or a delivery.',
                    'complaint_or_dispute' => 'Complains, disputes a charge or asks for a refund.',
                    'spam_or_irrelevant' => 'Advertising, a bot, a scam, or nothing to do with the studio.',
                    'general_chat' => 'Greetings, thanks, small talk or anything that fits none of the above.',
                ],
            ],
            'opt_out' => [
                'type' => 'noul',
                'instructions' => 'Is the customer asking not to be contacted or followed up again, saying stop, or clearly saying they are not interested and want the conversation to end?',
                'criteria' => [
                    'true' => 'Explicitly asks us to stop messaging them, unsubscribe, leave them alone, or says they are not interested and do not want follow-ups.',
                    'false' => 'Anything else, including polite hesitation such as "maybe later" or "let me think".',
                ],
            ],
            'wants_human' => [
                'type' => 'noul',
                'instructions' => 'Does the customer ask to speak with a real person, with Caleb himself, or express that the assistant is not helping them?',
                'criteria' => [
                    'true' => 'Asks for a human, the owner, a call from a person, or says the assistant cannot help them.',
                    'false' => 'Is content talking to the assistant.',
                ],
            ],
            'upset' => [
                'type' => 'noul',
                'instructions' => 'Is the customer angry, frustrated, or complaining in their newest message?',
                'criteria' => [
                    'true' => 'Clear anger, frustration, threats to leave, or a complaint.',
                    'false' => 'Neutral, curious, friendly or mildly impatient at most.',
                ],
            ],
            'urgency' => [
                'type' => 'score',
                'instructions' => 'How time-sensitive is what the customer needs from us right now?',
                'criteria' => [
                    'No time pressure expressed.',
                    'Would like an answer soon, e.g. this week.',
                    'Needs something today or is blocked right now.',
                ],
            ],
            'buying_intent' => [
                'type' => 'score',
                'instructions' => 'How ready is this person to hire the studio, judged from the whole conversation and not only the newest message?',
                'criteria' => [
                    'Not a prospect: support, spam, small talk or someone who will not hire.',
                    'Browsing: general questions, no project of their own described.',
                    'Serious interest: describes a concrete project or need of their own and asks about scope, timing or cost.',
                    'Ready to commit: asks how to start, to book, to pay, or gives go-ahead details.',
                ],
            ],
        ];
    }

    /**
     * Pure decision from signals to actions. No side effects, so it is
     * trivial to test. Each action is [type, reason].
     *
     * @param array<string,mixed> $signals
     * @return array<int,array{type:string,reason:string}>
     */
    public static function decide(array $signals, bool $isWhatsApp): array
    {
        $actions = [];
        $needsYou = ($signals['wants_human'] >= self::WANTS_HUMAN_AT)
            || ($signals['upset'] >= self::UPSET_AT)
            || ($signals['intent'] === 'complaint_or_dispute' && $signals['intent_confidence'] >= self::COMPLAINT_CONFIDENCE_AT);
        $optOut = $signals['opt_out'] >= self::OPT_OUT_AT;

        if ($optOut && $isWhatsApp) {
            $actions[] = ['type' => 'opt_out', 'reason' => 'asked not to be contacted'];
        }
        if ($needsYou && !$optOut) {
            $actions[] = ['type' => 'handoff', 'reason' => 'wants a person or is upset'];
            $actions[] = ['type' => 'owner_alert', 'reason' => 'needs_you'];
        }
        $prospectIntent = in_array($signals['intent'], ['new_project_inquiry', 'pricing_question', 'booking_request'], true);
        if (!$needsYou && !$optOut && $signals['buying_intent'] >= self::HOT_LEAD_AT && $prospectIntent) {
            $actions[] = ['type' => 'owner_alert', 'reason' => 'hot_lead'];
        }
        if (!$needsYou && !$optOut && $signals['urgency'] >= self::URGENT_AT && $signals['intent'] !== 'spam_or_irrelevant') {
            $actions[] = ['type' => 'owner_alert', 'reason' => 'urgent'];
        }
        return $actions;
    }

    /** Does this message belong to a project or price conversation worth a scope reading? */
    public static function wantsPricing(array $signals): bool
    {
        return in_array($signals['intent'], ['pricing_question', 'new_project_inquiry'], true)
            || ($signals['buying_intent'] >= 1.0 && $signals['intent'] !== 'spam_or_irrelevant');
    }

    /** A short steer for Lisa's system prompt, only used in live mode. */
    public static function promptNote(array $signals): ?string
    {
        $notes = [];
        if ($signals['opt_out'] >= self::OPT_OUT_AT) {
            $notes[] = 'This person is asking not to be contacted again. Acknowledge briefly and kindly, confirm there will be no more messages, and do not pitch or ask questions.';
        } elseif ($signals['wants_human'] >= self::WANTS_HUMAN_AT) {
            $notes[] = 'This person wants a real person. Caleb has been notified and will reply personally. Say so plainly and stop pitching.';
        } elseif ($signals['upset'] >= self::UPSET_AT) {
            $notes[] = 'This person seems frustrated. Acknowledge that first, no upselling, and tell them Caleb has been notified.';
        }
        if ($signals['intent'] === 'spam_or_irrelevant' && $signals['intent_confidence'] >= 0.7) {
            $notes[] = 'This looks like spam or unrelated to the studio. Keep the reply short and share no project details.';
        }
        return $notes === [] ? null : "DECISION SIGNALS (from a separate reading of this message):\n- " . implode("\n- ", $notes);
    }

    /**
     * The whole per-message flow, called from LiveChatController::generateReply().
     * Never throws: any failure returns an empty result and Lisa carries on.
     *
     * @param array{message:string,transcript:array,channel:string,session_token:?string,name:string,phone:string,is_owner:bool} $ctx
     * @return array{prompt_note:?string,signals:?array,actions:array}
     */
    public static function process(array $ctx): array
    {
        $empty = ['prompt_note' => null, 'signals' => null, 'actions' => []];
        try {
            $mode = self::mode();
            if ($mode === 'off' || $ctx['is_owner'] || !TypeSafeClient::hasKey()) {
                return $empty;
            }
            $signals = self::assess($ctx['message'], $ctx['transcript'], $ctx['channel']);
            if ($signals === null) {
                return $empty;
            }

            $pdo = Database::get();
            $token = $ctx['session_token'];
            if ($token !== null) {
                $pdo->prepare('UPDATE chat_sessions SET lisa_signals_json = ?, lisa_signals_at = datetime(\'now\') WHERE token = ?')
                    ->execute([json_encode($signals), $token]);
            }

            // Pricing: a project or price conversation gets a scope reading and a
            // pricing decision (LisaQuoting). Done first so a quote alert to the
            // owner can stand in for a separate hot-lead ping about the same message.
            $quote = ['prompt_note' => null, 'scope' => null, 'decision' => null];
            if (self::wantsPricing($signals)) {
                $quote = LisaQuoting::process($ctx, $pdo);
            }
            $quoteAlerted = $quote['decision'] !== null && $quote['decision']['immediate'];

            $actions = self::decide($signals, $ctx['channel'] === 'whatsapp');
            if ($quoteAlerted) {
                $actions = array_values(array_filter(
                    $actions,
                    static fn ($a) => !($a['type'] === 'owner_alert' && in_array($a['reason'], ['hot_lead', 'urgent'], true))
                ));
            }
            $done = [];
            foreach ($actions as $action) {
                $done[] = $action + ['result' => self::execute($action, $signals, $ctx, $mode, $pdo)];
            }

            $pdo->prepare('INSERT INTO lisa_judgments (session_token, channel, mode, signals_json, actions_json) VALUES (?, ?, ?, ?, ?)')
                ->execute([$token, $ctx['channel'], $mode, json_encode($signals), json_encode($done)]);

            $notes = array_filter([$mode === 'live' ? self::promptNote($signals) : null, $quote['prompt_note']]);
            return [
                'prompt_note' => $notes === [] ? null : implode("

", $notes),
                'signals' => $signals,
                'actions' => $done,
            ];
        } catch (\Throwable $e) {
            error_log('LisaJudgment: ' . $e->getMessage());
            return $empty;
        }
    }

    /** @return string what happened, for the audit row */
    private static function execute(array $action, array $signals, array $ctx, string $mode, \PDO $pdo): string
    {
        $live = $mode === 'live';
        switch ($action['type']) {
            case 'opt_out':
                if (!$live) {
                    return 'shadow: would record opt-out';
                }
                if ($ctx['session_token'] !== null) {
                    $pdo->prepare('UPDATE chat_sessions SET opted_out_at = datetime(\'now\') WHERE token = ? AND opted_out_at IS NULL')
                        ->execute([$ctx['session_token']]);
                }
                return 'opt-out recorded, no further follow-ups';

            case 'handoff':
                if (!$live) {
                    return 'shadow: would record a handoff';
                }
                LiveChatController::recordJudgmentHandoff(
                    $pdo,
                    $ctx['name'],
                    $ctx['phone'],
                    'Jev read this customer as wanting a person or being upset (' . self::describe($signals) . ')',
                    mb_substr($ctx['message'], 0, 300)
                );
                return 'handoff recorded';

            case 'owner_alert':
                return self::ownerAlert($action['reason'], $signals, $ctx, $live, $pdo);
        }
        return 'ignored';
    }

    private static function ownerAlert(string $reason, array $signals, array $ctx, bool $live, \PDO $pdo): string
    {
        $who = trim($ctx['name']) !== '' ? $ctx['name'] : 'A customer';
        $label = ['needs_you' => 'needs you', 'hot_lead' => 'hot lead', 'urgent' => 'urgent'][$reason] ?? $reason;
        $summary = sprintf(
            '%s on %s (%s). Said: "%s"',
            $who,
            $ctx['channel'] === 'whatsapp' ? 'WhatsApp' : 'the website chat',
            self::describe($signals),
            mb_substr(preg_replace('/\s+/', ' ', $ctx['message']) ?? '', 0, 160)
        );
        return self::alertOwner($reason, $label, $summary, (string) ($ctx['session_token'] ?? ''), $ctx['phone'], $live, $pdo);
    }

    /**
     * Message Caleb's WhatsApp number, with the guard rails every Jev-driven
     * alert shares: once per session per reason per day, no hot-lead pings in
     * quiet hours, and a daily cap so a busy day cannot flood him. Records the
     * decision (delivered or shadow) either way.
     *
     * @return string what happened, for the audit row
     */
    public static function alertOwner(string $reason, string $label, string $summary, string $token, string $phone, bool $live, \PDO $pdo): string
    {
        // Once per session per reason per day: a chatty hot lead must not ping
        // the owner on every message.
        $dup = $pdo->prepare(
            "SELECT COUNT(*) FROM lisa_owner_alerts WHERE session_token = ? AND reason = ? AND mode = ? AND created_at >= datetime('now', '-24 hours')"
        );
        // Same mode only, so a shadow-mode "would alert" row never suppresses the real one after going live.
        $dup->execute([$token, $reason, $live ? 'live' : 'shadow']);
        if ((int) $dup->fetchColumn() > 0) {
            return 'skipped: already alerted for this today';
        }
        if (in_array($reason, ['hot_lead', 'cold_hot_lead', 'quote_summary'], true) && self::inQuietHours()) {
            return 'skipped: quiet hours (these wait until morning)';
        }
        $cap = (int) (Settings::get('lisa_owner_alert_daily_cap') ?: self::DEFAULT_DAILY_ALERT_CAP);
        $today = (int) $pdo->query("SELECT COUNT(*) FROM lisa_owner_alerts WHERE delivered = 1 AND created_at >= datetime('now', '-24 hours')")->fetchColumn();
        if ($today >= max(1, $cap)) {
            return "skipped: daily alert cap of {$cap} reached";
        }

        $delivered = false;
        if ($live) {
            $body = "\u{1F4AC} Lisa: {$label}\n\n{$summary}"
                . ($phone !== '' ? "\nPhone: {$phone}" : '')
                . "\n\nOpen the inbox: https://princecaleb.dev/admin/inbox";
            $fields = [
                'name' => Settings::get('chat_assistant_name') ?: 'Lisa',
                'reason' => 'Customer ' . $label,
                'summary' => $summary,
                'message' => $body,
            ];
            $delivered = self::$ownerSender !== null
                ? (bool) (self::$ownerSender)($body, $fields)
                : (WhatsAppNotifier::isOwnerConfigured() && WhatsAppNotifier::sendOwnerAlert($body, $fields));
        }
        $pdo->prepare('INSERT INTO lisa_owner_alerts (session_token, reason, summary, mode, delivered) VALUES (?, ?, ?, ?, ?)')
            ->execute([$token, $reason, $summary, $live ? 'live' : 'shadow', $delivered ? 1 : 0]);

        if (!$live) {
            return "shadow: would message you on WhatsApp ({$label})";
        }
        return $delivered ? "WhatsApp alert sent ({$label})" : 'WhatsApp alert could not be delivered (owner number or provider not configured)';
    }

    private static function describe(array $s): string
    {
        return sprintf(
            '%s, buying %.1f/3, urgency %.1f/2%s%s',
            str_replace('_', ' ', (string) $s['intent']),
            $s['buying_intent'],
            $s['urgency'],
            $s['wants_human'] >= self::WANTS_HUMAN_AT ? ', wants a person' : '',
            $s['upset'] >= self::UPSET_AT ? ', upset' : ''
        );
    }

    /** True inside the configured quiet window (default 21:00 to 08:00, chat_timezone). */
    public static function inQuietHours(?\DateTime $now = null): bool
    {
        $tz = Settings::get('chat_timezone') ?: 'Africa/Accra';
        try {
            $now ??= new \DateTime('now', new \DateTimeZone($tz));
        } catch (\Exception $e) {
            $now ??= new \DateTime('now', new \DateTimeZone('UTC'));
        }
        $start = self::hhmm(Settings::get('lisa_quiet_start'), '21:00');
        $end = self::hhmm(Settings::get('lisa_quiet_end'), '08:00');
        $t = $now->format('H:i');
        return $start <= $end ? ($t >= $start && $t < $end) : ($t >= $start || $t < $end);
    }

    private static function hhmm(?string $value, string $default): string
    {
        return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', trim((string) $value)) ? trim((string) $value) : $default;
    }
}
