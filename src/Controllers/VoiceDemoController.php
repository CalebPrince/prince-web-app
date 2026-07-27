<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\AiAgentEngine;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;

/**
 * Side-effect-free clinic voice demo plus the Twilio Voice front door.
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
        $pdo->prepare(
            "INSERT OR IGNORE INTO telephony_calls
             (provider_call_id, session_id, provider, from_number, to_number, status)
             VALUES (?, ?, 'twilio', ?, ?, 'in-progress')"
        )->execute([$callSid, $session['id'], $from ?: null, trim((string) ($_POST['To'] ?? '')) ?: null]);
        self::twimlGather(
            "Hello, this is the clinic voice agent demonstration by Prince Caleb. "
            . "Ask me how I can help a clinic handle calls, appointments, or routine questions."
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
        $transcript = json_decode((string) $session['transcript_json'], true) ?: [];
        if (count($transcript) >= self::MAX_TURNS) {
            self::twimlSay("Thanks for trying the demonstration. The demo call limit has been reached. Goodbye.");
            return;
        }
        $transcript[] = ['role' => 'user', 'text' => mb_substr($speech, 0, 500)];
        $result = self::reply($transcript);
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
        $pdo->prepare(
            'UPDATE telephony_calls SET status = ?, duration_seconds = ?, updated_at = datetime(\'now\') WHERE provider_call_id = ?'
        )->execute([
            mb_substr(trim((string) ($_POST['CallStatus'] ?? 'unknown')), 0, 40),
            max(0, (int) ($_POST['CallDuration'] ?? 0)),
            trim((string) ($_POST['CallSid'] ?? '')),
        ]);
        Response::json(['status' => 'ok']);
    }

    public static function adminStats(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
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
        Response::json([
            'summary' => $summary,
            'events' => $events,
            'recent' => $recent,
            'telephony_enabled' => Settings::get('twilio_voice_enabled') === '1',
            'voice_number' => Settings::get('twilio_voice_number') ?: null,
            'webhook_url' => 'https://princecaleb.dev/api/v1/voice/twilio/incoming',
        ]);
    }

    /** @return array{reply:string,provider:?string,mode:string} */
    private static function reply(array $transcript): array
    {
        $result = AiAgentEngine::run(
            self::prompt(),
            [],
            static fn (string $name, array $args): array => ['error' => 'Tools are disabled in this demonstration.'],
            $transcript,
            null,
            null,
            1
        );
        if (!is_string($result['reply']) || trim($result['reply']) === '') {
            $result['reply'] = "I can demonstrate routine call handling, appointment intake, approved clinic FAQs, "
                . "and safe staff handoffs. The AI service is temporarily unavailable, but the demo never performs real actions.";
        }
        return ['reply' => trim($result['reply']), 'provider' => $result['provider'], 'mode' => $result['mode']];
    }

    private static function prompt(): string
    {
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
        echo '<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="'
            . $action . '" method="POST" speechTimeout="auto" language="en-GB"><Say voice="Polly.Amy">'
            . htmlspecialchars($message, ENT_XML1 | ENT_QUOTES, 'UTF-8')
            . '</Say></Gather><Say voice="Polly.Amy">I did not hear a response. Goodbye.</Say></Response>';
    }

    private static function twimlSay(string $message): void
    {
        header('Content-Type: text/xml; charset=utf-8');
        echo '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy">'
            . htmlspecialchars($message, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</Say></Response>';
    }
}
