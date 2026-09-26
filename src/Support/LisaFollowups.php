<?php

declare(strict_types=1);

namespace App\Support;

use App\Controllers\LiveChatController;

/**
 * Follow-ups for WhatsApp conversations that went cold, decided by Jev and
 * respecting WhatsApp's 24 hour customer-service window.
 *
 * Who is considered: contacts who wrote to Lisa's WhatsApp number (that is
 * their opt-in), whose last message in the thread is Lisa's, who have not opted
 * out, and who last wrote within lisa_followup_max_days. Not the owner.
 *
 * When and how, by time since the contact's last inbound message:
 *   inside the window, first silence hours:  a short free-text nudge
 *   inside the window, second silence hours: a last free-text nudge
 *   after the window closes (24h):           the approved conversation_followup
 *                                            template, the only thing WhatsApp allows then
 * At most lisa_followup_max_per_episode sends per silence, one per tier, spaced
 * at least three hours apart, only outside quiet hours. A reply from the
 * contact starts a new silence, so counts reset naturally.
 *
 * Whether: Jev reads the conversation and answers whether it is still open,
 * whether a check-in would be welcome, whether the person opted out, and how
 * ready to buy they are. Code applies fixed rules to those answers. A
 * conversation that was resolved, declined, or not a prospect is skipped and
 * recorded with the reason, so the reasoning is visible.
 *
 * Setting `lisa_followup_mode`: 'shadow' (default) records what it would send
 * and sends nothing; 'live' sends; 'off' disables. Shadow keeps one row per
 * tier per silence, so the list does not repeat on every run.
 */
final class LisaFollowups
{
    public const WINDOW_HOURS = 24;
    /** Stop free-text nudges this long before the window closes, to leave margin for clock skew. */
    private const WINDOW_MARGIN_HOURS = 1;
    private const MIN_SPACING_HOURS = 3;
    private const MAX_PER_RUN = 10;

    private const WELCOME_AT = 0.60;
    private const OPT_OUT_AT = 0.50;      // stricter than the inbound threshold: never follow up on a maybe
    private const TEXT_MIN_BUYING = 1.0;  // free text is cheap: browsing or better
    private const TEMPLATE_MIN_BUYING = 1.5; // a paid template is worth it for serious interest or better
    private const OPEN_STATUSES = ['awaiting_customer', 'customer_interested_paused'];

    /**
     * Test seams: fn(digits, body) and fn(digits, sid, vars), each returning {ok, error, id}. Null means Twilio.
     *
     * @var callable|null
     */
    public static $sendText = null;
    /** Test seam: fn(array $transcript, string $name): string replacing the AI-written nudge. @var callable|null */
    public static $composer = null;
    /** @var callable|null */
    public static $sendTemplate = null;

    public static function mode(): string
    {
        $mode = strtolower(trim((string) Settings::get('lisa_followup_mode')));
        return in_array($mode, ['off', 'live'], true) ? $mode : 'shadow';
    }

    /** @return array{first:int,second:int,max_days:int,max_per_episode:int} */
    public static function timing(): array
    {
        $n = static function (string $key, int $default, int $min, int $max): int {
            $v = Settings::get($key);
            return is_numeric($v) ? max($min, min($max, (int) $v)) : $default;
        };
        $limit = self::WINDOW_HOURS - self::WINDOW_MARGIN_HOURS;
        $first = $n('lisa_followup_first_silence_hours', 3, 1, $limit - 1);
        return [
            'first' => $first,
            'second' => $n('lisa_followup_second_silence_hours', 20, $first + 1, $limit),
            'max_days' => $n('lisa_followup_max_days', 7, 2, 30),
            'max_per_episode' => $n('lisa_followup_max_per_episode', 3, 1, 5),
        ];
    }

    /**
     * Which tier applies for this much silence, or null if none yet.
     *
     * @return 'first'|'second'|'template'|null
     */
    public static function tierFor(float $hoursSinceInbound, array $timing): ?string
    {
        if ($hoursSinceInbound >= self::WINDOW_HOURS) {
            return $hoursSinceInbound <= $timing['max_days'] * 24 ? 'template' : null;
        }
        if ($hoursSinceInbound >= $timing['second'] && $hoursSinceInbound < self::WINDOW_HOURS - self::WINDOW_MARGIN_HOURS) {
            return 'second';
        }
        if ($hoursSinceInbound >= $timing['first'] && $hoursSinceInbound < $timing['second']) {
            return 'first';
        }
        return null;
    }

    /**
     * Pure decision from Jev's reading. Returns null to send, or the reason not to.
     *
     * @param array<string,mixed> $read
     */
    public static function skipReason(array $read, string $tier): ?string
    {
        if ($read['opt_out'] >= self::OPT_OUT_AT) {
            return 'jev: the contact may be opting out';
        }
        if (!in_array($read['status'], self::OPEN_STATUSES, true)) {
            return 'jev: conversation is ' . str_replace('_', ' ', (string) $read['status']);
        }
        if ($read['welcome'] < self::WELCOME_AT) {
            return sprintf('jev: a check-in would probably not be welcome (%.2f)', $read['welcome']);
        }
        $need = $tier === 'template' ? self::TEMPLATE_MIN_BUYING : self::TEXT_MIN_BUYING;
        if ($read['buying_intent'] < $need) {
            return sprintf('jev: interest too low for a %s (%.1f, needs %.1f)', $tier === 'template' ? 'paid template' : 'nudge', $read['buying_intent'], $need);
        }
        return null;
    }

    /**
     * Run one pass. Safe to call from cron or the admin "Run now" button.
     *
     * @return array{mode:string,considered:int,sent:int,shadow:int,skipped:int,failed:int,note:?string}
     */
    public static function run(\PDO $pdo): array
    {
        $mode = self::mode();
        $out = ['mode' => $mode, 'considered' => 0, 'sent' => 0, 'shadow' => 0, 'skipped' => 0, 'failed' => 0, 'note' => null];
        if ($mode === 'off') {
            $out['note'] = 'Follow-ups are switched off.';
            return $out;
        }
        if (Settings::get('whatsapp_provider') !== 'twilio' || !TwilioClient::isConfigured()) {
            $out['note'] = 'Twilio WhatsApp is not the configured provider, so there is nothing to follow up on.';
            return $out;
        }
        if (!TypeSafeClient::hasKey()) {
            $out['note'] = 'No TypeSafe API key saved, so Jev cannot decide.';
            return $out;
        }
        if (LisaJudgment::inQuietHours()) {
            $out['note'] = 'Quiet hours: nothing is sent or decided until they end.';
            return $out;
        }

        $timing = self::timing();
        $live = $mode === 'live';
        $rows = $pdo->query(
            "SELECT id, token, client_name, client_phone, transcript_json, last_inbound_at
             FROM chat_sessions
             WHERE token LIKE 'whatsapp:+%'
               AND last_inbound_at IS NOT NULL
               AND opted_out_at IS NULL
               AND last_inbound_at >= datetime('now', '-" . ($timing['max_days'] * 24) . " hours')
               AND last_inbound_at <= datetime('now', '-" . $timing['first'] . " hours')
             ORDER BY last_inbound_at ASC
             LIMIT 200"
        )->fetchAll(\PDO::FETCH_ASSOC);

        foreach ($rows as $s) {
            if ($out['considered'] >= self::MAX_PER_RUN) {
                break;
            }
            $digits = preg_replace('/\D+/', '', (string) $s['token']) ?? '';
            if ($digits === '' || self::isOwner($digits)) {
                continue;
            }
            $transcript = json_decode((string) $s['transcript_json'], true) ?: [];
            $last = end($transcript);
            if (!is_array($last) || ($last['role'] ?? '') !== 'assistant') {
                continue; // the customer spoke last: Lisa owes a reply, not a nudge
            }
            $hours = (time() - strtotime((string) $s['last_inbound_at'] . ' UTC')) / 3600;
            $tier = self::tierFor($hours, $timing);
            if ($tier === null || self::alreadyHandled($pdo, (int) $s['id'], (string) $s['last_inbound_at'], $tier, $timing)) {
                continue;
            }

            $out['considered']++;
            $window = $tier === 'template' ? 'out_of_window' : 'in_window';
            $name = trim((string) $s['client_name']) ?: 'there';

            // Belt and braces: a plain STOP-style message is honoured without asking any model.
            if (self::saidStop($transcript)) {
                $pdo->prepare("UPDATE chat_sessions SET opted_out_at = datetime('now') WHERE id = ? AND opted_out_at IS NULL")->execute([$s['id']]);
                self::record($pdo, $s, $name, $mode, $window, 'none', null, null, ['tier' => $tier], 'jev: the contact sent a stop message (recorded as an opt-out)', 'skipped');
                $out['skipped']++;
                continue;
            }

            $read = self::read($transcript, $hours, $window);
            if ($read === null) {
                continue; // Jev unavailable: try again next run, record nothing
            }
            $reason = self::skipReason($read, $tier);
            if ($reason !== null) {
                self::record($pdo, $s, $name, $mode, $window, 'none', null, null, $read + ['tier' => $tier], $reason, 'skipped');
                $out['skipped']++;
                continue;
            }

            if ($tier === 'template') {
                $sid = trim((string) Settings::get('twilio_conversation_followup_content_sid'));
                if ($sid === '' || strtolower((string) Settings::get('twilio_conversation_followup_template_status')) !== 'approved') {
                    self::record($pdo, $s, $name, $mode, $window, 'none', 'conversation_followup', null, $read + ['tier' => $tier],
                        'the conversation follow-up template is not approved yet', 'skipped');
                    $out['skipped']++;
                    continue;
                }
                $body = WhatsAppConversationFollowupTemplateManager::renderBody(['1' => $name]);
                $action = 'template';
                $templateKey = 'conversation_followup';
            } else {
                $body = self::$composer !== null ? (self::$composer)($transcript, $name) : self::composeText($transcript, $name);
                $action = 'text';
                $templateKey = null;
            }

            $decision = $read + ['tier' => $tier, 'hours_silent' => round($hours, 1)];
            if (!$live) {
                self::record($pdo, $s, $name, $mode, $window, $action, $templateKey, $body, $decision, null, 'shadow');
                $out['shadow']++;
                continue;
            }
            if (self::sentThisEpisode($pdo, (int) $s['id'], (string) $s['last_inbound_at']) >= $timing['max_per_episode']) {
                continue; // cap reached for this silence
            }

            $sid = trim((string) Settings::get('twilio_conversation_followup_content_sid'));
            $result = $action === 'template'
                ? (self::$sendTemplate !== null ? (self::$sendTemplate)($digits, $sid, ['1' => $name]) : TwilioClient::sendTemplate($digits, $sid, ['1' => $name]))
                : (self::$sendText !== null ? (self::$sendText)($digits, $body) : TwilioClient::sendText($digits, $body));
            if (!$result['ok']) {
                self::record($pdo, $s, $name, $mode, $window, $action, $templateKey, $body, $decision, null, 'failed', (string) $result['error']);
                $out['failed']++;
                error_log('Lisa follow-up failed for session #' . $s['id'] . ': ' . (string) $result['error']);
                continue;
            }
            self::record($pdo, $s, $name, $mode, $window, $action, $templateKey, $body, $decision, null, 'sent');
            if ($action === 'template') {
                $pdo->prepare(
                    "INSERT INTO whatsapp_intros (contact_name, phone_number, note, template_name, conversation_id, status)
                     VALUES (?, ?, ?, ?, ?, 'sent')"
                )->execute([$name, '+' . $digits, null, trim((string) Settings::get('twilio_conversation_followup_content_sid')), $result['id'] ?? null]);
            }
            LiveChatController::seedOutboundTemplate($pdo, $digits, $name, $body);
            $out['sent']++;

            // A serious lead that is going cold is worth Caleb's own attention.
            if ($read['buying_intent'] >= LisaJudgment::HOT_LEAD_AT && $tier !== 'first') {
                LisaJudgment::alertOwner(
                    'cold_hot_lead',
                    'hot lead going cold',
                    sprintf('%s (+%s) showed strong interest and has gone quiet for %d hours. Lisa sent a follow-up. Consider calling.', $name, $digits, (int) $hours),
                    (string) $s['token'],
                    '+' . $digits,
                    true,
                    $pdo
                );
            }
        }
        return $out;
    }

    /**
     * Jev's reading of one cold conversation.
     *
     * @return array<string,mixed>|null
     */
    private static function read(array $transcript, float $hoursSilent, string $window): ?array
    {
        $turns = [];
        foreach (array_slice($transcript, -12) as $t) {
            $text = trim((string) ($t['text'] ?? ''));
            if ($text !== '') {
                $turns[] = ['speaker' => ($t['role'] ?? '') === 'user' ? 'customer' : 'Lisa (our assistant)', 'text' => mb_substr($text, 0, 500)];
            }
        }
        $answers = TypeSafeClient::ask([
            'business' => 'A one-person web, mobile and AI automation studio (Prince Caleb) run through an assistant called Lisa.',
            'conversation' => $turns,
            'hours_since_customer_last_wrote' => round($hoursSilent, 1),
            'whatsapp_window' => $window === 'in_window' ? 'open (free text allowed)' : 'closed (only an approved template can be sent)',
        ], [
            'status' => [
                'type' => 'choice',
                'instructions' => 'Where does this WhatsApp conversation stand now that the customer has gone quiet after Lisa\'s last message?',
                'criteria' => [
                    'awaiting_customer' => 'Lisa asked something or offered a next step, and the customer has not answered.',
                    'customer_interested_paused' => 'The customer showed real interest earlier and simply stopped replying.',
                    'resolved' => 'The customer\'s need was met, a call was booked, or they said thanks and there is nothing left to do.',
                    'declined' => 'The customer said no, is not interested, or asked to stop.',
                    'waiting_on_us' => 'The customer asked something that was never answered.',
                    'not_a_prospect' => 'Spam, an existing client with a finished matter, or unrelated to the studio.',
                ],
            ],
            'opt_out' => [
                'type' => 'noul',
                'instructions' => 'At any point did the customer ask not to be contacted, say stop, or clearly say they do not want follow-ups?',
                'criteria' => ['true' => 'Yes, explicitly or clearly.', 'false' => 'No. Hesitation such as "maybe later" does not count.'],
            ],
            'welcome' => [
                'type' => 'noul',
                'instructions' => 'Would one short, friendly check-in message now be welcome to this customer rather than annoying?',
                'criteria' => [
                    'true' => 'The customer was engaged and friendly, and a light check-in fits.',
                    'false' => 'The customer was curt, disinterested, already got what they needed, or a message would feel pushy.',
                ],
            ],
            'buying_intent' => [
                'type' => 'score',
                'instructions' => 'How ready is this person to hire the studio, judged from the whole conversation?',
                'criteria' => [
                    'Not a prospect.',
                    'Browsing: general questions, no project of their own.',
                    'Serious interest: a concrete project or need, asked about scope, timing or cost.',
                    'Ready to commit: asked how to start, to book or to pay.',
                ],
            ],
        ], 6, 'LisaFollowups');
        if ($answers === null) {
            return null;
        }
        $status = TypeSafeClient::choice($answers, 'status');
        $optOut = TypeSafeClient::noul($answers, 'opt_out');
        $welcome = TypeSafeClient::noul($answers, 'welcome');
        $buying = TypeSafeClient::score($answers, 'buying_intent');
        if ($status === null || $optOut === null || $welcome === null || $buying === null) {
            error_log('LisaFollowups: incomplete answers: ' . substr((string) json_encode($answers), 0, 400));
            return null;
        }
        return [
            'status' => $status['choice'], 'status_confidence' => round($status['confidence'], 3),
            'opt_out' => round($optOut, 3), 'welcome' => round($welcome, 3), 'buying_intent' => round($buying, 3),
        ];
    }

    /** A short in-window nudge in Lisa's voice, or a safe canned one if the AI providers all fail. */
    private static function composeText(array $transcript, string $name): string
    {
        $turns = [];
        foreach (array_slice($transcript, -8) as $t) {
            $text = trim((string) ($t['text'] ?? ''));
            if ($text !== '') {
                $turns[] = (($t['role'] ?? '') === 'user' ? 'Customer' : 'Lisa') . ': ' . mb_substr($text, 0, 400);
            }
        }
        $fallback = "Hi {$name}, just checking in. Is there anything else I can help you with? If now is not a good time, no problem at all.";
        $assistant = Settings::get('chat_assistant_name') ?: 'Lisa';
        $reply = AiText::generate(
            "Conversation so far:\n" . implode("\n", $turns) . "\n\nWrite the next WhatsApp message.",
            "You are {$assistant}, the assistant of Prince Caleb, who builds websites, apps and AI automations. The customer went quiet. "
            . "Write ONE short, warm follow-up message (under 280 characters) that picks up what they were discussing and asks one easy question or offers one clear next step. "
            . "Reply in the same language the customer used. Plain text only, no markdown, no emojis, no prices, no pressure, no promises about timing. "
            . "Do not say you are an AI unless asked, and do not repeat your earlier message word for word. Output only the message.",
            20,
            200
        );
        $reply = trim((string) $reply);
        if ($reply === '' || mb_strlen($reply) > 400 || str_contains($reply, "\n\n\n")) {
            return $fallback;
        }
        return $reply;
    }

    /** True if any customer message is just a stop word ("STOP", "unsubscribe", ...). */
    public static function saidStop(array $transcript): bool
    {
        foreach ($transcript as $turn) {
            if (($turn['role'] ?? '') !== 'user') {
                continue;
            }
            if (preg_match('/^\s*(stop|stop all|unsubscribe|opt[\s-]?out|cancel|arr[eê]te|arr[eê]tez)\s*[.!]*\s*$/iu', (string) ($turn['text'] ?? ''))) {
                return true;
            }
        }
        return false;
    }

    private static function isOwner(string $digits): bool
    {
        foreach (['owner_whatsapp_number', 'owner_voice_number'] as $key) {
            $saved = preg_replace('/\D+/', '', (string) Settings::get($key)) ?? '';
            if ($saved !== '' && hash_equals($saved, $digits)) {
                return true;
            }
        }
        return false;
    }

    /** Sends in this silence (since the contact last wrote). */
    private static function sentThisEpisode(\PDO $pdo, int $sessionId, string $lastInbound): int
    {
        $st = $pdo->prepare("SELECT COUNT(*) FROM lisa_followups WHERE session_id = ? AND status = 'sent' AND created_at >= ?");
        $st->execute([$sessionId, $lastInbound]);
        return (int) $st->fetchColumn();
    }

    /**
     * True if this tier was already decided or sent in this silence, the last
     * send is too recent, or Jev already ruled the conversation out and nothing
     * new has happened since (so a skip is not re-evaluated every run).
     */
    private static function alreadyHandled(\PDO $pdo, int $sessionId, string $lastInbound, string $tier, array $timing): bool
    {
        $st = $pdo->prepare(
            "SELECT status, skip_reason, json_extract(decision_json, '$.tier') AS tier, created_at
             FROM lisa_followups WHERE session_id = ? AND created_at >= ? ORDER BY id DESC"
        );
        $st->execute([$sessionId, $lastInbound]);
        foreach ($st->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            if (in_array($row['status'], ['sent', 'shadow'], true)) {
                if ($row['tier'] === $tier) {
                    return true;
                }
                if (strtotime((string) $row['created_at'] . ' UTC') > time() - self::MIN_SPACING_HOURS * 3600) {
                    return true;
                }
            }
            // A Jev-based skip stands until the contact writes again; a skip for a missing template does not.
            if ($row['status'] === 'skipped' && str_starts_with((string) $row['skip_reason'], 'jev:')) {
                return true;
            }
            if ($row['status'] === 'skipped' && $row['tier'] === $tier && strtotime((string) $row['created_at'] . ' UTC') > time() - 6 * 3600) {
                return true;
            }
        }
        return false;
    }

    private static function record(
        \PDO $pdo,
        array $s,
        string $name,
        string $mode,
        string $window,
        string $action,
        ?string $templateKey,
        ?string $body,
        array $decision,
        ?string $skipReason,
        string $status,
        ?string $error = null
    ): void {
        $pdo->prepare(
            'INSERT INTO lisa_followups
             (session_id, phone, contact_name, mode, window_state, action, template_key, body_text, decision_json, skip_reason, status, error, sent_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            (int) $s['id'], (string) ($s['client_phone'] ?: $s['token']), $name, $mode, $window, $action, $templateKey, $body,
            json_encode($decision), $skipReason, $status, $error, $status === 'sent' ? gmdate('Y-m-d H:i:s') : null,
        ]);
    }
}
