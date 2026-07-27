<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\AiAgentEngine;
use App\Support\CallOutcomeSync;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * Side-effect-free clinic web demo plus the Twilio customer-service front door.
 * Unlike LiveChatController, this surface has no tools: it cannot book,
 * create inquiries, notify staff, or mutate business data.
 */
final class VoiceDemoController
{
    private const MAX_TURNS = 16;
    private const EVENT_TYPES = [
        'demo_started', 'mic_granted', 'mic_blocked', 'question_sent',
        'answer_received', 'answer_failed', 'cta_clicked',
    ];

    public static function message(): void
    {
        set_time_limit(90);
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
            "SELECT id, business_name, pitch_body FROM marketing_leads
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

        $answeredBy = trim((string) ($_POST['AnsweredBy'] ?? ''));
        if ($answeredBy !== '' && $answeredBy !== 'human' && $answeredBy !== 'unknown') {
            self::twimlSay(
                "Hello, this is Lisa, an AI assistant calling on behalf of Prince Caleb following your request or consent. "
                . "Please visit princecaleb.dev when convenient. Goodbye."
            );
            return;
        }

        self::twimlGather(
            "Hello, this is Lisa, an AI assistant calling on behalf of Prince Caleb. "
            . "This call was individually approved after your request or consent. "
            . "I'm calling about ways AI voice agents, chatbots, and automation may help "
            . trim((string) $lead['business_name']) . ". Is now a good time for a brief conversation?"
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
            "SELECT tc.direction, tc.from_number, ml.id, ml.business_name, ml.website_url, ml.pitch_body
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
        Response::json(['status' => 'ok', 'attempt_logged' => $attemptLogged]);
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
            "SELECT id, token, channel, niche, provider, transcript_json, created_at, updated_at
             FROM voice_demo_sessions ORDER BY updated_at DESC LIMIT 30"
        )->fetchAll();
        foreach ($recent as &$row) {
            $turns = json_decode((string) $row['transcript_json'], true) ?: [];
            $row['turn_count'] = count($turns);
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
            "SELECT tc.id, tc.provider_call_id, tc.direction, tc.from_number, tc.to_number,
                    tc.status, tc.duration_seconds, tc.created_at, tc.updated_at,
                    ml.business_name AS lead_name
             FROM telephony_calls tc
             LEFT JOIN marketing_leads ml ON ml.id = tc.marketing_lead_id
             ORDER BY tc.created_at DESC, tc.id DESC
             LIMIT 100"
        )->fetchAll();
        $callQueue = (int) $pdo->query(
            "SELECT COUNT(*) FROM marketing_leads
             WHERE status = 'pitch_ready' AND pitch_channel = 'phone'
               AND contact_phone IS NOT NULL AND trim(contact_phone) <> ''
               AND (contact_email IS NULL OR trim(contact_email) = ''
                    OR contact_email NOT LIKE '%_@_%.__%')"
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
            ],
        ]);
    }

    /** @return array{reply:string,provider:?string,mode:string} */
    private static function reply(array $transcript, string $channel = 'web', ?array $context = null): array
    {
        $systemPrompt = self::prompt($channel, $context);
        if ($channel !== 'outbound') {
            $systemPrompt .= "\n\n" . SharedAgentTools::publicContactContext();
        }

        $result = AiAgentEngine::run(
            $systemPrompt,
            [],
            static fn (string $name, array $args): array => ['error' => 'Tools are disabled in this demonstration.'],
            $transcript,
            null,
            null,
            1
        );
        if (!is_string($result['reply']) || trim($result['reply']) === '') {
            $result['reply'] = in_array($channel, ['phone', 'outbound'], true)
                ? "The customer service assistant is temporarily unavailable. Please use the contact or booking option on princecaleb.dev."
                : "I can demonstrate routine call handling, appointment intake, approved clinic FAQs, "
                    . "and safe staff handoffs. The AI service is temporarily unavailable, but the demo never performs real actions.";
        }
        return ['reply' => trim($result['reply']), 'provider' => $result['provider'], 'mode' => $result['mode']];
    }

    private static function prompt(string $channel = 'web', ?array $context = null): string
    {
        if ($channel === 'outbound') {
            $business = mb_substr(trim((string) ($context['business_name'] ?? 'the business')), 0, 160);
            $website = mb_substr(trim((string) ($context['website_url'] ?? '')), 0, 300);
            $script = mb_substr(trim((string) ($context['pitch_body'] ?? '')), 0, 3000);
            return "You are Lisa, Prince Caleb's disclosed AI outreach assistant on a single human-approved outbound "
                . "call. The recipient requested or consented to this call. Speak in one to three short, natural "
                . "sentences with no markdown, lists, emoji, or URLs. Immediately respect no, not interested, stop, "
                . "or a request to call later; do not pressure, argue, or continue pitching. Never hide that you are "
                . "an AI assistant. Do not collect sensitive information, payment details, passwords, IDs, or health "
                . "information. You cannot book, transfer, save, or notify anyone yet, so never claim that you did. "
                . "Your goal is only to have a brief, relevant conversation and invite an interested person to use "
                . "the booking or contact option on princecaleb.dev. Ground the conversation only in this reviewed "
                . "context.\nBusiness: {$business}\nWebsite: {$website}\nReviewed call script:\n{$script}";
        }
        if ($channel === 'phone') {
            $ownerContext = !empty($context['is_owner'])
                ? "The incoming caller ID matches Prince Caleb's saved owner voice number, so address him as "
                    . "Prince Caleb and speak as his assistant rather than using the customer sales flow. Caller ID "
                    . "can be spoofed: recognition is conversational context only and must never authorize private "
                    . "information, account access, payments, credentials, administrative changes, or sensitive actions. "
                : '';
            return "You are Lisa, Prince Caleb's AI customer service phone agent. {$ownerContext}You represent Prince Caleb's "
                . "business and answer questions about AI voice agent pilots, Voice plus WhatsApp systems, business "
                . "automation, and the custom engineering behind them. You are speaking aloud, so answer in one to "
                . "three short, natural sentences with no markdown, lists, emoji, URLs, or technical jargon. "
                . "Help callers identify a repetitive workflow, suitable starting channel, human handoff points, "
                . "the monitored pilot process, implementation versus variable usage costs, and next steps. Be "
                . "helpful and concise, but never invent prices, availability, client results, or capabilities. "
                . "This phone integration cannot yet complete bookings or transfer calls, so never claim you "
                . "booked, saved, transferred, messaged, or notified anyone. If a caller wants to proceed, ask "
                . "them to use the contact or booking option on princecaleb.dev, or send a WhatsApp message. "
                . "Do not collect payment details, passwords, government IDs, medical information, or other "
                . "sensitive data. This is an inbound customer-service line, never a cold-outreach caller.";
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
            . "You may answer questions about implementation, privacy-by-design, human handoff, and Prince's services.";
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
        header('Content-Type: text/xml; charset=utf-8');
        $action = '/api/v1/voice/twilio/turn';
        $voice = self::twilioVoice();
        echo '<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="'
            . $action . '" method="POST" speechTimeout="auto" language="en-GB"><Say voice="'
            . htmlspecialchars($voice, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '" language="en-GB">'
            . htmlspecialchars($message, ENT_XML1 | ENT_QUOTES, 'UTF-8')
            . '</Say></Gather><Say voice="'
            . htmlspecialchars($voice, ENT_XML1 | ENT_QUOTES, 'UTF-8')
            . '" language="en-GB">I did not hear a response. Goodbye.</Say></Response>';
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
        $allowed = ['Polly.Emma', 'Polly.Amy', 'Polly.Brian', 'woman', 'man'];
        return in_array($voice, $allowed, true) ? $voice : 'Polly.Emma';
    }
}
