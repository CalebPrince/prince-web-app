<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\AiAgentEngine;
use App\Support\CallOutcomeSync;
use App\Support\Database;
use App\Support\LisaInstructions;
use App\Support\Response;
use App\Support\Settings;

/**
 * Side-effect-free clinic web demo plus the Twilio customer-service front door.
 * Browser demos remain read-only. Verified Twilio calls receive a narrowly
 * scoped action set for availability and confirmed bookings.
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
        $result = self::reply($transcript, 'web');
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

    public static function incomingCall(): void
    {
        if (!self::verifyTwilio() || Settings::get('twilio_voice_enabled') !== '1') {
            http_response_code(403);
            exit;
        }
        $callSid = trim((string) ($_POST['CallSid'] ?? ''));
        $from = trim((string) ($_POST['From'] ?? ''));
        if ($callSid === '') {
            http_response_code(422);
            exit;
        }
        $pdo = Database::get();
        $token = 'tel_' . hash('sha256', $callSid);
        $session = self::session($pdo, $token, 'phone', 'clinic');
        $isOwner = self::isOwnerNumber($from);
        $pdo->prepare(
            "INSERT OR IGNORE INTO telephony_calls
             (provider_call_id, session_id, provider, from_number, to_number, status)
             VALUES (?, ?, 'twilio', ?, ?, 'in-progress')"
        )->execute([$callSid, $session['id'], $from ?: null, trim((string) ($_POST['To'] ?? '')) ?: null]);
        self::twimlGather(
            $isOwner
                ? "Hi Prince Caleb, welcome back. You're speaking with Lisa, your AI customer service assistant. How can I help?"
                : "Hello, you've reached Prince Caleb's AI customer service assistant, Lisa. "
                    . "I can help with AI voice agents, WhatsApp assistants, workflow automation, and custom systems. "
                    . "How can I help?"
        );
    }

    public static function outboundCall(): void
    {
        if (!self::verifyTwilio() || Settings::get('twilio_voice_enabled') !== '1') {
            http_response_code(403);
            exit;
        }
        $callSid = trim((string) ($_POST['CallSid'] ?? ''));
        $leadId = max(0, (int) ($_GET['lead'] ?? 0));
        if ($callSid === '' || $leadId === 0) {
            http_response_code(422);
            exit;
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare(
            "SELECT id, business_name, contact_name, pitch_body FROM marketing_leads
             WHERE id = ? AND status = 'pitch_ready' AND pitch_channel = 'phone'"
        );
        $stmt->execute([$leadId]);
        $lead = $stmt->fetch();
        if (!$lead) {
            self::twimlSay('This approved call is no longer available. Goodbye.');
            return;
        }

        $session = self::session($pdo, 'tel_' . hash('sha256', $callSid), 'phone', 'outreach');
        $pdo->prepare(
            "INSERT OR IGNORE INTO telephony_calls
             (provider_call_id, session_id, marketing_lead_id, provider, direction, from_number, to_number, status, consent_confirmed_at)
             VALUES (?, ?, ?, 'twilio', 'outbound', ?, ?, 'in-progress', datetime('now'))"
        )->execute([
            $callSid,
            $session['id'],
            $leadId,
            trim((string) ($_POST['From'] ?? '')) ?: null,
            trim((string) ($_POST['To'] ?? '')) ?: null,
        ]);
        $pdo->prepare(
            "UPDATE telephony_calls SET session_id = ?, marketing_lead_id = ?, direction = 'outbound',
             status = 'in-progress', updated_at = datetime('now') WHERE provider_call_id = ?"
        )->execute([$session['id'], $leadId, $callSid]);

        $contactName = trim((string) ($lead['contact_name'] ?? ''));
        $nameGreeting = $contactName !== '' ? "Hello, may I speak with {$contactName}? " : 'Hello. ';
        self::twimlGather(
            $nameGreeting . "This is Lisa, Prince Caleb's AI assistant. I'm calling on his behalf with a customer-service "
            . "improvement idea prepared for {$lead['business_name']}. Is now a good time for a brief conversation?"
        );
    }

    public static function callTurn(): void
    {
        set_time_limit(90);
        if (!self::verifyTwilio() || Settings::get('twilio_voice_enabled') !== '1') {
            http_response_code(403);
            exit;
        }
        $callSid = trim((string) ($_POST['CallSid'] ?? ''));
        $speech = trim((string) ($_POST['SpeechResult'] ?? ''));
        if ($callSid === '' || $speech === '') {
            self::twimlGather("I didn't catch that. Please say your question again.");
            return;
        }
        RateLimitMiddleware::enforce('voice_phone_' . preg_replace('/\W/', '', $callSid), 30);
        $pdo = Database::get();
        $session = self::session($pdo, 'tel_' . hash('sha256', $callSid), 'phone', 'clinic');
        $callStmt = $pdo->prepare(
            "SELECT tc.direction, tc.from_number, tc.to_number, ml.id, ml.business_name, ml.contact_name, ml.contact_email, ml.website_url, ml.pitch_body
             FROM telephony_calls tc
             LEFT JOIN marketing_leads ml ON ml.id = tc.marketing_lead_id
             WHERE tc.provider_call_id = ?"
        );
        $callStmt->execute([$callSid]);
        $callContext = $callStmt->fetch() ?: [];
        $isOutbound = ($callContext['direction'] ?? '') === 'outbound' && !empty($callContext['id']);
        $callContext['is_owner'] = !$isOutbound
            && self::isOwnerNumber((string) ($callContext['from_number'] ?? ''));
        $transcript = json_decode((string) $session['transcript_json'], true) ?: [];
        self::captureWhatsAppConsent($pdo, $callSid, $speech, $transcript, $callContext);
        self::captureEmailConsent($pdo, $callSid, $speech, $transcript, $callContext);
        if ($isOutbound && preg_match('/\b(stop calling|do not call|don\'t call|remove me|not interested)\b/i', $speech)) {
            $transcript[] = ['role' => 'user', 'text' => mb_substr($speech, 0, 500)];
            $transcript[] = ['role' => 'assistant', 'text' => "Understood. We won't call again. Goodbye."];
            self::save($pdo, (int) $session['id'], $transcript, null);
            $pdo->prepare("UPDATE marketing_leads SET status = 'rejected', updated_at = datetime('now') WHERE id = ?")
                ->execute([(int) $callContext['id']]);
            $pdo->prepare("INSERT INTO call_log (lead_id, outcome, notes) VALUES (?, 'not_interested', ?)")
                ->execute([(int) $callContext['id'], 'Opted out during Lisa AI call']);
            self::twimlSay("Understood. We won't call again. Goodbye.");
            return;
        }
        if ($isOutbound && preg_match('/\b(call (me )?later|not (a )?good time|not now|busy right now)\b/i', $speech)) {
            $transcript[] = ['role' => 'user', 'text' => mb_substr($speech, 0, 500)];
            $transcript[] = ['role' => 'assistant', 'text' => 'Of course. Goodbye.'];
            self::save($pdo, (int) $session['id'], $transcript, null);
            $pdo->prepare("INSERT INTO call_log (lead_id, outcome, notes) VALUES (?, 'callback', ?)")
                ->execute([(int) $callContext['id'], 'Recipient asked to be contacted later during Lisa AI call']);
            self::twimlSay('Of course. Goodbye.');
            return;
        }
        if (count($transcript) >= self::MAX_TURNS) {
            self::twimlSay("Thank you for your time. This call has reached its conversation limit. Goodbye.");
            return;
        }
        $transcript[] = ['role' => 'user', 'text' => mb_substr($speech, 0, 500)];
        $result = self::reply($transcript, $isOutbound ? 'outbound' : 'phone', $callContext);
        $transcript[] = ['role' => 'assistant', 'text' => $result['reply']];
        self::save($pdo, (int) $session['id'], $transcript, $result['provider']);
        self::record($pdo, (int) $session['id'], 'question_sent', ['channel' => 'phone']);
        self::record($pdo, (int) $session['id'], 'answer_received', ['channel' => 'phone', 'provider' => $result['provider']]);
        self::twimlGather($result['reply']);
    }

    /**
     * Internal HTTP bridge used by the stateless ConversationRelay companion.
     * Twilio audio never reaches this endpoint: it accepts a final transcript
     * and returns Lisa's next text response while keeping the PHP app as the
     * source of truth for prompts, safety decisions, and stored call history.
     */
    public static function relayTurn(): void
    {
        set_time_limit(90);
        $configuredSecret = trim((string) Settings::get('twilio_conversation_relay_secret'));
        $providedSecret = trim((string) ($_SERVER['HTTP_X_RELAY_SECRET'] ?? ''));
        if (
            Settings::get('twilio_voice_enabled') !== '1'
            || Settings::get('twilio_conversation_relay_enabled') !== '1'
            || $configuredSecret === ''
            || $providedSecret === ''
            || !hash_equals($configuredSecret, $providedSecret)
        ) {
            Response::error('Relay authorization failed.', 403);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $callSid = mb_substr(trim((string) ($data['call_sid'] ?? '')), 0, 80);
        $speech = mb_substr(trim((string) ($data['speech'] ?? '')), 0, 500);
        if ($callSid === '' || $speech === '') {
            Response::error('call_sid and speech are required.', 422);
        }
        RateLimitMiddleware::enforce('voice_relay_' . preg_replace('/\W/', '', $callSid), 40);

        $pdo = Database::get();
        $session = self::session($pdo, 'tel_' . hash('sha256', $callSid), 'phone', 'clinic');
        $callStmt = $pdo->prepare(
            "SELECT tc.direction, tc.from_number, tc.to_number, ml.id, ml.business_name, ml.contact_name, ml.contact_email, ml.website_url, ml.pitch_body
             FROM telephony_calls tc
             LEFT JOIN marketing_leads ml ON ml.id = tc.marketing_lead_id
             WHERE tc.provider_call_id = ?"
        );
        $callStmt->execute([$callSid]);
        $callContext = $callStmt->fetch() ?: [];
        $isOutbound = ($callContext['direction'] ?? '') === 'outbound' && !empty($callContext['id']);
        $callContext['is_owner'] = !$isOutbound
            && self::isOwnerNumber((string) ($callContext['from_number'] ?? ''));
        $transcript = json_decode((string) $session['transcript_json'], true) ?: [];
        self::captureWhatsAppConsent($pdo, $callSid, $speech, $transcript, $callContext);
        self::captureEmailConsent($pdo, $callSid, $speech, $transcript, $callContext);

        if ($isOutbound && preg_match('/\b(stop calling|do not call|don\'t call|remove me|not interested)\b/i', $speech)) {
            $reply = "Understood. We won't call again. Goodbye.";
            $transcript[] = ['role' => 'user', 'text' => $speech];
            $transcript[] = ['role' => 'assistant', 'text' => $reply];
            self::save($pdo, (int) $session['id'], $transcript, null);
            $pdo->prepare("UPDATE marketing_leads SET status = 'rejected', updated_at = datetime('now') WHERE id = ?")
                ->execute([(int) $callContext['id']]);
            $pdo->prepare("INSERT INTO call_log (lead_id, outcome, notes) VALUES (?, 'not_interested', ?)")
                ->execute([(int) $callContext['id'], 'Opted out during Lisa AI call']);
            Response::json(['reply' => $reply, 'end' => true]);
        }
        if ($isOutbound && preg_match('/\b(call (me )?later|not (a )?good time|not now|busy right now)\b/i', $speech)) {
            $reply = 'Of course. Goodbye.';
            $transcript[] = ['role' => 'user', 'text' => $speech];
            $transcript[] = ['role' => 'assistant', 'text' => $reply];
            self::save($pdo, (int) $session['id'], $transcript, null);
            $pdo->prepare("INSERT INTO call_log (lead_id, outcome, notes) VALUES (?, 'callback', ?)")
                ->execute([(int) $callContext['id'], 'Recipient asked to be contacted later during Lisa AI call']);
            Response::json(['reply' => $reply, 'end' => true]);
        }
        if (count($transcript) >= self::MAX_TURNS) {
            Response::json([
                'reply' => 'Thank you for your time. This call has reached its conversation limit. Goodbye.',
                'end' => true,
            ]);
        }
        if (self::callerFinishedConversation($speech)) {
            $reply = "You're welcome. Thank you for calling. Goodbye.";
            $transcript[] = ['role' => 'user', 'text' => $speech];
            $transcript[] = ['role' => 'assistant', 'text' => $reply];
            self::save($pdo, (int) $session['id'], $transcript, null);
            self::record($pdo, (int) $session['id'], 'answer_received', [
                'channel' => 'conversation_relay',
                'conversation_complete' => true,
            ]);
            Response::json(['reply' => $reply, 'end' => true]);
        }

        $transcript[] = ['role' => 'user', 'text' => $speech];
        $result = self::reply($transcript, $isOutbound ? 'outbound' : 'phone', $callContext);
        $bookingConfirmed = !empty($result['booking_confirmed']);
        $endConversation = $bookingConfirmed || self::assistantFinishedConversation($result['reply']);
        $transcript[] = ['role' => 'assistant', 'text' => $result['reply']];
        self::save($pdo, (int) $session['id'], $transcript, $result['provider']);
        self::record($pdo, (int) $session['id'], 'question_sent', ['channel' => 'conversation_relay']);
        self::record($pdo, (int) $session['id'], 'answer_received', [
            'channel' => 'conversation_relay',
            'provider' => $result['provider'],
        ]);
        Response::json([
            'reply' => $result['reply'],
            'end' => $endConversation,
            'booking_confirmed' => $bookingConfirmed,
        ]);
    }

    public static function callStatus(): void
    {
        if (!self::verifyTwilio()) {
            http_response_code(403);
            exit;
        }
        $pdo = Database::get();
        $callSid = trim((string) ($_POST['CallSid'] ?? ''));
        $callStatus = mb_substr(trim((string) ($_POST['CallStatus'] ?? 'unknown')), 0, 40);
        $pdo->prepare(
            'UPDATE telephony_calls SET status = ?, duration_seconds = ?, updated_at = datetime(\'now\') WHERE provider_call_id = ?'
        )->execute([
            $callStatus,
            max(0, (int) ($_POST['CallDuration'] ?? 0)),
            $callSid,
        ]);
        $attemptLogged = CallOutcomeSync::record($pdo, $callSid, $callStatus);
        $followupQueued = $callStatus === 'completed' && self::queuePostCallFollowup($pdo, $callSid);
        Response::json([
            'status' => 'ok',
            'attempt_logged' => $attemptLogged,
            'whatsapp_followup_queued' => $followupQueued,
        ]);
    }

    public static function adminStats(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $authTokenConfigured = trim((string) Settings::get('twilio_auth_token')) !== '';
        $accountSidConfigured = trim((string) Settings::get('twilio_account_sid')) !== '';
        $whatsappNumber = trim((string) Settings::get('twilio_whatsapp_number'));
        $voiceNumber = trim((string) Settings::get('twilio_voice_number'));
        $voiceEnabled = Settings::get('twilio_voice_enabled') === '1';
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
            'telephony_enabled' => $voiceEnabled && $authTokenConfigured && $voiceNumber !== '',
            'voice_number' => $voiceNumber ?: null,
            'webhook_url' => 'https://princecaleb.dev/api/v1/voice/twilio/incoming',
            'status_callback_url' => 'https://princecaleb.dev/api/v1/voice/twilio/status',
            'whatsapp' => [
                'sandbox_tested' => true,
                'configured' => $authTokenConfigured && $whatsappNumber !== '',
                'number' => $whatsappNumber ?: null,
                'webhook_url' => 'https://princecaleb.dev/api/v1/whatsapp/webhook',
            ],
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
                ['label' => 'Twilio Account SID saved', 'complete' => $accountSidConfigured],
                ['label' => 'Twilio Auth Token saved', 'complete' => $authTokenConfigured],
                ['label' => 'WhatsApp sender number saved', 'complete' => $whatsappNumber !== ''],
                ['label' => 'WhatsApp sandbox tested with Lisa', 'complete' => true],
                ['label' => 'Regulatory Bundle approved', 'complete' => Settings::get('twilio_regulatory_approved') === '1', 'external' => true],
                ['label' => 'Production WhatsApp sender approved', 'complete' => Settings::get('twilio_whatsapp_production_approved') === '1', 'external' => true],
                ['label' => 'Voice number saved', 'complete' => $voiceNumber !== ''],
                ['label' => 'Customer-service voice agent enabled', 'complete' => $voiceEnabled],
                [
                    'label' => 'Natural ConversationRelay configured',
                    'complete' => self::conversationRelayReady(),
                    'external' => true,
                ],
            ],
        ]);
    }

    /** @return array{reply:string,provider:?string,mode:string,booking_confirmed:bool} */
    private static function reply(array $transcript, string $channel = 'web', ?array $context = null): array
    {
        if ($channel === 'outbound') {
            $context ??= [];
            $context['is_first_turn'] = !array_filter(
                $transcript,
                static fn(mixed $turn): bool => is_array($turn) && ($turn['role'] ?? '') === 'assistant'
            );
        }
        $systemPrompt = self::prompt($channel, $context);

        $bookingResult = null;
        $voiceToolsEnabled = in_array($channel, ['phone', 'outbound'], true);
        $tools = $voiceToolsEnabled ? self::voiceToolDeclarations() : [];
        $toolExecutor = static function (string $name, array $args) use (
            &$bookingResult,
            $transcript,
            $context
        ): array {
            try {
                if ($name === 'check_availability') {
                    return AppointmentController::getAvailableSlots((string) ($args['date'] ?? ''));
                }
                if ($name === 'check_availability_range') {
                    return AppointmentController::getAvailableDateRange(
                        (string) ($args['start_date'] ?? ''),
                        (string) ($args['end_date'] ?? '')
                    );
                }
                if ($name === 'book_appointment') {
                    if (!self::bookingConfirmationGiven($transcript)) {
                        return ['success' => false, 'error' => 'Read the exact date, time, and timezone back to the caller and wait for an explicit confirmation first.'];
                    }
                    $args['phone'] = trim((string) ($args['phone'] ?? '')) ?: self::callPartyNumber($context ?? []);
                    $args['name'] = trim((string) ($args['name'] ?? ''))
                        ?: trim((string) (($context ?? [])['contact_name'] ?? ''));
                    $trustedEmail = self::trustedBookingEmail($transcript, $context ?? []);
                    if ($trustedEmail === '') {
                        return [
                            'success' => false,
                            'error' => 'No verified email is available. Ask the caller for their real email, read it back, and wait for them to confirm it before booking.',
                        ];
                    }
                    // Never trust an address invented in tool arguments. Only
                    // book with an address sourced from the reviewed lead or
                    // explicitly read back and confirmed during this call.
                    $args['email'] = $trustedEmail;
                    $bookingResult = AppointmentController::createBooking($args);
                    if (!empty($bookingResult['success'])) {
                        $bookingResult['name'] = $args['name'];
                        $bookingResult['email'] = $trustedEmail;
                    }
                    return $bookingResult;
                }
                return ['error' => 'Unknown phone action.'];
            } catch (\Throwable $e) {
                error_log(sprintf('Voice Lisa tool "%s" failed: %s', $name, $e->getMessage()));
                return ['error' => 'The action could not be completed.'];
            }
        };
        // Once the caller has explicitly confirmed the exact read-back, do
        // not leave the final action to model discretion. Models can choose
        // to ask the same confirmation again instead of calling the tool,
        // creating an audible loop. Execute the validated booking
        // deterministically when all required values can be recovered.
        if ($voiceToolsEnabled
            && self::bookingConfirmationGiven($transcript)
            && ($confirmedArgs = self::confirmedBookingArguments($transcript, $context ?? [])) !== null) {
            $bookingResult = $toolExecutor('book_appointment', $confirmedArgs);
        }

        $result = is_array($bookingResult) && !empty($bookingResult['success'])
            ? ['reply' => null, 'provider' => null, 'mode' => 'fallback']
            : AiAgentEngine::runLowLatency(
                $systemPrompt,
                $tools,
                $toolExecutor,
                $transcript,
                $voiceToolsEnabled ? 2 : 1
            );
        if (is_array($bookingResult) && !empty($bookingResult['success'])) {
            $contactName = trim((string) ($bookingResult['name'] ?? ''));
            $thanks = $contactName !== '' ? ' Thank you, ' . $contactName . '.' : ' Thank you.';
            $result['reply'] = sprintf(
                'Your booking is confirmed for %s at %s, %s. A confirmation email is on its way.%s Have a great day. Goodbye.',
                (string) $bookingResult['date'],
                (string) $bookingResult['time'],
                (string) $bookingResult['timezone'],
                $thanks
            );
        } elseif ($voiceToolsEnabled && ($identityPrompt = self::requiredBookingIdentityPrompt(
            $transcript,
            $context ?? [],
            (string) ($result['reply'] ?? '')
        )) !== null) {
            $result['reply'] = $identityPrompt;
        } elseif ($voiceToolsEnabled && self::containsUnverifiedActionClaim((string) ($result['reply'] ?? ''))) {
            $result['reply'] = 'I have your preferred time, but it is not booked or confirmed yet. I need your name, email, an available exact time, and your clear confirmation before I can create the booking.';
        }
        if (!is_string($result['reply']) || trim($result['reply']) === '') {
            $result['reply'] = in_array($channel, ['phone', 'outbound'], true)
                ? "The customer service assistant is temporarily unavailable. Please use the contact or booking option on princecaleb.dev."
                : "I can demonstrate routine call handling, appointment intake, approved clinic FAQs, "
                    . "and safe staff handoffs. The AI service is temporarily unavailable, but the demo never performs real actions.";
        }
        return [
            'reply' => trim($result['reply']),
            'provider' => $result['provider'],
            'mode' => $result['mode'],
            'booking_confirmed' => is_array($bookingResult) && !empty($bookingResult['success']),
        ];
    }

    private static function voiceToolDeclarations(): array
    {
        return [
            [
                'name' => 'check_availability',
                'description' => 'Check real appointment availability for one exact date before offering times. If more than four slots are returned, ask for a morning or afternoon preference and offer at most four exact times.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'date' => ['type' => 'STRING', 'description' => 'Date in YYYY-MM-DD format.'],
                    ],
                    'required' => ['date'],
                ],
            ],
            [
                'name' => 'book_appointment',
                'description' => 'Create a real booking only after the caller has supplied a real name and email, selected an exact returned slot, heard the exact date/time/timezone read back, and explicitly confirmed it.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'name' => ['type' => 'STRING'],
                        'email' => ['type' => 'STRING'],
                        'phone' => ['type' => 'STRING'],
                        'date' => ['type' => 'STRING', 'description' => 'YYYY-MM-DD'],
                        'time' => ['type' => 'STRING', 'description' => 'Exact HH:MM value returned by check_availability.'],
                        'topic' => ['type' => 'STRING'],
                    ],
                    'required' => ['name', 'email', 'date', 'time'],
                ],
            ],
            [
                'name' => 'check_availability_range',
                'description' => 'Check real open dates and exact slots across a requested range of up to 14 days. Summarize dates first and never read every time across every day.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'start_date' => ['type' => 'STRING', 'description' => 'YYYY-MM-DD'],
                        'end_date' => ['type' => 'STRING', 'description' => 'YYYY-MM-DD'],
                    ],
                    'required' => ['start_date', 'end_date'],
                ],
            ],
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
                . "or a request to call later; do not pressure, argue, or continue pitching. Never hide that you are "
                . "an AI assistant. Do not collect sensitive information, payment details, passwords, IDs, or health "
                . "information. You can check real availability and create a real booking using your tools. Never "
                . "claim a booking, email, calendar event, Slack alert, saved note, or notification succeeded unless "
                . "the booking tool returned success. Before booking, obtain a real name and email, check availability, "
                . "offer only exact returned slots, read the chosen date, exact time, and timezone back, then wait for "
                . "an explicit yes. A vague response does not confirm a slot. When a reviewed email is provided below, "
                . "ask the person to confirm it is still the right email; never read the full address aloud first. "
                . "You may offer a WhatsApp or email summary "
                . "after the person shows interest. Ask clearly which channel they permit. Only offer email when the "
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
                . "shows interest. Ask clearly whether Lisa may send it to the number on this call. Email summaries "
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

    private static function isOwnerNumber(string $number): bool
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

    private static function bookingConfirmationGiven(array $transcript): bool
    {
        $lastUser = '';
        $previousAssistant = '';
        foreach (array_reverse($transcript) as $turn) {
            if ($lastUser === '' && ($turn['role'] ?? '') === 'user') {
                $lastUser = trim((string) ($turn['text'] ?? ''));
                continue;
            }
            if ($lastUser !== '' && ($turn['role'] ?? '') === 'assistant') {
                $previousAssistant = trim((string) ($turn['text'] ?? ''));
                break;
            }
        }
        $explicitYes = preg_match(
            '/^\s*(?:yes|yes please|correct|confirmed|I confirm|that(?:\'s| is) correct|please book it)\b/i',
            $lastUser
        ) === 1;
        // The preceding question must explicitly ask permission to create
        // the appointment. Merely confirming a name/email in a sentence
        // which also happens to mention "booking" is not final consent.
        $asksToBook = preg_match(
            '/\b(?:may I|can I|shall I|should I)\s+(?:go ahead and\s+)?book\b|'
            . '\bready (?:for me )?to book\b|'
            . '\b(?:does|is)\b.{0,45}\b(?:sound|correct)\b.{0,25}\bto book\b|'
            . '\bplease confirm\b.{0,80}\b(?:before|and)\b.{0,25}\bbook\b/i',
            $previousAssistant
        ) === 1;
        $readBack = $asksToBook
            && preg_match('/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/i', $previousAssistant) === 1
            && preg_match('/\b(?:Africa\/Accra|GMT|UTC|time(?:zone)?)\b/i', $previousAssistant) === 1
            && preg_match('/\b(?:20\d{2}|\d{4}-\d{2}-\d{2})\b/', $previousAssistant) === 1;
        return $explicitYes && $readBack;
    }

    private static function requiredBookingIdentityPrompt(
        array $transcript,
        array $context,
        string $proposedReply
    ): ?string {
        $allText = strtolower(implode(' ', array_map(
            static fn(array $turn): string => (string) ($turn['text'] ?? ''),
            array_filter($transcript, 'is_array')
        )));
        if (!preg_match('/\b(?:book|booking|appointment|schedule|follow-up call|call back|callback)\b/i', $allText)) {
            return null;
        }

        $userText = implode(' ', array_map(
            static fn(array $turn): string => ($turn['role'] ?? '') === 'user'
                ? (string) ($turn['text'] ?? '')
                : '',
            array_filter($transcript, 'is_array')
        ));
        $hasEmail = filter_var(trim((string) ($context['contact_email'] ?? '')), FILTER_VALIDATE_EMAIL)
            || preg_match('/\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/i', $userText) === 1
            || self::confirmedEmailInTranscript($transcript);
        $hasName = trim((string) ($context['contact_name'] ?? '')) !== ''
            || preg_match('/\b(?:my name is|this is|I am|I\'m)\s+([a-z][a-z .\'-]{1,80})/i', $userText) === 1;
        if ($hasName && $hasEmail) return null;

        $replyAlreadyAsks = (!$hasName && preg_match('/\b(?:your|full)\s+name\b/i', $proposedReply))
            || (!$hasEmail && stripos($proposedReply, 'email') !== false);
        if ($replyAlreadyAsks) return null;
        if (!$hasName && !$hasEmail) {
            return 'Before I check and confirm a booking, may I have your full name and email address? Please spell the email slowly so I can repeat it back accurately.';
        }
        if (!$hasName) {
            return 'Before I check and confirm the booking, may I have your full name?';
        }
        return 'Before I check and confirm the booking, may I have your email address? Please spell it slowly so I can repeat it back accurately.';
    }

    /**
     * Spoken email addresses often arrive across several transcription turns.
     * Accept the normalized address only when Lisa read a syntactically valid
     * address back and the caller explicitly confirmed that immediately after.
     */
    private static function confirmedEmailInTranscript(array $transcript): bool
    {
        return self::confirmedEmailAddress($transcript) !== '';
    }

    private static function confirmedEmailAddress(array $transcript): string
    {
        $pendingEmail = '';
        $confirmedEmail = '';
        foreach ($transcript as $turn) {
            if (!is_array($turn)) continue;
            $role = (string) ($turn['role'] ?? '');
            $text = trim((string) ($turn['text'] ?? ''));

            if ($role === 'assistant') {
                $pendingEmail = preg_match(
                    '/\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/i',
                    $text,
                    $matches
                ) === 1 ? strtolower($matches[0]) : '';
                continue;
            }

            if ($role === 'user' && $pendingEmail !== '') {
                if (preg_match(
                    '/^\s*(?:yes|yes please|correct|confirmed|that(?:\'s| is) right|that(?:\'s| is) correct|right)\b/i',
                    $text
                ) === 1) {
                    $confirmedEmail = $pendingEmail;
                }
                $pendingEmail = '';
            }
        }
        return $confirmedEmail;
    }

    private static function trustedBookingEmail(array $transcript, array $context): string
    {
        $confirmed = self::confirmedEmailAddress($transcript);
        if ($confirmed !== '') return $confirmed;

        $reviewed = strtolower(trim((string) ($context['contact_email'] ?? '')));
        if (filter_var($reviewed, FILTER_VALIDATE_EMAIL)
            && !self::isExampleEmailAddress($reviewed)) {
            return $reviewed;
        }
        return '';
    }

    /** @return array{name:string,email:string,phone:string,date:string,time:string,topic:string}|null */
    private static function confirmedBookingArguments(array $transcript, array $context): ?array
    {
        $previousAssistant = '';
        foreach (array_reverse($transcript) as $turn) {
            if (($turn['role'] ?? '') === 'assistant') {
                $previousAssistant = trim((string) ($turn['text'] ?? ''));
                break;
            }
        }
        if ($previousAssistant === '') return null;

        $date = '';
        if (preg_match('/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/', $previousAssistant, $match)) {
            $date = sprintf('%04d-%02d-%02d', (int) $match[1], (int) $match[2], (int) $match[3]);
        } elseif (preg_match('/\b(\d{1,2})\s*[,\/-]\s*(\d{1,2})\s*[,\/-]\s*(20\d{2})\b/', $previousAssistant, $match)) {
            $date = sprintf('%04d-%02d-%02d', (int) $match[3], (int) $match[2], (int) $match[1]);
        }

        $time = '';
        if (preg_match('/\b([01]?\d|2[0-3]):([0-5]\d)\b/', $previousAssistant, $match)) {
            $time = sprintf('%02d:%02d', (int) $match[1], (int) $match[2]);
        } elseif (preg_match('/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(AM|PM)\b/i', $previousAssistant, $match)) {
            $hour = (int) $match[1] % 12;
            if (strtoupper($match[3]) === 'PM') $hour += 12;
            $time = sprintf('%02d:%02d', $hour, isset($match[2]) && $match[2] !== '' ? (int) $match[2] : 0);
        }

        $name = trim((string) ($context['contact_name'] ?? ''));
        if ($name === '') {
            foreach ($transcript as $turn) {
                if (($turn['role'] ?? '') !== 'user') continue;
                if (preg_match(
                    '/\b(?:my name is|this is|I am|I\'m)\s+([a-z][a-z .\'-]{1,80})/i',
                    (string) ($turn['text'] ?? ''),
                    $match
                )) {
                    $name = trim($match[1]);
                    break;
                }
            }
        }

        $email = self::trustedBookingEmail($transcript, $context);
        if ($date === '' || $time === '' || $name === '' || $email === '') return null;

        return [
            'name' => $name,
            'email' => $email,
            'phone' => self::callPartyNumber($context),
            'date' => $date,
            'time' => $time,
            'topic' => trim((string) ($context['business_name'] ?? 'Consultation')),
        ];
    }

    private static function isExampleEmailAddress(string $email): bool
    {
        $domain = strtolower((string) substr(strrchr($email, '@') ?: '', 1));
        return in_array($domain, ['example.com', 'example.org', 'example.net'], true);
    }

    private static function callPartyNumber(array $context): string
    {
        $number = ($context['direction'] ?? '') === 'outbound'
            ? (string) ($context['to_number'] ?? '')
            : (string) ($context['from_number'] ?? '');
        return self::normalizePhoneNumber($number);
    }

    private static function containsUnverifiedActionClaim(string $reply): bool
    {
        if ($reply === '') return false;
        if (preg_match('/\b(?:not|isn\'t|is not|cannot|can\'t)\s+(?:yet\s+)?(?:booked|confirmed|scheduled|sent|saved)\b/i', $reply)) {
            return false;
        }
        return preg_match(
            '/\b(?:is|has been|you(?:\'re| are))\s+(?:booked|confirmed|scheduled)\b|'
            . '\bI(?:\'ll| will)\s+(?:make a note|let Prince Caleb know|schedule|book|notify)\b|'
            . '\bPrince Caleb will reach out\b|'
            . '\b(?:confirmation email|calendar invite|Slack alert)\s+(?:is|has been|was)\s+(?:sent|created)\b/i',
            $reply
        ) === 1;
    }

    private static function captureWhatsAppConsent(
        \PDO $pdo,
        string $callSid,
        string $speech,
        array $transcript,
        array $callContext
    ): void {
        if (preg_match('/\b(?:do not|don\'t|no|not)\b.{0,25}\bwhatsapp\b/i', $speech)) return;
        $explicit = preg_match(
            '/\b(?:send|message|share)\b.{0,35}\b(?:whatsapp|summary|details)\b|\bwhatsapp\b.{0,35}\b(?:send|message|share)\b/i',
            $speech
        ) === 1;
        $lastAssistant = '';
        foreach (array_reverse($transcript) as $turn) {
            if (($turn['role'] ?? '') === 'assistant') {
                $lastAssistant = (string) ($turn['text'] ?? '');
                break;
            }
        }
        $acceptedOffer = stripos($lastAssistant, 'whatsapp') !== false
            && preg_match('/^\s*(?:yes|yeah|sure|okay|ok|please|that(?:\'s| is) fine|go ahead)\b/i', $speech) === 1;
        if (!$explicit && !$acceptedOffer) return;

        $number = ($callContext['direction'] ?? '') === 'outbound'
            ? (string) ($callContext['to_number'] ?? '')
            : (string) ($callContext['from_number'] ?? '');
        $number = self::normalizePhoneNumber($number);
        if (!preg_match('/^\+[1-9]\d{7,14}$/', $number)) return;
        $pdo->prepare(
            "UPDATE telephony_calls SET whatsapp_followup_consent_at = datetime('now'),
             whatsapp_followup_number = ?, updated_at = datetime('now') WHERE provider_call_id = ?"
        )->execute([$number, $callSid]);
    }

    private static function captureEmailConsent(
        \PDO $pdo,
        string $callSid,
        string $speech,
        array $transcript,
        array $callContext
    ): void {
        $email = trim((string) ($callContext['contact_email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return;
        if (preg_match('/\b(?:do not|don\'t|no|not)\b.{0,25}\bemail\b/i', $speech)) return;
        $explicit = preg_match(
            '/\b(?:send|message|share|email)\b.{0,35}\b(?:email|summary|details)\b/i',
            $speech
        ) === 1;
        $lastAssistant = '';
        foreach (array_reverse($transcript) as $turn) {
            if (($turn['role'] ?? '') === 'assistant') {
                $lastAssistant = (string) ($turn['text'] ?? '');
                break;
            }
        }
        $acceptedOffer = stripos($lastAssistant, 'email') !== false
            && preg_match('/^\s*(?:yes|yeah|sure|okay|ok|please|that(?:\'s| is) fine|go ahead)\b/i', $speech) === 1;
        if (!$explicit && !$acceptedOffer) return;
        $pdo->prepare(
            "UPDATE telephony_calls SET email_followup_consent_at = datetime('now'),
             email_followup_address = ?, updated_at = datetime('now') WHERE provider_call_id = ?"
        )->execute([$email, $callSid]);
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

    private static function callerFinishedConversation(string $speech): bool
    {
        return preg_match(
            '/\b(?:goodbye|bye(?:\s+bye)?|that(?:\'s| is) all|that will be all|'
            . 'nothing else|no,?\s+thanks|no,?\s+thank you|thanks,?\s+bye|'
            . 'thank you,?\s+bye|we(?:\'re| are) done|end the call|hang up)\b/i',
            $speech
        ) === 1;
    }

    private static function assistantFinishedConversation(string $reply): bool
    {
        return preg_match(
            '/\b(?:goodbye|bye-bye|have a (?:good|great|lovely|wonderful) '
            . '(?:day|evening|weekend)|speak (?:to you )?soon)\b/i',
            $reply
        ) === 1;
    }

    private static function verifyTwilio(): bool
    {
        $authToken = Settings::get('twilio_auth_token');
        $signature = $_SERVER['HTTP_X_TWILIO_SIGNATURE'] ?? '';
        if (!$authToken || $signature === '') return false;
        $scheme = ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') ? 'https' : 'http';
        $url = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? '') . ($_SERVER['REQUEST_URI'] ?? '');
        $params = $_POST;
        ksort($params);
        $data = $url;
        foreach ($params as $key => $value) $data .= $key . $value;
        return hash_equals($signature, base64_encode(hash_hmac('sha1', $data, (string) $authToken, true)));
    }

    private static function twimlGather(string $message): void
    {
        if (self::conversationRelayReady()) {
            self::twimlConversationRelay($message);
            return;
        }
        header('Content-Type: text/xml; charset=utf-8');
        $action = '/api/v1/voice/twilio/turn';
        $voice = self::twilioVoice();
        echo '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="'
            . htmlspecialchars($voice, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '" language="en-GB">'
            . htmlspecialchars($message, ENT_XML1 | ENT_QUOTES, 'UTF-8')
            . '</Say><Gather input="speech" action="' . $action
            . '" method="POST" timeout="10" speechTimeout="auto" language="en-GB"></Gather><Say voice="'
            . htmlspecialchars($voice, ENT_XML1 | ENT_QUOTES, 'UTF-8')
            . '" language="en-GB">I did not hear a response. Goodbye.</Say></Response>';
    }

    private static function twimlConversationRelay(string $welcomeGreeting): void
    {
        header('Content-Type: text/xml; charset=utf-8');
        $url = trim((string) Settings::get('twilio_conversation_relay_url'));
        $voice = trim((string) Settings::get('twilio_conversation_relay_voice'));
        if ($voice === '') {
            $voice = 'Xb7hH8MSUJpSbSDYk0k2';
        }
        $xml = static fn (string $value): string =>
            htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
        echo '<?xml version="1.0" encoding="UTF-8"?><Response><Connect>'
            . '<ConversationRelay url="' . $xml($url) . '"'
            . ' welcomeGreeting="' . $xml($welcomeGreeting) . '"'
            . ' welcomeGreetingInterruptible="speech" language="en-GB"'
            . ' ttsProvider="ElevenLabs" voice="' . $xml($voice) . '"'
            . ' transcriptionProvider="Deepgram" speechModel="nova-3-general"'
            . ' interruptible="speech" interruptSensitivity="medium"'
            . ' reportInputDuringAgentSpeech="speech" ignoreBackchannel="true"'
            . ' speechTimeout="900" elevenlabsTextNormalization="on"'
            . ' events="speaker-events tokens-played" />'
            . '</Connect></Response>';
    }

    private static function conversationRelayReady(): bool
    {
        if (Settings::get('twilio_conversation_relay_enabled') !== '1') {
            return false;
        }
        $url = trim((string) Settings::get('twilio_conversation_relay_url'));
        $secret = trim((string) Settings::get('twilio_conversation_relay_secret'));
        return $secret !== '' && filter_var($url, FILTER_VALIDATE_URL) !== false
            && str_starts_with(strtolower($url), 'wss://');
    }

    private static function twimlSay(string $message): void
    {
        header('Content-Type: text/xml; charset=utf-8');
        echo '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="'
            . htmlspecialchars(self::twilioVoice(), ENT_XML1 | ENT_QUOTES, 'UTF-8')
            . '" language="en-GB">'
            . htmlspecialchars($message, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</Say></Response>';
    }

    private static function twilioVoice(): string
    {
        $voice = trim((string) Settings::get('twilio_voice_tts_voice'));
        $allowed = ['Polly.Amy-Generative', 'Polly.Emma', 'Polly.Amy', 'Polly.Brian', 'woman', 'man'];
        return in_array($voice, $allowed, true) ? $voice : 'Polly.Emma';
    }
}
