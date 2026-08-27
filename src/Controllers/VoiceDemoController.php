<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\AiAgentEngine;
use App\Support\Database;
use App\Support\LisaInstructions;
use App\Support\Response;
use App\Support\Settings;

/**
 * Side-effect-free clinic web demo plus the ElevenLabs customer-service phone
 * agent (inbound public line and approved outbound calls to Marketing Leads).
 * ElevenLabs runs the actual call's conversation turn loop on its own hosted
 * LLM — this controller's job is supplying the real, current system prompt
 * at call start, executing tool calls the agent makes during the call, and
 * folding the finished transcript back into storage once it ends, the same
 * pattern LiveChatController already uses for WhatsApp voice+chat.
 */
final class VoiceDemoController
{
    // Transcript messages, not conversational exchanges: each exchange adds
    // one user and one assistant item. Forty allows roughly twenty natural
    // turns before the safety stop instead of cutting a useful call at eight.
    private const MAX_TURNS = 40;
    private const EVENT_TYPES = [
        'demo_started', 'mic_granted', 'mic_blocked', 'question_sent',
        'answer_received', 'answer_failed', 'cta_clicked',
    ];

    public static function message(): void
    {
        set_time_limit(30);
        RateLimitMiddleware::enforce('voice_demo', 20);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim((string) ($data['message'] ?? ''));
        if ($message === '' || mb_strlen($message) > 500) {
            Response::error('A question under 500 characters is required.', 422);
        }

        $pdo = Database::get();
        $session = self::session($pdo, (string) ($data['token'] ?? ''), 'web', 'clinic');
        $transcript = json_decode((string) $session['transcript_json'], true) ?: [];
        if (count($transcript) >= self::MAX_TURNS) {
            Response::error('This demo has reached its conversation limit. Start a new browser session to try again.', 422);
        }

        $transcript[] = ['role' => 'user', 'text' => $message];
        $result = self::reply($transcript);
        $transcript[] = ['role' => 'assistant', 'text' => $result['reply']];
        self::save($pdo, (int) $session['id'], $transcript, $result['provider']);
        self::record($pdo, (int) $session['id'], 'question_sent', ['channel' => 'web']);
        self::record($pdo, (int) $session['id'], 'answer_received', ['provider' => $result['provider']]);

        Response::json([
            'token' => $session['token'],
            'reply' => $result['reply'],
            'provider' => $result['provider'],
            'mode' => $result['mode'],
            'safe_demo' => true,
        ]);
    }

    public static function event(): void
    {
        RateLimitMiddleware::enforce('voice_demo_event', 100);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $event = trim((string) ($data['event'] ?? ''));
        if (!in_array($event, self::EVENT_TYPES, true)) {
            Response::error('Unknown demo event.', 422);
        }
        $pdo = Database::get();
        $sessionId = null;
        $token = trim((string) ($data['token'] ?? ''));
        if ($token !== '') {
            $stmt = $pdo->prepare('SELECT id FROM voice_demo_sessions WHERE token = ?');
            $stmt->execute([$token]);
            $sessionId = ($row = $stmt->fetch()) ? (int) $row['id'] : null;
        }
        self::record($pdo, $sessionId, $event, [
            'path' => mb_substr(trim((string) ($data['path'] ?? '')), 0, 500),
            'niche' => 'clinic',
        ]);
        Response::json(['status' => 'ok'], 201);
    }

    /**
     * POST /api/v1/voice/elevenlabs/init — ElevenLabs' "Conversation
     * Initiation Client Data" webhook, called when a call starts on the
     * phone number connected to Lisa's ElevenLabs phone agent. Mirrors
     * LiveChatController::elevenLabsInitWebhook() for WhatsApp: returns
     * Lisa's real, current system prompt as a conversation_config_override
     * so ElevenLabs' hosted LLM never runs on a stale or duplicated copy.
     *
     * Outbound calls placed by OutreachController::initiateAiCall() already
     * pass a conversation_config_override directly in the outbound-call API
     * request, so this webhook is primarily for genuinely inbound calls. If
     * ElevenLabs also fires it for an outbound-initiated conversation, a
     * `lead_id` dynamic variable (present only on outbound calls) is used to
     * rebuild the same 'outbound' prompt instead of the inbound 'phone' one.
     * Field names are ElevenLabs' documented shape, unconfirmed against a
     * live call — check Admin -> Error Logs after the first real call.
     */
    public static function elevenLabsInitWebhook(): void
    {
        if (!self::verifyElevenLabsPhoneSecret()) {
            http_response_code(403);
            exit;
        }
        $rawBody = file_get_contents('php://input');
        $data = json_decode($rawBody, true) ?? [];
        $dynamicVars = is_array($data['dynamic_variables'] ?? null) ? $data['dynamic_variables'] : [];
        $callId = trim((string) ($data['conversation_id'] ?? $data['call_sid'] ?? ''));
        $leadId = max(0, (int) ($dynamicVars['lead_id'] ?? 0));

        $pdo = Database::get();

        if ($leadId > 0) {
            $context = [
                'business_name' => (string) ($dynamicVars['business_name'] ?? ''),
                'contact_name' => (string) ($dynamicVars['contact_name'] ?? ''),
                'contact_email' => (string) ($dynamicVars['contact_email'] ?? ''),
                'website_url' => (string) ($dynamicVars['website_url'] ?? ''),
                'pitch_body' => (string) ($dynamicVars['pitch_body'] ?? ''),
                'is_first_turn' => true,
            ];
            $systemPrompt = self::prompt('outbound', $context);
        } else {
            $callerId = trim((string) ($data['caller_id'] ?? $data['from_number'] ?? $data['from'] ?? ''));
            if ($callerId === '') {
                error_log('ElevenLabs phone init webhook: missing caller_id, raw payload=' . substr($rawBody, 0, 500));
            }
            $systemPrompt = self::prompt('phone', ['is_owner' => self::isOwnerNumber($callerId)]);
        }

        if ($callId !== '') {
            $session = self::session(
                $pdo,
                'tel_' . hash('sha256', $callId),
                'phone',
                $leadId > 0 ? 'outreach' : 'clinic'
            );
            if ($leadId > 0) {
                // OutreachController::initiateAiCall() already inserted this
                // row when it placed the call; just attach the session.
                $pdo->prepare(
                    "UPDATE telephony_calls SET session_id = ?, updated_at = datetime('now') WHERE provider_call_id = ?"
                )->execute([$session['id'], $callId]);
            } else {
                $pdo->prepare(
                    "INSERT OR IGNORE INTO telephony_calls
                     (provider_call_id, session_id, provider, status, from_number)
                     VALUES (?, ?, 'elevenlabs', 'in-progress', ?)"
                )->execute([$callId, $session['id'], $callerId ?: null]);
            }
        }

        Response::json([
            'type' => 'conversation_initiation_client_data',
            'dynamic_variables' => ['call_id' => $callId],
            'conversation_config_override' => [
                'agent' => ['prompt' => ['prompt' => $systemPrompt]],
            ],
        ]);
    }

    /**
     * POST /api/v1/voice/elevenlabs/tool — generic dispatcher for ElevenLabs
     * webhook tools, mirroring LiveChatController::elevenLabsToolWebhook().
     * Each capability (check_availability, book_appointment, the
     * consent/opt-out tools below) needs its own webhook tool configured in
     * the ElevenLabs phone agent, all pointing at this same URL with a
     * distinct ?tool_name=... query string, e.g.
     * ".../elevenlabs/tool?tool_name=book_appointment".
     */
    public static function elevenLabsToolWebhook(): void
    {
        if (!self::verifyElevenLabsPhoneSecret()) {
            http_response_code(403);
            exit;
        }
        $rawBody = file_get_contents('php://input');
        $payload = json_decode($rawBody, true) ?? [];
        $name = trim((string) ($_GET['tool_name'] ?? $payload['tool_name'] ?? $payload['name'] ?? ''));
        $args = is_array($payload['parameters'] ?? null) ? $payload['parameters'] : $payload;
        $callId = trim((string) ($_GET['call_id'] ?? $payload['call_id'] ?? $payload['conversation_id'] ?? ''));
        if ($name === '') {
            error_log('ElevenLabs phone tool webhook: missing tool_name, query=' . http_build_query($_GET) . ', raw body=' . substr($rawBody, 0, 500));
            Response::json(['error' => 'Unknown phone action.']);
            return;
        }

        $pdo = Database::get();
        try {
            if ($name === 'check_availability') {
                Response::json(AppointmentController::getAvailableSlots((string) ($args['date'] ?? '')));
                return;
            }
            if ($name === 'check_availability_range') {
                Response::json(AppointmentController::getAvailableDateRange(
                    (string) ($args['start_date'] ?? ''),
                    (string) ($args['end_date'] ?? '')
                ));
                return;
            }
            if ($name === 'book_appointment') {
                Response::json(AppointmentController::createBooking($args));
                return;
            }
            if ($name === 'capture_whatsapp_followup_consent' && $callId !== '') {
                $number = self::normalizePhoneNumber((string) ($args['number'] ?? ''));
                if (preg_match('/^\+[1-9]\d{7,14}$/', $number)) {
                    $pdo->prepare(
                        "UPDATE telephony_calls SET whatsapp_followup_consent_at = datetime('now'),
                         whatsapp_followup_number = ?, updated_at = datetime('now') WHERE provider_call_id = ?"
                    )->execute([$number, $callId]);
                }
                Response::json(['success' => true]);
                return;
            }
            if ($name === 'capture_email_followup_consent' && $callId !== '') {
                $email = trim((string) ($args['email'] ?? ''));
                if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    $pdo->prepare(
                        "UPDATE telephony_calls SET email_followup_consent_at = datetime('now'),
                         email_followup_address = ?, updated_at = datetime('now') WHERE provider_call_id = ?"
                    )->execute([$email, $callId]);
                }
                Response::json(['success' => true]);
                return;
            }
            if ($name === 'log_opt_out' && $callId !== '') {
                self::logOutboundOutcome($pdo, $callId, 'not_interested', 'Opted out during Lisa AI call', true);
                Response::json(['success' => true]);
                return;
            }
            if ($name === 'log_callback_request' && $callId !== '') {
                self::logOutboundOutcome($pdo, $callId, 'callback', 'Recipient asked to be contacted later during Lisa AI call', false);
                Response::json(['success' => true]);
                return;
            }
            Response::json(['error' => 'Unknown phone action.']);
        } catch (\Throwable $e) {
            error_log(sprintf('ElevenLabs phone tool "%s" failed: %s', $name, $e->getMessage()));
            Response::json(['error' => 'The action could not be completed.']);
        }
    }

    private static function logOutboundOutcome(\PDO $pdo, string $callId, string $outcome, string $notes, bool $reject): void
    {
        $stmt = $pdo->prepare('SELECT marketing_lead_id FROM telephony_calls WHERE provider_call_id = ?');
        $stmt->execute([$callId]);
        $leadId = (int) ($stmt->fetchColumn() ?: 0);
        if ($leadId <= 0) {
            return;
        }
        if ($reject) {
            $pdo->prepare("UPDATE marketing_leads SET status = 'rejected', updated_at = datetime('now') WHERE id = ?")
                ->execute([$leadId]);
        }
        $pdo->prepare('INSERT INTO call_log (lead_id, outcome, notes) VALUES (?, ?, ?)')
            ->execute([$leadId, $outcome, $notes]);
    }

    /**
     * POST /api/v1/voice/elevenlabs/post-call — ElevenLabs' post-call
     * webhook with the full finished transcript. HMAC-verified like Stripe's
     * (see verifyElevenLabsPhoneHmacSignature()), mirroring
     * LiveChatController::elevenLabsPostCallWebhook() for WhatsApp.
     */
    public static function elevenLabsPostCallWebhook(): void
    {
        $rawBody = file_get_contents('php://input');
        if (!self::verifyElevenLabsPhoneHmacSignature($rawBody)) {
            http_response_code(403);
            exit;
        }
        $data = json_decode($rawBody, true) ?? [];
        $callId = trim((string) ($data['conversation_id'] ?? $data['call_sid'] ?? ''));
        if ($callId === '') {
            http_response_code(422);
            exit;
        }
        $rawTurns = $data['transcript'] ?? $data['messages'] ?? $data['conversation'] ?? [];
        $rawTurns = is_array($rawTurns) ? $rawTurns : [];
        $durationSeconds = max(0, (int) ($data['call_duration_secs'] ?? $data['duration_seconds'] ?? 0));
        $status = mb_substr(trim((string) ($data['status'] ?? 'completed')), 0, 40);

        $pdo = Database::get();
        $session = self::session($pdo, 'tel_' . hash('sha256', $callId), 'phone', 'clinic');
        $transcript = json_decode((string) $session['transcript_json'], true) ?: [];
        foreach ($rawTurns as $turn) {
            if (!is_array($turn)) {
                continue;
            }
            $role = in_array(($turn['role'] ?? ''), ['agent', 'assistant'], true) ? 'assistant' : 'user';
            $text = trim((string) ($turn['message'] ?? $turn['text'] ?? ''));
            if ($text === '') {
                continue;
            }
            $transcript[] = ['role' => $role, 'text' => mb_substr($text, 0, 500)];
        }
        self::save($pdo, (int) $session['id'], $transcript, 'elevenlabs');
        self::record($pdo, (int) $session['id'], 'answer_received', ['channel' => 'phone', 'provider' => 'elevenlabs']);

        $pdo->prepare(
            "UPDATE telephony_calls SET status = ?, duration_seconds = ?, updated_at = datetime('now') WHERE provider_call_id = ?"
        )->execute([$status, $durationSeconds, $callId]);

        self::logNoOutcomeCallAttempt($pdo, $callId, $status, $transcript);
        self::queuePostCallFollowup($pdo, $callId);
        Response::json(['status' => 'ok']);
    }

    /**
     * A completed-but-silent call, or one that never really connected
     * (no-answer/busy/failed/canceled), needs a call_log attempt logged so
     * the lead returns to the call queue for retry instead of vanishing
     * silently — a real conversation gets a real, human-reviewed outcome
     * from the tool calls above instead, never guessed here. Idempotent via
     * the exact-notes-text match, since the queue/init endpoints may see the
     * same finished call more than once.
     */
    private static function logNoOutcomeCallAttempt(\PDO $pdo, string $callId, string $status, array $transcript): void
    {
        $stmt = $pdo->prepare(
            'SELECT marketing_lead_id FROM telephony_calls WHERE provider_call_id = ? AND direction = \'outbound\''
        );
        $stmt->execute([$callId]);
        $leadId = (int) ($stmt->fetchColumn() ?: 0);
        if ($leadId < 1) {
            return;
        }
        $hasUserTurn = (bool) array_filter(
            $transcript,
            static fn($turn): bool => is_array($turn) && ($turn['role'] ?? '') === 'user'
        );
        if ($hasUserTurn) {
            return; // A real conversation happened; leave the outcome to the reviewed tool calls above.
        }
        $detail = strtolower($status) === 'completed'
            ? 'The call connected and completed, but the recipient gave no speech response.'
            : "The call did not result in a conversation (status: {$status}).";
        $note = sprintf('Lisa AI call: %s ElevenLabs status: %s. Conversation ID: %s', $detail, $status, $callId);
        $pdo->prepare(
            "INSERT INTO call_log (lead_id, outcome, notes)
             SELECT ?, 'no_answer', ?
             WHERE NOT EXISTS (SELECT 1 FROM call_log WHERE lead_id = ? AND notes = ?)"
        )->execute([$leadId, $note, $leadId, $note]);
    }

    public static function adminStats(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $phoneAgentConfigured = trim((string) Settings::get('elevenlabs_phone_agent_id')) !== '';
        $phoneNumberConfigured = trim((string) Settings::get('elevenlabs_phone_number_id')) !== '';
        $webhookSecretConfigured = trim((string) Settings::get('elevenlabs_phone_webhook_secret')) !== '';
        $postcallSecretConfigured = trim((string) Settings::get('elevenlabs_phone_postcall_signing_secret')) !== '';
        $summary = $pdo->query(
            "SELECT
                COUNT(*) AS sessions,
                SUM(channel = 'web') AS web_sessions,
                SUM(channel = 'phone') AS phone_sessions,
                SUM(CASE WHEN transcript_json <> '[]' THEN 1 ELSE 0 END) AS engaged
             FROM voice_demo_sessions"
        )->fetch();
        $events = $pdo->query(
            'SELECT event_type, COUNT(*) AS count FROM voice_demo_events GROUP BY event_type'
        )->fetchAll();
        $recent = $pdo->query(
            "SELECT vds.id, vds.token, vds.channel, vds.niche, vds.provider,
                    vds.transcript_json, vds.created_at, vds.updated_at,
                    tc.direction AS call_direction, tc.status AS call_status,
                    tc.provider_call_id, tc.from_number, tc.to_number,
                    tc.duration_seconds, ml.business_name AS call_business_name
             FROM voice_demo_sessions vds
             LEFT JOIN telephony_calls tc ON tc.session_id = vds.id
             LEFT JOIN marketing_leads ml ON ml.id = tc.marketing_lead_id
             ORDER BY vds.updated_at DESC LIMIT 100"
        )->fetchAll();
        foreach ($recent as &$row) {
            $turns = json_decode((string) $row['transcript_json'], true) ?: [];
            $row['turn_count'] = count($turns);
            $row['transcript'] = array_values(array_filter(array_map(
                static function ($turn): ?array {
                    if (!is_array($turn)) {
                        return null;
                    }
                    $role = ($turn['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
                    $text = trim((string) ($turn['text'] ?? ''));
                    return $text === '' ? null : [
                        'role' => $role,
                        'text' => mb_substr($text, 0, 4000),
                    ];
                },
                $turns
            )));
            $row['last_question'] = '';
            foreach (array_reverse($turns) as $turn) {
                if (($turn['role'] ?? '') === 'user') {
                    $row['last_question'] = $turn['text'] ?? '';
                    break;
                }
            }
            unset($row['transcript_json'], $row['token']);
        }
        $callLogs = $pdo->query(
            "SELECT tc.id, tc.session_id, tc.provider_call_id, tc.direction, tc.from_number, tc.to_number,
                    tc.status, tc.duration_seconds, tc.created_at, tc.updated_at,
                    ml.business_name AS lead_name, wf.status AS whatsapp_followup_status,
                    wf.email_status AS email_followup_status
             FROM telephony_calls tc
             LEFT JOIN marketing_leads ml ON ml.id = tc.marketing_lead_id
             LEFT JOIN whatsapp_call_followups wf ON wf.telephony_call_id = tc.id
             ORDER BY tc.created_at DESC, tc.id DESC
             LIMIT 100"
        )->fetchAll();
        $callQueue = (int) $pdo->query(
            "SELECT COUNT(*) FROM marketing_leads
             WHERE status = 'pitch_ready' AND pitch_channel = 'phone'
               AND contact_phone IS NOT NULL AND trim(contact_phone) <> ''"
        )->fetchColumn();
        $callsToday = (int) $pdo->query(
            "SELECT COUNT(*) FROM call_log WHERE date(called_at) = date('now')"
        )->fetchColumn();
        $aiCallsToday = (int) $pdo->query(
            "SELECT COUNT(*) FROM telephony_calls
             WHERE direction = 'outbound' AND marketing_lead_id IS NOT NULL
               AND date(created_at) = date('now')"
        )->fetchColumn();
        Response::json([
            'summary' => $summary,
            'events' => $events,
            'recent' => $recent,
            'call_logs' => $callLogs,
            'telephony_enabled' => $phoneAgentConfigured && $phoneNumberConfigured,
            'webhook_url' => 'https://princecaleb.dev/api/v1/voice/elevenlabs/init',
            'post_call_webhook_url' => 'https://princecaleb.dev/api/v1/voice/elevenlabs/post-call',
            'marketing_calls' => [
                'queued' => $callQueue,
                'logged_today' => $callsToday,
                'ai_calls_today' => $aiCallsToday,
                'ai_call_daily_cap' => 5,
                'ai_calls_remaining' => max(0, 5 - $aiCallsToday),
                'automated_dialing' => false,
                'approval_gated_ai_calls' => true,
            ],
            'readiness' => [
                ['label' => 'ElevenLabs phone agent ID saved', 'complete' => $phoneAgentConfigured],
                ['label' => 'ElevenLabs phone number ID saved', 'complete' => $phoneNumberConfigured],
                ['label' => 'Phone webhook secret saved', 'complete' => $webhookSecretConfigured],
                ['label' => 'Post-call signing secret saved', 'complete' => $postcallSecretConfigured],
            ],
        ]);
    }

    /** @return array{reply:string,provider:?string,mode:string} */
    private static function reply(array $transcript): array
    {
        $systemPrompt = self::prompt('web');
        $noopExecutor = static fn(string $name, array $args): array => ['error' => 'No tools available.'];
        $result = AiAgentEngine::runLowLatency($systemPrompt, [], $noopExecutor, $transcript, 1);
        if (!is_string($result['reply']) || trim($result['reply']) === '') {
            $result['reply'] = "I can demonstrate routine call handling, appointment intake, approved clinic FAQs, "
                . "and safe staff handoffs. The AI service is temporarily unavailable, but the demo never performs real actions.";
        }
        return [
            'reply' => trim($result['reply']),
            'provider' => $result['provider'],
            'mode' => $result['mode'],
        ];
    }

    private static function prompt(string $channel = 'web', ?array $context = null): string
    {
        $bookingTimezone = Settings::get('booking_timezone') ?: 'Africa/Accra';
        try {
            $bookingToday = (new \DateTime('now', new \DateTimeZone($bookingTimezone)))->format('Y-m-d');
        } catch (\Throwable) {
            $bookingToday = gmdate('Y-m-d');
            $bookingTimezone = 'UTC';
        }
        $bookingDateContext = "The current date in {$bookingTimezone} is {$bookingToday}. Ghana commonly writes "
            . "numeric dates as DD-MM-YYYY, so 07-08-2026 means 7 August 2026, not July 8. Convert dates to "
            . "YYYY-MM-DD only for tools. In every spoken reply, say the date as day, month, and four-digit year "
            . "using numbers in that order; never say the month or year in words. Use the date-range availability "
            . "tool when asked for open dates across "
            . "a week or range; do not force the caller to name one date at a time. Summarize open dates first. "
            . "If a chosen day has more than four slots, ask morning or afternoon, then offer at most four exact times. ";
        if ($channel === 'outbound') {
            $business = mb_substr(trim((string) ($context['business_name'] ?? 'the business')), 0, 160);
            $contactName = mb_substr(trim((string) ($context['contact_name'] ?? '')), 0, 160);
            $contactEmail = mb_substr(trim((string) ($context['contact_email'] ?? '')), 0, 254);
            $website = mb_substr(trim((string) ($context['website_url'] ?? '')), 0, 300);
            $script = mb_substr(trim((string) ($context['pitch_body'] ?? '')), 0, 3000);
            $firstTurn = !empty($context['is_first_turn'])
                ? "This is the first response after the recipient spoke. The welcome greeting may have been "
                    . "interrupted. Before any small talk or question, briefly say you are Lisa, Prince Caleb's AI "
                    . "assistant, and state the specific reason for calling from the reviewed brief. Do not merely "
                    . "say hello or ask how they are. Then ask whether they have a moment to continue. "
                : '';
            return "You are Lisa, Prince Caleb's disclosed AI outreach assistant on a single human-approved outbound "
                . "call. {$bookingDateContext}The recipient requested or consented to this call. Sound warm, curious, and conversational, "
                . "not like a script or sales presentation. Respond directly to what the person just said before "
                . "moving the conversation forward. Usually speak one or two short natural sentences, use contractions, "
                . "and ask at most one relevant question at a time. Vary your wording; do not repeat the business name, "
                . "contact name, "
                . "your identity, the full service list, or a canned closing on every turn. Use no markdown, lists, "
                . "emoji, or spoken URLs. Immediately respect no, not interested, stop, "
                . "or a request to call later; do not pressure, argue, or continue pitching — call the log_opt_out "
                . "tool for a firm no, or log_callback_request if they ask to be called later, then say goodbye. "
                . "Never hide that you are "
                . "an AI assistant. Do not collect sensitive information, payment details, passwords, IDs, or health "
                . "information. You can check real availability and create a real booking using your tools. Never "
                . "claim a booking, email, calendar event, Slack alert, saved note, or notification succeeded unless "
                . "the booking tool returned success. Before booking, obtain a real name and email, check availability, "
                . "offer only exact returned slots, read the chosen date, exact time, and timezone back, then wait for "
                . "an explicit yes. A vague response does not confirm a slot. When a reviewed email is provided below, "
                . "ask the person to confirm it is still the right email; never read the full address aloud first. "
                . "You may offer a WhatsApp or email summary "
                . "after the person shows interest. Ask clearly which channel they permit, then call "
                . "capture_whatsapp_followup_consent or capture_email_followup_consent with the confirmed detail. Only offer email when the "
                . "reviewed lead has an email on file; never ask someone to spell an email address aloud. "
                . "For WhatsApp, ask whether Lisa may send it to the number on this call. "
                . "Never say it was sent during the call; after explicit agreement say it will be sent after the call. "
                . "First understand whether the person has a repetitive customer-service or operational problem; only "
                . "then connect one relevant capability to it. Mention the booking or contact option only once, when "
                . "the person shows interest or asks for a next step. Ground the conversation only in this reviewed "
                . "context. Always speak as Lisa and refer to Prince Caleb in the third person. The stored call brief "
                . "may be an older draft containing a first-person Prince introduction; treat that only as background, "
                . "never repeat it, never say you are Prince, and never imply Prince is personally speaking.\n"
                . ($contactName !== ''
                    ? "The intended contact is {$contactName}. Confirm you have reached that person before sharing "
                        . "business-specific details, then use their first name naturally but sparingly. "
                    : "No contact name was provided before the call. After stating the reason for calling and receiving "
                        . "permission to continue, ask the person's name naturally. Do not invent a name or make the "
                        . "conversation feel like a form. ")
                . $firstTurn
                . "Business: {$business}\nContact name: " . ($contactName !== '' ? $contactName : 'Not provided')
                . "\nReviewed contact email: " . ($contactEmail !== '' ? $contactEmail : 'Not provided')
                . "\nWebsite: {$website}\nReviewed call brief:\n{$script}"
                . LisaInstructions::promptBlock('approved outbound calls');
        }
        if ($channel === 'phone') {
            $ownerContext = !empty($context['is_owner'])
                ? "The incoming caller ID matches Prince Caleb's saved owner voice number, so address him as "
                    . "Prince Caleb and speak as his assistant rather than using the customer sales flow. Caller ID "
                    . "can be spoofed: recognition is conversational context only and must never authorize private "
                    . "information, account access, payments, credentials, administrative changes, or sensitive actions. "
                    . "Prince often tests you by describing a hypothetical customer scenario or role-playing as a "
                    . "prospect — treat that as a test of your responses, not a real inquiry, and never run the "
                    . "customer sales flow on him or ask him for his own name, email, or phone number just because "
                    . "the conversation content sounds like a pitch. "
                : '';
            return "You are Lisa, Prince Caleb's AI customer service phone agent. {$bookingDateContext}{$ownerContext}You represent Prince Caleb's "
                . "business and answer questions about AI voice agent pilots, Voice plus WhatsApp systems, business "
                . "automation, and the custom engineering behind them. You are speaking aloud, so answer in one to "
                . "three short, natural sentences with no markdown, lists, emoji, URLs, or technical jargon. "
                . "Help callers identify a repetitive workflow, suitable starting channel, human handoff points, "
                . "the monitored pilot process, implementation versus variable usage costs, and next steps. Be "
                . "helpful and concise, but never invent prices, availability, client results, or capabilities. "
                . "You can check real availability and create a real booking using your tools. Never claim a booking, "
                . "email, calendar event, Slack alert, saved note, or notification succeeded unless the booking tool "
                . "returned success. Before booking, collect a real name and email, check availability, offer only "
                . "exact returned slots, read the chosen date, exact time, and timezone back, then wait for an explicit "
                . "yes. Ask the caller to spell their email, repeat it back carefully, and obtain confirmation before "
                . "using it. A vague answer such as right, okay, or go ahead after multiple options is not confirmation. "
                . "You cannot transfer calls. You may offer a WhatsApp summary after the caller "
                . "shows interest. Ask clearly whether Lisa may send it to the number on this call, then call "
                . "capture_whatsapp_followup_consent with the confirmed number. Email summaries "
                . "are only available when a reviewed outbound lead already has a valid email on file. Never ask an "
                . "inbound caller to spell an email address aloud. Never say a follow-up was "
                . "sent during the call; after explicit agreement say it will be sent after the call. If a caller wants to proceed, ask "
                . "them to use the contact or booking option on princecaleb.dev, or send a WhatsApp message. "
                . "Do not collect payment details, passwords, government IDs, medical information, or other "
                . "sensitive data. This is an inbound customer-service line, never a cold-outreach caller."
                . LisaInstructions::promptBlock('inbound phone calls');
        }

        return "You are Lisa, Prince Caleb's clinic voice-agent demonstration. You are speaking aloud, so answer in "
            . "one to three short, natural sentences with no markdown, lists, emoji, URLs, or technical jargon. "
            . "Demonstrate how a clinic agent can answer approved administrative FAQs, collect minimal appointment "
            . "details, check a hypothetical schedule, send reminders, and hand a caller to staff. This is a SAFE DEMO: "
            . "never claim you actually booked, messaged, called, saved, or notified anyone; describe what a deployed "
            . "system would do. Never diagnose, triage symptoms, recommend treatment or medication, interpret results, "
            . "or collect sensitive medical details. For any clinical, urgent, distressed, or ambiguous health question, "
            . "say you cannot provide medical guidance and direct the caller to clinic staff or local emergency services. "
            . "Do not ask for a real name, phone, email, patient number, symptoms, or health history. "
            . "You may answer questions about implementation, privacy-by-design, human handoff, and Prince's services."
            . LisaInstructions::promptBlock('website voice demos');
    }

    /** Builds the outbound system prompt for a reviewed Marketing Lead call, used by OutreachController::initiateAiCall(). */
    public static function outboundPrompt(array $context): string
    {
        return self::prompt('outbound', $context + ['is_first_turn' => true]);
    }

    private static function session(\PDO $pdo, string $token, string $channel, string $niche): array
    {
        if ($token !== '') {
            $stmt = $pdo->prepare('SELECT * FROM voice_demo_sessions WHERE token = ?');
            $stmt->execute([$token]);
            if ($row = $stmt->fetch()) return $row;
        }
        $token = $token !== '' ? $token : bin2hex(random_bytes(24));
        $pdo->prepare(
            'INSERT INTO voice_demo_sessions (token, channel, niche, transcript_json) VALUES (?, ?, ?, ?)'
        )->execute([$token, $channel, $niche, '[]']);
        $stmt = $pdo->prepare('SELECT * FROM voice_demo_sessions WHERE id = ?');
        $stmt->execute([(int) $pdo->lastInsertId()]);
        return $stmt->fetch();
    }

    private static function save(\PDO $pdo, int $id, array $transcript, ?string $provider): void
    {
        $pdo->prepare(
            "UPDATE voice_demo_sessions SET transcript_json = ?, provider = ?, updated_at = datetime('now') WHERE id = ?"
        )->execute([json_encode($transcript, JSON_UNESCAPED_UNICODE), $provider, $id]);
    }

    private static function record(\PDO $pdo, ?int $sessionId, string $event, array $meta = []): void
    {
        $pdo->prepare('INSERT INTO voice_demo_events (session_id, event_type, metadata_json) VALUES (?, ?, ?)')
            ->execute([$sessionId, $event, json_encode($meta, JSON_UNESCAPED_UNICODE)]);
    }

    public static function isOwnerNumber(string $number): bool
    {
        $ownerNumber = self::normalizePhoneNumber((string) Settings::get('owner_voice_number'));
        return $ownerNumber !== '' && hash_equals($ownerNumber, self::normalizePhoneNumber($number));
    }

    private static function normalizePhoneNumber(string $number): string
    {
        $number = trim($number);
        if ($number === '') return '';
        $digits = preg_replace('/\D+/', '', $number) ?? '';
        return $digits === '' ? '' : '+' . $digits;
    }

    private static function queuePostCallFollowup(\PDO $pdo, string $callSid): bool
    {
        $stmt = $pdo->prepare(
            "SELECT tc.id, tc.session_id, tc.from_number, tc.to_number, tc.whatsapp_followup_number,
                    tc.whatsapp_followup_consent_at, tc.email_followup_address,
                    tc.email_followup_consent_at, ml.contact_name
             FROM telephony_calls tc
             LEFT JOIN marketing_leads ml ON ml.id = tc.marketing_lead_id
             WHERE tc.provider_call_id = ?
               AND (tc.whatsapp_followup_consent_at IS NOT NULL OR tc.email_followup_consent_at IS NOT NULL)"
        );
        $stmt->execute([$callSid]);
        $call = $stmt->fetch();
        if (!$call) return false;
        $pdo->prepare(
            "INSERT OR IGNORE INTO whatsapp_call_followups
             (telephony_call_id, session_id, recipient_number, recipient_email, contact_name, status, email_status)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        )->execute([
            $call['id'],
            $call['session_id'],
            $call['whatsapp_followup_number'] ?: ($call['to_number'] ?: $call['from_number']),
            $call['email_followup_address'],
            trim((string) ($call['contact_name'] ?? '')) ?: null,
            !empty($call['whatsapp_followup_consent_at']) ? 'queued' : 'not_requested',
            !empty($call['email_followup_consent_at']) ? 'queued' : 'not_requested',
        ]);
        return true;
    }

    /**
     * Custom secret you create and set as a header/query param on the
     * ElevenLabs phone agent's init/tool webhooks. Mirrors
     * LiveChatController::verifyElevenLabsSecret() (WhatsApp), including its
     * query-string fallback for the tool webhook, which ElevenLabs is
     * confirmed (2026-08-08, WhatsApp channel) to not reliably send as a
     * header on tool calls.
     */
    private static function verifyElevenLabsPhoneSecret(): bool
    {
        $expected = trim((string) Settings::get('elevenlabs_phone_webhook_secret'));
        if ($expected === '') {
            return false;
        }
        $provided = trim((string) ($_SERVER['HTTP_X_ELEVENLABS_SECRET'] ?? ''));
        if ($provided !== '' && hash_equals($expected, $provided)) {
            return true;
        }
        $queryProvided = trim((string) ($_GET['secret'] ?? ''));
        return $queryProvided !== '' && hash_equals($expected, $queryProvided);
    }

    /**
     * ElevenLabs-generated HMAC secret for the post-call webhook, Stripe-style
     * signing. Mirrors LiveChatController::verifyElevenLabsHmacSignature().
     */
    private static function verifyElevenLabsPhoneHmacSignature(string $rawBody): bool
    {
        $secret = trim((string) Settings::get('elevenlabs_phone_postcall_signing_secret'));
        $header = trim((string) ($_SERVER['HTTP_ELEVENLABS_SIGNATURE'] ?? ''));
        if ($secret === '' || $header === '') {
            return false;
        }

        $parts = [];
        foreach (explode(',', $header) as $piece) {
            [$key, $val] = array_pad(explode('=', $piece, 2), 2, '');
            $parts[trim($key)] = trim($val);
        }
        $timestamp = $parts['t'] ?? '';
        $signature = $parts['v0'] ?? '';
        if ($timestamp === '' || $signature === '' || !ctype_digit($timestamp)) {
            return false;
        }
        if (abs(time() - (int) $timestamp) > 1800) {
            error_log('ElevenLabs phone post-call webhook rejected: signature timestamp outside 30-minute tolerance.');
            return false;
        }

        $expected = hash_hmac('sha256', $timestamp . '.' . $rawBody, $secret);
        return hash_equals($expected, $signature);
    }
}
