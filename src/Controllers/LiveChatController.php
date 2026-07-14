<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\AiText;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;

/**
 * Live Chat: a requirements-gathering conversation. The AI cannot build or
 * offer a prototype itself — visitors asking for one are redirected to a
 * normal inquiry so Caleb follows up and puts it together personally. Leads
 * flow into the inquiries inbox (and its Slack webhook queue) plus a
 * dedicated chat_sessions record the admin panel lists under "Chat Leads".
 *
 * The conversation falls back across Gemini, OpenRouter, and Groq (whichever
 * keys are configured in Admin -> Settings); without any of the three, the
 * chat still works via keyword/booking-intent fallback, minus AI-driven tool
 * calls.
 */
class LiveChatController
{
    private const MAX_TRANSCRIPT_MESSAGES = 40;

    /** GET /api/v1/chat/status — availability plus the editable widget copy */
    public static function status(): void
    {
        Response::json([
            'online' => (!empty(Settings::get('gemini_api_key')) || !empty(Settings::get('openrouter_api_key'))
                || !empty(Settings::get('groq_api_key')))
                && self::isWithinScheduledHours(),
            'greeting' => Settings::get('chat_greeting')
                ?? 'Hi there! 👋 Welcome to our development hub. We build high-performance web and mobile applications designed to scale.',
            'intro' => Settings::get('chat_intro')
                ?? "Pick an option below, or describe the website or app you have in mind and I'll help however I can.",
            'offline_message' => Settings::get('chat_offline_message')
                ?? "We're offline at the moment, but your message won't be missed — leave your name, email and a few words below and Prince will get back to you shortly.",
            // The assistant's display name / persona. Drives the widget header,
            // its accessibility labels, and (server-side) how the bot introduces
            // itself. Editable from Admin → Site Content; defaults to Lisa.
            'assistant_name' => Settings::get('chat_assistant_name') ?: 'Lisa',
            // Read-aloud voice for the assistant's replies. The browser supplies the
            // actual voices (Web Speech API), so these are preferences the
            // widget matches against whatever the visitor's device offers:
            // gender (female/male/auto), accent (en-GB/en-US/auto), and the
            // delivery — rate (speed) and pitch.
            'voice' => [
                'gender' => Settings::get('chat_voice_gender') ?: 'female',
                'accent' => Settings::get('chat_voice_accent') ?: 'en-GB',
                'rate' => (float) (Settings::get('chat_voice_rate') ?: 1),
                'pitch' => (float) (Settings::get('chat_voice_pitch') ?: 1),
            ],
        ]);
    }

    /** POST /api/v1/chat/message — body: {token?, message} */
    public static function message(): void
    {
        // Worst case is a full Gemini failure (2 rounds x 12s), then a full
        // OpenRouter failure (2 rounds x 30s), then a full Groq attempt
        // (2 rounds x 20s) = ~124s of curl time alone. Without this, the
        // host's default max_execution_time (often 30s on shared hosting)
        // kills the process mid-request with no response at all, which the
        // browser surfaces as a bare "Failed to fetch" rather than a clean
        // error.
        set_time_limit(135);

        $config = self::config();
        RateLimitMiddleware::enforce('ai_chat', $config['ai_rate_limit']);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim((string) ($data['message'] ?? ''));
        if ($message === '' || mb_strlen($message) > 1000) {
            Response::error('A message under 1000 characters is required.', 422);
        }

        $pdo = Database::get();
        $session = self::findOrCreateSession($pdo, $data['token'] ?? null);
        $transcript = json_decode($session['transcript_json'], true) ?: [];

        if (count($transcript) >= self::MAX_TRANSCRIPT_MESSAGES) {
            Response::error('This conversation is quite long — please use the contact form to continue.', 422);
        }

        $transcript[] = ['role' => 'user', 'text' => $message];

        $projects = self::projectCatalog($pdo);
        $reply = null;
        $mode = 'fallback';
        $provider = null; // debug aid: which path actually served this reply — 'gemini', 'openrouter', 'groq', or null (keyword fallback)
        $justBecameReady = false;
        $geminiKey = Settings::get('gemini_api_key');

        if (!empty($geminiKey)) {
            $result = self::chatWithGemini($geminiKey, $transcript, $projects, $pdo);
            if ($result !== null) {
                $justBecameReady = $justBecameReady || $result['ready'];
                if ($result['reply'] !== null) {
                    $reply = $result['reply'];
                    $mode = 'ai';
                    $provider = 'gemini';
                }
            }
        }

        // Gemini failed outright, or produced no usable reply text — retry
        // the whole turn against OpenRouter before falling back to keyword
        // matching. This is a fresh, independent turn on the other
        // provider, not a mid-conversation handoff (see chatWithOpenRouter).
        if ($reply === null) {
            $openRouterKey = Settings::get('openrouter_api_key');
            if (!empty($openRouterKey)) {
                $result = self::chatWithOpenRouter($openRouterKey, $transcript, $projects, $pdo);
                if ($result !== null) {
                    $justBecameReady = $justBecameReady || $result['ready'];
                    if ($result['reply'] !== null) {
                        $reply = $result['reply'];
                        $mode = 'ai';
                        $provider = 'openrouter';
                    }
                }
            }
        }

        // Gemini and OpenRouter both failed (or neither is configured) —
        // last AI attempt before keyword fallback. Groq has its own
        // independent quota/billing, so it's the one leg still standing
        // when the other two are both out of credit at once.
        if ($reply === null) {
            $groqKey = Settings::get('groq_api_key');
            if (!empty($groqKey)) {
                $result = self::chatWithGroq($groqKey, $transcript, $projects, $pdo);
                if ($result !== null) {
                    $justBecameReady = $justBecameReady || $result['ready'];
                    if ($result['reply'] !== null) {
                        $reply = $result['reply'];
                        $mode = 'ai';
                        $provider = 'groq';
                    }
                }
            }
        }

        if ($reply === null) {
            // A visitor mid-conversation degrading to canned keyword replies is easy to
            // miss (it still looks like a normal reply) — the individual provider
            // error_log calls above explain *why* each one failed, but nothing said
            // "and so this turn had no real AI at all" until now. Only worth logging
            // when a provider was actually configured and attempted (dev environments
            // with no keys at all fall back on every turn by design).
            if (!empty($geminiKey) || !empty(Settings::get('openrouter_api_key')) || !empty(Settings::get('groq_api_key'))) {
                error_log(sprintf(
                    'Live Chat: all configured AI providers failed this turn — degraded to keyword/booking fallback. message="%s"',
                    substr($message, 0, 200)
                ));
            }
            $bookingReply = self::bookingFallback($message, $transcript);
            $reply = $bookingReply ?? self::keywordFallback($message, $projects);
        }

        $transcript[] = ['role' => 'assistant', 'text' => $reply];
        $readyForPrototype = (bool) $session['ready_for_prototype'] || $justBecameReady;
        self::saveTranscript($pdo, (int) $session['id'], $transcript, $readyForPrototype);

        Response::json([
            'token' => $session['token'],
            'reply' => $reply,
            'mode' => $mode,
            // Temporary debug aid for verifying the Gemini->OpenRouter->Groq
            // fallback actually triggers in production — 'gemini',
            // 'openrouter', 'groq', or null (keyword fallback served this
            // reply). Safe to remove later; not relied on by any UI logic.
            'provider' => $provider,
            // AI-driven prototype building is disabled — the model has no tool
            // to set ready_for_prototype anymore, so this (and the "Build my
            // prototype" button it used to gate) stays permanently false.
            // Visitors asking for a prototype are redirected to Caleb instead
            // (see the system prompt).
            'can_prototype' => $readyForPrototype,
        ]);
    }

    /** GET /api/v1/chat/session/{token} — rehydrates a session for the prototype generator page */
    public static function session(array $params): void
    {
        $pdo = Database::get();
        $session = self::requireSession($pdo, (string) ($params['token'] ?? ''));
        $transcript = json_decode($session['transcript_json'], true) ?: [];
        $hasPrototype = !empty($session['prototype_html']);

        Response::json([
            'token' => $session['token'],
            'transcript' => $transcript,
            'can_build' => (bool) $session['ready_for_prototype'],
            'has_prototype' => $hasPrototype,
            'prototype_status' => $session['prototype_status'],
            'prototype_url' => $hasPrototype ? '/api/v1/chat/prototype/' . $session['token'] : null,
        ]);
    }

    /**
     * POST /api/v1/chat/prototype — body: {description, token?}. One-shot: describe what you want
     * built and get a concept prototype back immediately, no live chat needed first (chat.html is a
     * standalone generator page). Pass the token back to add a follow-up description to the same
     * thread — each one becomes a new turn and the prototype regenerates with the full context —
     * instead of starting a fresh lead every time.
     */
    public static function generatePrototype(): void
    {
        // AiText::generate tries Gemini (45s), then OpenRouter (45s), then
        // Groq (45s) — up to 135s of curl time in the worst case. Same
        // reasoning as message().
        set_time_limit(145);

        $config = self::config();
        RateLimitMiddleware::enforce('prototype', 5);

        if (empty(Settings::get('gemini_api_key')) && empty(Settings::get('openrouter_api_key')) && empty(Settings::get('groq_api_key'))) {
            Response::error('Prototype generation is not available right now — please use the contact form.', 503);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $description = trim((string) ($data['description'] ?? ''));
        // Higher than a typical chat message cap (see message()'s 1000) because
        // the generator page lets visitors attach a text/code file, whose
        // contents get pasted straight into this field.
        if (mb_strlen($description) < 15 || mb_strlen($description) > 8000) {
            Response::error('Describe what you want in a bit more detail (15–8000 characters).', 422);
        }

        $pdo = Database::get();
        $session = self::findOrCreateSession($pdo, $data['token'] ?? null);
        $transcript = json_decode($session['transcript_json'], true) ?: [];
        if (count($transcript) >= self::MAX_TRANSCRIPT_MESSAGES) {
            Response::error('This thread has gone on a while — please start a new one.', 422);
        }
        $transcript[] = ['role' => 'user', 'text' => $description];

        $html = self::prototypeWithGemini($transcript);
        if ($html === null) {
            Response::error('Prototype generation failed — please try again in a moment.', 502);
        }

        $pdo->prepare(
            "UPDATE chat_sessions SET transcript_json = ?, ready_for_prototype = 1, prototype_html = ?,
             prototype_status = 'generated', updated_at = datetime('now') WHERE id = ?"
        )->execute([json_encode($transcript), $html, $session['id']]);

        Response::json(['token' => $session['token'], 'url' => '/api/v1/chat/prototype/' . $session['token']]);
    }

    /** GET /api/v1/chat/prototype/{token} — serves the prototype for the iframe */
    public static function viewPrototype(array $params): void
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT prototype_html FROM chat_sessions WHERE token = ?');
        $stmt->execute([$params['token']]);
        $row = $stmt->fetch();

        if (!$row || empty($row['prototype_html'])) {
            Response::error('Prototype not found', 404);
        }

        // AI-generated markup: scripts are stripped at generation time, and this
        // CSP makes the page inert even if something slipped through.
        header('Content-Type: text/html; charset=utf-8');
        header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: https:;");
        echo $row['prototype_html'];
        exit;
    }

    /** POST /api/v1/chat/feedback — body: {token, decision, comment?, name, email} */
    public static function feedback(): void
    {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $decision = $data['decision'] ?? '';
        if (!in_array($decision, ['approved', 'changes_requested'], true)) {
            Response::error('Decision must be approved or changes_requested.', 422);
        }

        $name = trim((string) ($data['name'] ?? ''));
        $email = trim((string) ($data['email'] ?? ''));
        $comment = trim((string) ($data['comment'] ?? ''));
        if ($name === '' || mb_strlen($name) > 255) {
            Response::error('Your name is required.', 422);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('A valid email address is required.', 422);
        }
        if (mb_strlen($comment) > 2000) {
            Response::error('Comment must be under 2000 characters.', 422);
        }

        $pdo = Database::get();
        $session = self::requireSession($pdo, (string) ($data['token'] ?? ''));
        if ($session['prototype_status'] === 'none') {
            Response::error('No prototype to review yet.', 422);
        }

        $pdo->prepare(
            "UPDATE chat_sessions SET prototype_status = ?, client_comment = ?, client_name = ?,
             client_email = ?, admin_seen = 0, updated_at = datetime('now') WHERE id = ?"
        )->execute([$decision, $comment ?: null, $name, $email, $session['id']]);

        // Surface it in the regular inquiries pipeline too (inbox + Slack webhook).
        $label = $decision === 'approved' ? 'APPROVED the prototype' : 'requested changes to the prototype';
        $summary = "[Live Chat] $name $label." . ($comment !== '' ? "\n\nComment: $comment" : '')
            . "\n\nFull transcript and prototype are in Admin → Chat Leads.";
        self::recordInquiry($pdo, $name, $email, $summary);

        Response::json(['status' => 'received']);
    }

    /** POST /api/v1/chat/inquiry — body: {token?, name, email, phone?, message}
     *  For visitors who want something other than a prototype (maintenance,
     *  consulting, a question) — captures their details right in the chat. */
    public static function inquiry(): void
    {
        $config = self::config();
        RateLimitMiddleware::enforce('contact', $config['contact_rate_limit']);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $name = trim((string) ($data['name'] ?? ''));
        $email = trim((string) ($data['email'] ?? ''));
        $phone = trim((string) ($data['phone'] ?? ''));
        $message = trim((string) ($data['message'] ?? ''));

        if ($name === '' || mb_strlen($name) > 255) {
            Response::error('Your name is required.', 422);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('A valid email address is required.', 422);
        }
        if ($phone !== '' && mb_strlen($phone) > 30) {
            Response::error('Phone number is too long.', 422);
        }
        if ($message === '' || mb_strlen($message) > 5000) {
            Response::error('A message under 5000 characters is required.', 422);
        }

        $pdo = Database::get();
        $session = self::findOrCreateSession($pdo, $data['token'] ?? null);
        $pdo->prepare(
            "UPDATE chat_sessions SET client_name = ?, client_email = ?, client_phone = ?, client_comment = ?,
             admin_seen = 0, updated_at = datetime('now') WHERE id = ?"
        )->execute([$name, $email, $phone ?: null, $message, $session['id']]);

        self::recordInquiry($pdo, $name, $email, "[Live Chat]" . ($phone !== '' ? " Phone: $phone\n\n" : ' ') . $message);

        Response::json(['status' => 'received'], 201);
    }

    /** GET /api/v1/admin/chats — admin-only list of chat leads */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            "SELECT id, token, transcript_json, prototype_status, client_comment, client_name,
                    client_email, client_phone, admin_seen, created_at, updated_at,
                    CASE WHEN prototype_html IS NULL THEN 0 ELSE 1 END AS has_prototype
             FROM chat_sessions
             WHERE transcript_json != '[]' OR client_email IS NOT NULL
             ORDER BY updated_at DESC"
        )->fetchAll();

        foreach ($rows as &$row) {
            $row['transcript'] = json_decode($row['transcript_json'], true) ?: [];
            unset($row['transcript_json']);
        }
        Response::json($rows);
    }

    /**
     * GET /api/v1/admin/chats/stats — lead-gen analytics over chat_sessions.
     * Turns the transcripts you already store into a funnel: who engaged, how
     * many became contactable leads, and how far they got toward a prototype.
     */
    public static function chatStats(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $row = $pdo->query(
            "SELECT
                COUNT(*) AS total_sessions,
                COALESCE(SUM(CASE WHEN transcript_json != '[]' THEN 1 ELSE 0 END), 0) AS engaged,
                COALESCE(SUM(CASE WHEN client_email IS NOT NULL THEN 1 ELSE 0 END), 0) AS leads,
                COALESCE(SUM(CASE WHEN ready_for_prototype = 1 THEN 1 ELSE 0 END), 0) AS reached_prototype_ready,
                COALESCE(SUM(CASE WHEN prototype_status = 'generated' THEN 1 ELSE 0 END), 0) AS prototypes_built,
                COALESCE(SUM(CASE WHEN prototype_status = 'approved' THEN 1 ELSE 0 END), 0) AS prototypes_approved,
                COALESCE(SUM(CASE WHEN prototype_status = 'changes_requested' THEN 1 ELSE 0 END), 0) AS prototypes_changes,
                COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) AS last_7_days
             FROM chat_sessions"
        )->fetch();

        $engaged = (int) $row['engaged'];
        $leads = (int) $row['leads'];

        Response::json([
            'total_sessions' => (int) $row['total_sessions'],
            'engaged' => $engaged,
            'leads' => $leads,
            // Contactable-lead rate among visitors who actually said something.
            'lead_conversion_pct' => $engaged > 0 ? round($leads / $engaged * 100, 1) : 0.0,
            'reached_prototype_ready' => (int) $row['reached_prototype_ready'],
            'prototypes_built' => (int) $row['prototypes_built'],
            'prototypes_approved' => (int) $row['prototypes_approved'],
            'prototypes_changes' => (int) $row['prototypes_changes'],
            'last_7_days' => (int) $row['last_7_days'],
        ]);
    }

    /** GET /api/v1/admin/ai-test — admin-only Gemini connectivity diagnostic */
    public static function aiTest(): void
    {
        AuthMiddleware::requireAuth();

        $geminiKey = Settings::get('gemini_api_key');
        if (empty($geminiKey)) {
            Response::json([
                'key_loaded' => false,
                'hint' => 'No Gemini key found — paste it in Settings → Integrations (or set GEMINI_API_KEY in .env).',
            ]);
        }
        if (!function_exists('curl_init')) {
            Response::json([
                'key_loaded' => true,
                'curl_available' => false,
                'hint' => 'The PHP curl extension is not enabled on this host — enable it in Select PHP Version.',
            ]);
        }

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key='
            . $geminiKey;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode(['contents' => [['parts' => [['text' => 'Say "pong".']]]]]),
            CURLOPT_TIMEOUT => 15,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        Response::json([
            'key_loaded' => true,
            'http_status' => $status,
            'curl_error' => $curlError !== '' ? $curlError : null,
            'response_snippet' => is_string($response) ? substr($response, 0, 500) : null,
        ]);
    }

    /** PATCH /api/v1/admin/chats/{id} — body: {"admin_seen": true} */
    public static function markSeen(array $params): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $pdo->prepare("UPDATE chat_sessions SET admin_seen = 1 WHERE id = ?")
            ->execute([(int) $params['id']]);
        Response::json(['status' => 'updated']);
    }

    // ---- internals ----------------------------------------------------------

    /** True when Live Chat should be considered online right now, per Admin → Settings hours. */
    private static function isWithinScheduledHours(): bool
    {
        if (empty(Settings::get('chat_hours_enabled'))) {
            return true; // no schedule configured — always online whenever the Gemini key is present
        }

        $tz = Settings::get('chat_timezone') ?: 'Africa/Accra';
        try {
            $now = new \DateTime('now', new \DateTimeZone($tz));
        } catch (\Exception $e) {
            $now = new \DateTime('now', new \DateTimeZone('UTC'));
        }

        $days = array_filter(array_map('trim', explode(',', strtolower((string) Settings::get('chat_hours_days')))));
        if (!in_array(strtolower($now->format('D')), $days, true)) {
            return false;
        }

        $start = Settings::get('chat_hours_start') ?: '00:00';
        $end = Settings::get('chat_hours_end') ?: '23:59';
        $current = $now->format('H:i');

        return $current >= $start && $current <= $end;
    }

    private static function config(): array
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        return appConfig();
    }

    private static function findOrCreateSession(\PDO $pdo, ?string $token): array
    {
        if ($token) {
            $stmt = $pdo->prepare('SELECT * FROM chat_sessions WHERE token = ?');
            $stmt->execute([$token]);
            $session = $stmt->fetch();
            if ($session) {
                return $session;
            }
        }
        $token = bin2hex(random_bytes(16));
        $pdo->prepare('INSERT INTO chat_sessions (token) VALUES (?)')->execute([$token]);
        return [
            'id' => (int) $pdo->lastInsertId(), 'token' => $token, 'transcript_json' => '[]',
            'prototype_status' => 'none', 'ready_for_prototype' => 0,
        ];
    }

    private static function requireSession(\PDO $pdo, string $token): array
    {
        if ($token === '') {
            Response::error('Missing chat session token.', 422);
        }
        $stmt = $pdo->prepare('SELECT * FROM chat_sessions WHERE token = ?');
        $stmt->execute([$token]);
        $session = $stmt->fetch();
        if (!$session) {
            Response::error('Chat session not found.', 404);
        }
        return $session;
    }

    private static function saveTranscript(\PDO $pdo, int $sessionId, array $transcript, ?bool $readyForPrototype = null): void
    {
        if ($readyForPrototype === null) {
            $pdo->prepare("UPDATE chat_sessions SET transcript_json = ?, updated_at = datetime('now') WHERE id = ?")
                ->execute([json_encode($transcript), $sessionId]);
            return;
        }
        $pdo->prepare(
            "UPDATE chat_sessions SET transcript_json = ?, ready_for_prototype = ?, updated_at = datetime('now') WHERE id = ?"
        )->execute([json_encode($transcript), $readyForPrototype ? 1 : 0, $sessionId]);
    }

    /** Records an inquiry and queues it for Slack/email notification — shared by feedback(), inquiry(), and the log_inquiry tool. */
    private static function recordInquiry(\PDO $pdo, string $name, string $email, string $message): void
    {
        $stmt = $pdo->prepare(
            'INSERT INTO inquiries (name, email, message, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $name,
            $email,
            $message,
            $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            $_SERVER['HTTP_USER_AGENT'] ?? null,
        ]);
        $pdo->prepare('INSERT INTO webhook_queue (inquiry_id) VALUES (?)')->execute([(int) $pdo->lastInsertId()]);
    }

    private static function projectCatalog(\PDO $pdo): array
    {
        return $pdo->query(
            "SELECT p.title, p.slug, p.summary, GROUP_CONCAT(t.name, ', ') AS tag_names
             FROM projects p
             LEFT JOIN project_tags pt ON pt.project_id = p.id
             LEFT JOIN tags t ON t.id = pt.tag_id
             WHERE p.is_published = 1
             GROUP BY p.id"
        )->fetchAll();
    }

    /**
     * Max Gemini <-> tool round-trips per visitor message. Each round is a full
     * sequential model call, so this directly caps worst-case reply latency —
     * kept low (2 rounds x 12s = 24s worst case) so the chat can't hang the
     * visitor for a minute-plus waiting on a chain of tool calls.
     */
    private const MAX_TOOL_ROUNDS = 2;
    private const GEMINI_CHAT_TIMEOUT_SECONDS = 12;
    // Free-tier OpenRouter models are often slower than Gemini — reusing
    // Gemini's 12s budget here was cutting the fallback off mid-response
    // (curl reports the 200 status from the headers it did receive, but
    // returns false because the body never finished downloading in time).
    // Confirmed live in production: even 18s wasn't enough (same "status=200
    // body=n/a" signature), so this needs real headroom for a free-tier model.
    private const OPENROUTER_CHAT_TIMEOUT_SECONDS = 30;
    // Groq's own infrastructure is fast, but this still needs headroom for
    // a cold key/model or a transient slowdown rather than assuming best case.
    private const GROQ_CHAT_TIMEOUT_SECONDS = 20;

    /** Shared by both providers, so Gemini and the OpenRouter fallback can never drift into inconsistent behavior. */
    private static function buildSystemPrompt(array $projects): string
    {
        $catalog = implode("\n", array_map(
            fn($p) => "- {$p['title']} ({$p['tag_names']}): {$p['summary']}",
            $projects
        ));

        // Persona is admin-configurable: the name comes from a setting (default
        // "Lisa"), and the presented gender is derived from the read-aloud voice
        // gender so a single choice keeps the spoken voice and the bot's own
        // self-description in agreement (a male voice → introduces itself as male).
        $name = Settings::get('chat_assistant_name') ?: 'Lisa';
        $voiceGender = Settings::get('chat_voice_gender') ?: 'female';
        $genderLine = '';
        if ($voiceGender === 'male') {
            $genderLine = "You present as male — if a visitor asks, you're comfortable saying you're a man and using he/him. ";
        } elseif ($voiceGender === 'female') {
            $genderLine = "You present as female — if a visitor asks, you're comfortable saying you're a woman and using she/her. ";
        }

        $system = "You are {$name}, the interactive AI assistant for Prince Caleb, a premium web and mobile app developer. Prince Caleb is "
            . "an expert solo web and mobile app developer who builds custom, high-performance applications "
            . "using clean, vanilla code (PHP, JavaScript, Python) — no bloated frameworks or templates; "
            . "every application is engineered from scratch for pure performance and longevity. Your goal is "
            . "to qualify leads, provide real upfront value, and drive bookings. "
            . "If a visitor asks your name, who you are, or what you are, say exactly: \"I'm {$name}, Prince "
            . "Caleb's virtual assistant.\" " . $genderLine . "Never say you're an AI model, and never mention Gemini, "
            . "OpenRouter, Groq, or any other underlying provider/technology, even if directly asked what you "
            . "run on.\n\n"
            . "Tone: professional, technically precise, and approachable — speak like a pragmatic senior "
            . "developer, not corporate fluff, robotic pleasantries, or AI clichés. Keep replies short (1-4 "
            . "sentences), never a bulleted interview, and ask one or two questions at a time rather than "
            . "dumping a form on someone. Translate technical findings into business impact rather than "
            . "jargon.\n\n"
            . "Lead capture comes first: your primary objective during a new project inquiry is to secure "
            . "the visitor's name, email, and phone number before anything else. People often leave halfway "
            . "through a chat; if you do not collect contact details first, Caleb has no way to follow up. "
            . "When a user states they want to build a project, start a website/app/platform, get a quote, "
            . "or speak to Caleb, you MUST immediately acknowledge the request enthusiastically, then explain "
            . "that to make sure their progress is not lost if the browser disconnects, you need their "
            . "contact info first. Ask for their name, email, and phone number before scoping. Until you "
            . "have collected at least one real contact detail (name, email, or phone number), do not provide "
            . "deep technical scoping, pricing ranges, or direct booking steps. Keep trying to collect the "
            . "missing contact details early in the conversation.\n\n"
            . "Guardrails: never promise a specific delivery date, and never commit to an exact final price. "
            . "You MAY share the public starting-price tiers (from get_site_info) and a realistic rough range "
            . "once you understand the scope — always framed as an estimate that Caleb confirms after "
            . "reviewing the architecture. Never commit Caleb to a project without his personal review. If "
            . "someone asks for a discount or tries to negotiate, say: \"I handle the initial onboarding, but "
            . "Caleb reviews all financial adjustments personally during the project scoping phase.\" You can "
            . "discuss technology choices and trade-offs confidently at a practical level, but for deep "
            . "architectural decisions say: \"That's a great technical question. I've noted it down in the "
            . "project brief for Caleb to address when he reaches out to you.\"\n\n"
            . "CODE EXAMPLES: if a visitor explicitly asks for a code example, a snippet, or to be shown how "
            . "something is done in code, you may share ONE short, focused snippet (aim for under ~15 lines) "
            . "wrapped in a fenced Markdown code block WITH its language tag — e.g. ```js\\n...\\n``` or "
            . "```php\\n...\\n```. Keep it illustrative rather than a full implementation, add a one-line "
            . "explanation, and then steer back to capturing their contact details so Caleb can review the "
            . "real build. Do not volunteer code unprompted, and never paste long files or secrets.\n\n"
            . "If the visitor just greets you (hi, hello, hey), reply with a warm one-sentence hello and ask "
            . "what brings them by — nothing else. Not every visitor wants to start a project — some just "
            . "have a general question about what Prince builds, his experience, tech stack, process, "
            . "turnaround, or location. Answer those directly using your tools, as normal conversation.\n\n"
            . "WORKFLOW — SITE AUDIT: if the visitor shares a URL to their existing site, immediately let "
            . "them know you're analyzing it, then call audit_website. Translate the raw results into clear "
            . "business impact — e.g. \"Your mobile viewport tag is missing, which means mobile visitors are "
            . "seeing a broken layout and search engines are penalizing your ranking.\" Lead with the two or "
            . "three findings that cost them the most, then pitch a clean, vanilla rebuild or refactor as the "
            . "definitive fix and ask if they'd like Caleb to review the site personally. If the tool returns "
            . "an error, say you couldn't reach the site and ask them to double-check the address — never "
            . "invent audit results.\n\n"
            . "Before PROJECT ESTIMATION begins, do not discuss ranges or detailed architecture yet if the "
            . "visitor has not shared any real contact detail. First say you're excited to help and ask for "
            . "their name, email, and phone number so the conversation can be saved if the browser disconnects.\n\n"
            . "WORKFLOW — PROJECT ESTIMATION: when someone wants a quote or pricing, gather the requirements "
            . "naturally — the core problem they're solving, platform type (web, mobile, both), critical "
            . "features and integrations, and their deadline. Do not interrogate; one or two questions at a "
            . "time. Once you have real context, call get_site_info for the current engineering tiers and "
            . "give a realistic rough range anchored to them, based on solo engineering hours. Then ask: "
            . "\"Would you like me to submit these specific requirements to Caleb's inbox so he can review "
            . "your architecture before you talk?\" If yes, gather any missing contact details and call "
            . "log_inquiry.\n\n"
            . "WORKFLOW — LIVE HANDOFF: if the visitor is clearly frustrated with the bot, asks for a human "
            . "repeatedly, or mentions a high-budget or enterprise-scale project, say: \"I'm signaling Caleb "
            . "right now to see if he's available to take over this terminal live. One second.\" and call "
            . "signal_handoff with a one-line reason and whatever contact details you have. After it "
            . "succeeds, tell them Caleb has been pinged with the conversation, and offer to lock in a call "
            . "via check_availability (or share the WhatsApp link the tool returns) so they have a guaranteed "
            . "channel either way.\n\n"
            . "NEW PROJECT contact-first rule: when the visitor says they want a website, app, custom platform, "
            . "quote, or wants Caleb to contact them, your first substantive reply must acknowledge the request "
            . "enthusiastically and ask for name, email, and phone number before asking detailed scope, pricing, "
            . "timeline, or booking questions.\n\n"
            . "For a NEW PROJECT inquiry (a website, app, or custom platform), gather — one or two questions "
            . "at a time — their name, email, and phone number (always ask for it; don't end the conversation "
            . "without trying), the project type, the core features it needs, and their target timeline and "
            . "budget range. For a DIRECT SERVICE request (an API integration, maintenance, a landing page, "
            . "fixing something specific), gather name, email, phone, their current tech stack, and a brief "
            . "description of the task or any error they're seeing. Either way, once you have enough to be "
            . "useful, call log_inquiry so Caleb is notified, then let them know he'll review it and reach "
            . "out — e.g. \"Got it. I have your phone number and email down. Caleb will review the task and "
            . "reach out shortly.\" Don't call log_inquiry for a greeting or a general question that doesn't "
            . "need follow-up.\n\n"
            . "You cannot build or show a prototype, design, mockup, or demo yourself — that capability is "
            . "disabled. If a visitor asks to see one (e.g. \"show me a design\", \"can I see a prototype\", "
            . "\"design a landing page for it\"), tell them plainly that Caleb personally puts prototypes "
            . "together himself, then treat it exactly like a NEW PROJECT inquiry: gather their name, email, "
            . "phone, and enough detail about what they want to see, and call log_inquiry so Caleb has it "
            . "directly. Never claim you're building, generating, or about to show them anything — the honest "
            . "answer is that Caleb will follow up personally. This is not a booking request either; only ask "
            . "about scheduling a call when the visitor actually asks to talk it through live or book a call.\n\n"
            . "You have tools available:\n"
            . "- get_site_info: for general questions about Prince's background, services, tech stack, "
            . "experience, location, contact/social links, and the public engineering tiers (starting "
            . "prices), so you answer with real facts instead of guessing.\n"
            . "- audit_website: run a live technical audit of a URL the visitor shared — load time, SSL, "
            . "mobile viewport, SEO basics, compression. Only for sites the visitor themselves brought up.\n"
            . "- signal_handoff: ping Caleb immediately with the conversation context when the live-handoff "
            . "workflow triggers. Use at most once per conversation.\n"
            . "- search_content: when something they describe reminds you of a past project or blog post "
            . "worth mentioning — share it naturally, with the link.\n"
            . "- log_inquiry: once you have enough details from a new-project or direct-service conversation "
            . "(see above) — this is what actually gets the details to Caleb.\n"
            . "- check_availability / book_appointment: use these when they want to talk it through live or "
            . "book a call. If they have not shared any real contact detail yet, first ask for their name, "
            . "email, and phone number so the booking context is not lost if the browser disconnects. Then "
            . "ask for their preferred date and time, their phone number, and a one-sentence "
            . "summary of what they want to discuss, then check real availability before confirming anything "
            . "— never just accept a time without checking. book_appointment requires a real name and email — "
            . "if the visitor hasn't actually stated their name or email yet in this conversation, ask for it "
            . "and wait for their real answer before calling the tool. NEVER invent, guess, or fill either "
            . "field with a placeholder (e.g. \"Your Name\", \"your@email.com\") just to complete the call — "
            . "an unconfirmed field means you're not ready to book yet. When you list times from check_availability, list "
            . "only the exact strings it returned — never add a vague option like \"or perhaps a bit later\" "
            . "that isn't literally one of those strings; the visitor may pick it and it won't be real. If "
            . "their reply doesn't clearly match exactly one of the times you listed (e.g. a vague \"go ahead\" "
            . "after you offered three options), ask them to name the specific one before doing anything else "
            . "— never guess which one they meant. Always read the exact date, time, and timezone back to "
            . "them and get an explicit yes before calling book_appointment. When calling book_appointment, "
            . "copy the `time` value character-for-character from the slot check_availability returned — "
            . "never convert or re-derive it yourself (e.g. \"4 PM\" is the slot string \"16:00\", not "
            . "\"04:00\"); a reformatted value won't match and the booking will be wrongly rejected as "
            . "unavailable. If a booking is rejected, its response includes available_slots — the real, "
            . "current list for that date. Offer directly from that list (again, verbatim, no guessing); "
            . "don't retry the same time or invent another one. Once booked, confirm with something like: "
            . "\"Great, I have you down for [Date] at [Time]. I've logged your phone number so Caleb can give "
            . "you a call or send a calendar invite to your email.\" Once you've told the visitor their "
            . "booking is confirmed, do NOT call book_appointment again for that same request — a plain "
            . "\"thanks\" or other acknowledgment afterward needs a reply, not another booking attempt. Only "
            . "call it again if they explicitly ask to book a different or additional slot.\n\n"
            . "If relevant, you may mention one of these case studies:\n" . $catalog;

        $persona = Settings::get('chat_persona');
        if (!empty($persona)) {
            $system .= "\n\nAdmin-configured {$name} behavior override from Prince: follow these instructions as high-priority behavior guidance whenever they do not conflict with hard safety, validation, or tool-use rules above. If they refine tone, lead-capture order, qualification flow, or what {$name} should ask first, apply them directly:\n" . $persona;
        }

        return $system;
    }

    /** @return array{reply: ?string, ready: bool}|null null only on a hard failure (caller falls back to keywords) */
    private static function chatWithGemini(string $apiKey, array $transcript, array $projects, \PDO $pdo): ?array
    {
        $system = self::buildSystemPrompt($projects);

        // The full transcript (already capped at MAX_TRANSCRIPT_MESSAGES) is
        // sent, not a truncated tail — messages here are short and providers'
        // context windows are enormous, so there's no real cost reason to
        // trim, and a visitor's early project description is exactly what
        // the model needs to still see turns later in a longer conversation.
        $contents = [];
        foreach ($transcript as $turn) {
            $contents[] = [
                'role' => $turn['role'] === 'user' ? 'user' : 'model',
                'parts' => [['text' => $turn['text']]],
            ];
        }

        $tools = [['functionDeclarations' => self::toolDeclarations()]];
        $ready = false;
        // Set once a book_appointment call actually succeeds — see
        // bookingConfirmationText() for why a later round's failure can't
        // just discard this and let the caller retry on another provider.
        $confirmedBooking = null;

        for ($round = 0; $round < self::MAX_TOOL_ROUNDS; $round++) {
            $payload = [
                'system_instruction' => ['parts' => [['text' => $system]]],
                'contents' => $contents,
                'generationConfig' => ['maxOutputTokens' => 2048],
            ];
            // On the last allowed round, don't offer tools at all — otherwise
            // a model that wants a second sequential tool call (e.g. search
            // one thing, then decide to call log_inquiry) uses up every round
            // on functionCalls and never emits final text, which surfaced as
            // the whole turn silently falling all the way through to keyword
            // matching. Forcing text here guarantees a
            // real reply using whatever tool results are already in hand.
            if ($round < self::MAX_TOOL_ROUNDS - 1) {
                $payload['tools'] = $tools;
            }
            $body = json_encode($payload);

            $result = self::callGeminiRaw($apiKey, $body, self::GEMINI_CHAT_TIMEOUT_SECONDS);
            $parts = $result['candidates'][0]['content']['parts'] ?? null;
            if (!is_array($parts)) {
                error_log(sprintf(
                    'Gemini chat returned no usable content (round %d): finishReason=%s promptFeedback=%s',
                    $round,
                    $result['candidates'][0]['finishReason'] ?? 'none',
                    json_encode($result['promptFeedback'] ?? null)
                ));
                if ($confirmedBooking !== null) {
                    return ['reply' => self::bookingConfirmationText($confirmedBooking), 'ready' => $ready];
                }
                return null;
            }

            $functionCalls = [];
            $text = '';
            foreach ($parts as $part) {
                if (isset($part['functionCall']['name'])) {
                    $functionCalls[] = $part['functionCall'];
                }
                if (isset($part['text'])) {
                    $text .= $part['text'];
                }
            }

            if (!$functionCalls) {
                if ($text === '') {
                    error_log(sprintf(
                        'Gemini chat returned parts with no text/functionCall (round %d): finishReason=%s parts=%s',
                        $round,
                        $result['candidates'][0]['finishReason'] ?? 'none',
                        json_encode($parts)
                    ));
                }
                return ['reply' => $text !== '' ? $text : null, 'ready' => $ready];
            }

            // Echo the model's turn back exactly as received — thinking-enabled
            // models attach an opaque thoughtSignature alongside each
            // functionCall part that must be round-tripped verbatim, or the
            // model can't correctly process the tool result on the next turn.
            // Reconstructing a stripped-down {functionCall} part here (as an
            // earlier version of this code did) silently breaks every
            // tool-using turn while plain text turns keep working fine.
            //
            // Also: json_decode(..., true) turns Gemini's empty `{}` (e.g. a
            // no-arg tool's args) into a PHP `[]`, which json_encode then
            // re-serializes as a JSON *array*, not the object Gemini sent —
            // it rejects that on the next call. Restore `{}` before echoing.
            $echoParts = $parts;
            foreach ($echoParts as &$p) {
                if (($p['functionCall']['args'] ?? null) === []) {
                    $p['functionCall']['args'] = (object) [];
                }
            }
            unset($p);
            $contents[] = ['role' => 'model', 'parts' => $echoParts];

            // One functionResponse part per call, in the same order (required
            // for parallel/multi function calls in a single turn).
            $responseParts = [];
            foreach ($functionCalls as $call) {
                $toolResponse = self::runTool($call['name'], $call['args'] ?? [], $pdo);
                if ($call['name'] === 'book_appointment' && ($toolResponse['success'] ?? false)) {
                    $confirmedBooking = $toolResponse;
                }
                if ($toolResponse === []) {
                    $toolResponse = (object) []; // same empty-object-vs-array fix, for no-data tool results
                }
                $responsePart = ['functionResponse' => ['name' => $call['name'], 'response' => $toolResponse]];
                if (isset($call['id'])) {
                    $responsePart['functionResponse']['id'] = $call['id'];
                }
                $responseParts[] = $responsePart;
            }
            $contents[] = ['role' => 'user', 'parts' => $responseParts];
        }

        if ($confirmedBooking !== null) {
            return ['reply' => self::bookingConfirmationText($confirmedBooking), 'ready' => $ready];
        }
        return null;
    }

    /**
     * Fallback for when Gemini fails entirely (quota, outage, bad response):
     * runs the same tool-calling conversation against OpenRouter instead,
     * using OpenAI-style tools/tool_calls. This is a whole separate,
     * self-contained turn (not a mid-conversation provider swap) — Gemini's
     * thoughtSignature and OpenAI's tool_call_id have no equivalent in the
     * other format, so there's no safe way to hand off partway through a
     * round; either the whole turn runs on one provider or the other.
     *
     * @return array{reply: ?string, ready: bool}|null null only on a hard failure (caller falls back to keywords)
     */
    private static function chatWithOpenRouter(string $apiKey, array $transcript, array $projects, \PDO $pdo): ?array
    {
        $messages = [['role' => 'system', 'content' => self::buildSystemPrompt($projects)]];
        // See chatWithGemini — full transcript, not a truncated tail.
        foreach ($transcript as $turn) {
            $messages[] = ['role' => $turn['role'] === 'user' ? 'user' : 'assistant', 'content' => $turn['text']];
        }

        $tools = self::toolDeclarationsOpenAiFormat();
        $model = Settings::get('openrouter_model') ?: 'openrouter/free';
        $ready = false;
        // See chatWithGemini's $confirmedBooking for why this matters.
        $confirmedBooking = null;

        for ($round = 0; $round < self::MAX_TOOL_ROUNDS; $round++) {
            // Without an explicit cap, OpenRouter prices the request against the
            // model's full context window (seen live: "requested up to 64000
            // tokens") regardless of how much text actually comes back — which
            // can 402 an account that has real credits, just not 64k-tokens'
            // worth. Chat replies are 1-4 sentences per the system prompt, so
            // this mirrors Gemini's maxOutputTokens cap below at no real cost.
            $payload = ['model' => $model, 'messages' => $messages, 'max_tokens' => 2048];
            // See chatWithGemini — force text on the last round so a model
            // wanting a second sequential tool call can't run out the clock
            // on functionCalls and never produce a reply.
            if ($round < self::MAX_TOOL_ROUNDS - 1) {
                $payload['tools'] = $tools;
            }
            $result = self::callOpenRouterRaw($apiKey, $payload, self::OPENROUTER_CHAT_TIMEOUT_SECONDS);
            if ($result === null) {
                if ($confirmedBooking !== null) {
                    return ['reply' => self::bookingConfirmationText($confirmedBooking), 'ready' => $ready];
                }
                return null;
            }

            $message = $result['choices'][0]['message'] ?? null;
            if (!is_array($message)) {
                error_log('OpenRouter chat: no message in response: ' . json_encode($result));
                if ($confirmedBooking !== null) {
                    return ['reply' => self::bookingConfirmationText($confirmedBooking), 'ready' => $ready];
                }
                return null;
            }

            $toolCalls = $message['tool_calls'] ?? null;
            if (!$toolCalls) {
                $text = $message['content'] ?? null;
                return ['reply' => $text !== null && $text !== '' ? $text : null, 'ready' => $ready];
            }

            // Echo the assistant's own tool-call turn back verbatim (OpenAI
            // format requires this preceding message to carry the same
            // tool_calls the model just made), then one "tool" message per
            // call carrying that tool's result, matched by tool_call_id.
            $messages[] = $message;
            foreach ($toolCalls as $call) {
                $name = $call['function']['name'] ?? '';
                $args = json_decode($call['function']['arguments'] ?? '{}', true) ?: [];
                $toolResult = self::runTool($name, $args, $pdo);
                if ($name === 'book_appointment' && ($toolResult['success'] ?? false)) {
                    $confirmedBooking = $toolResult;
                }
                $messages[] = [
                    'role' => 'tool',
                    'tool_call_id' => $call['id'] ?? '',
                    'content' => json_encode($toolResult),
                ];
            }
        }

        if ($confirmedBooking !== null) {
            return ['reply' => self::bookingConfirmationText($confirmedBooking), 'ready' => $ready];
        }
        return null;
    }

    /**
     * Second fallback, tried only after both Gemini and OpenRouter have
     * failed: same tool-calling conversation, same OpenAI-style
     * tools/tool_calls shape as chatWithOpenRouter (Groq's API is
     * OpenAI-compatible), just a different endpoint/key/model. Kept as its
     * own method rather than parameterizing chatWithOpenRouter because the
     * two providers may drift in header/quirk requirements over time, and
     * this stays a straight copy-and-adjust if that happens.
     *
     * @return array{reply: ?string, ready: bool}|null null only on a hard failure (caller falls back to keywords)
     */
    private static function chatWithGroq(string $apiKey, array $transcript, array $projects, \PDO $pdo): ?array
    {
        $messages = [['role' => 'system', 'content' => self::buildSystemPrompt($projects)]];
        foreach ($transcript as $turn) {
            $messages[] = ['role' => $turn['role'] === 'user' ? 'user' : 'assistant', 'content' => $turn['text']];
        }

        $tools = self::toolDeclarationsOpenAiFormat();
        $model = Settings::get('groq_model') ?: 'llama-3.3-70b-versatile';
        $ready = false;
        // See chatWithGemini's $confirmedBooking for why this matters.
        $confirmedBooking = null;

        for ($round = 0; $round < self::MAX_TOOL_ROUNDS; $round++) {
            // See chatWithOpenRouter — same reasoning: cap output tokens to what
            // a short chat reply actually needs, both to avoid an affordability
            // rejection and to stop padding the daily token budget unnecessarily.
            $payload = ['model' => $model, 'messages' => $messages, 'max_tokens' => 2048];
            if ($round < self::MAX_TOOL_ROUNDS - 1) {
                $payload['tools'] = $tools;
                $payload['tool_choice'] = 'auto';
                $payload['parallel_tool_calls'] = false;
            }
            $result = self::callGroqRaw($apiKey, $payload, self::GROQ_CHAT_TIMEOUT_SECONDS);
            if ($result === null) {
                if ($confirmedBooking !== null) {
                    return ['reply' => self::bookingConfirmationText($confirmedBooking), 'ready' => $ready];
                }
                return null;
            }
            if (isset($result['_groq_failed_generation'])) {
                $recovered = self::recoverGroqFailedToolGeneration(
                    (string) $result['_groq_failed_generation'],
                    $pdo
                );
                if ($recovered !== null) {
                    return $recovered;
                }
                if ($confirmedBooking !== null) {
                    return ['reply' => self::bookingConfirmationText($confirmedBooking), 'ready' => $ready];
                }
                return null;
            }

            $message = $result['choices'][0]['message'] ?? null;
            if (!is_array($message)) {
                error_log('Groq chat: no message in response: ' . json_encode($result));
                if ($confirmedBooking !== null) {
                    return ['reply' => self::bookingConfirmationText($confirmedBooking), 'ready' => $ready];
                }
                return null;
            }

            $toolCalls = $message['tool_calls'] ?? null;
            if (!$toolCalls) {
                $text = $message['content'] ?? null;
                return ['reply' => $text !== null && $text !== '' ? $text : null, 'ready' => $ready];
            }

            $messages[] = $message;
            foreach ($toolCalls as $call) {
                $name = $call['function']['name'] ?? '';
                $args = json_decode($call['function']['arguments'] ?? '{}', true) ?: [];
                $toolResult = self::runTool($name, $args, $pdo);
                if ($name === 'book_appointment' && ($toolResult['success'] ?? false)) {
                    $confirmedBooking = $toolResult;
                }
                $messages[] = [
                    'role' => 'tool',
                    'tool_call_id' => $call['id'] ?? '',
                    'content' => json_encode($toolResult),
                ];
            }
        }

        if ($confirmedBooking !== null) {
            return ['reply' => self::bookingConfirmationText($confirmedBooking), 'ready' => $ready];
        }
        return null;
    }

    private static function callGroqRaw(string $apiKey, array $payload, int $timeout): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => $timeout,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            $decoded = is_string($response) ? json_decode($response, true) : null;
            if (is_array($decoded)
                && ($decoded['error']['code'] ?? '') === 'tool_use_failed'
                && !empty($decoded['error']['failed_generation'])) {
                error_log('Live Chat Groq tool-use failed; attempting backend recovery from failed_generation.');
                return ['_groq_failed_generation' => (string) $decoded['error']['failed_generation']];
            }
            error_log(sprintf(
                'Live Chat Groq fallback failed: status=%s body=%s',
                $status,
                is_string($response) ? substr($response, 0, 800) : 'n/a'
            ));
            return null;
        }

        return json_decode($response, true);
    }

    /**
     * Groq can occasionally reject a model-generated tool call before the API
     * returns it as normal tool_calls. When the failed_generation contains a
     * simple pseudo-call with valid JSON args, run the safe backend tool here
     * instead of losing the lead.
     *
     * @return array{reply: string, ready: bool}|null
     */
    private static function recoverGroqFailedToolGeneration(string $failedGeneration, \PDO $pdo): ?array
    {
        if (!preg_match('/<function=([a-zA-Z0-9_]+)\s+(\{.*\})\s*<\/function>/s', $failedGeneration, $matches)) {
            return null;
        }

        $name = $matches[1];
        $allowed = ['log_inquiry', 'signal_handoff'];
        if (!in_array($name, $allowed, true)) {
            error_log(sprintf('Live Chat Groq recovery skipped unsafe tool "%s".', $name));
            return null;
        }

        $args = json_decode($matches[2], true);
        if (!is_array($args)) {
            return null;
        }

        $toolResult = self::runTool($name, $args, $pdo);
        if (isset($toolResult['error'])) {
            error_log(sprintf('Live Chat Groq recovery tool "%s" failed: %s', $name, json_encode($toolResult)));
            return null;
        }

        return [
            'reply' => "Got it. I've saved those details for Caleb, and he'll review the project and reach out shortly.",
            'ready' => false,
        ];
    }

    private static function callOpenRouterRaw(string $apiKey, array $payload, int $timeout): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $ch = curl_init('https://openrouter.ai/api/v1/chat/completions');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
                'HTTP-Referer: https://princecaleb.dev',
                'X-Title: Prince Caleb Portfolio',
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_TIMEOUT => $timeout,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'Live Chat OpenRouter fallback failed: status=%s body=%s',
                $status,
                is_string($response) ? substr($response, 0, 800) : 'n/a'
            ));
            return null;
        }

        return json_decode($response, true);
    }

    /** Translates the Gemini-format tool declarations to OpenAI-style tools/functions — one source of truth for both. */
    private static function toolDeclarationsOpenAiFormat(): array
    {
        $tools = [];
        foreach (self::toolDeclarations() as $decl) {
            $params = $decl['parameters'];
            $params['type'] = strtolower($params['type']);
            if (isset($params['properties']) && is_array($params['properties'])) {
                foreach ($params['properties'] as &$prop) {
                    if (isset($prop['type'])) {
                        $prop['type'] = strtolower($prop['type']);
                    }
                }
                unset($prop);
            }
            $tools[] = [
                'type' => 'function',
                'function' => [
                    'name' => $decl['name'],
                    'description' => $decl['description'],
                    'parameters' => $params,
                ],
            ];
        }
        return $tools;
    }

    /** @return array<int,array<string,mixed>> Gemini function declarations for the chat tools. */
    private static function toolDeclarations(): array
    {
        return [
            [
                'name' => 'get_site_info',
                'description' => 'Get background info about Prince — bio, services offered, tech stack, '
                    . 'experience highlights, location, and contact/social links. Use this for general '
                    . 'questions that are not about scoping a specific project, e.g. "what do you build", '
                    . '"where are you based", "do you work with WordPress", "how experienced are you".',
                'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
            ],
            [
                'name' => 'log_inquiry',
                'description' => 'Save a visitor\'s new-project inquiry or direct-service request so Prince '
                    . 'is notified and can follow up personally. Call this once you have their name, email, '
                    . 'and (ideally) phone, plus enough of a summary to be useful — never for a greeting or a '
                    . 'general question that does not need follow-up.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'name' => ['type' => 'STRING'],
                        'email' => ['type' => 'STRING'],
                        'phone' => ['type' => 'STRING', 'description' => 'Always ask for this before calling the tool; include it even if the visitor ultimately declines to give one.'],
                        'summary' => [
                            'type' => 'STRING',
                            'description' => 'For a new project: project type, core features, timeline/budget range. For a direct service request: current tech stack and the task or error they described.',
                        ],
                    ],
                    'required' => ['name', 'email', 'summary'],
                ],
            ],
            [
                'name' => 'check_availability',
                'description' => 'Check real bookable call slots for a given date, so you can offer the '
                    . 'visitor an actual time instead of guessing.',
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
                'description' => 'Book a call. Only call this after reading the exact date, time, and '
                    . 'timezone back to the visitor and getting an explicit yes. IMPORTANT: `time` must be '
                    . 'copied verbatim from one of the slot strings check_availability returned for that date — '
                    . 'never re-derive or reformat it yourself. A mismatched value (e.g. converting "4 PM" to '
                    . '"04:00" instead of "16:00") will not match any real slot and the booking will be '
                    . 'rejected as unavailable even though the time is actually open.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'name' => ['type' => 'STRING'],
                        'email' => ['type' => 'STRING'],
                        'date' => ['type' => 'STRING', 'description' => 'YYYY-MM-DD'],
                        'time' => [
                            'type' => 'STRING',
                            'description' => 'HH:MM, 24-hour, copied exactly from a check_availability slot — e.g. "16:00" for 4 PM, never "04:00".',
                        ],
                        'phone' => ['type' => 'STRING'],
                        'topic' => ['type' => 'STRING'],
                    ],
                    'required' => ['name', 'email', 'date', 'time'],
                ],
            ],
            [
                'name' => 'audit_website',
                'description' => 'Run a live technical audit of a website URL the visitor shared: load '
                    . 'time, HTTPS/SSL, mobile viewport tag, title/meta description, heading structure, '
                    . 'image alt coverage, and compression. Returns raw findings for you to translate into '
                    . 'business impact. Only audit a URL the visitor themselves provided.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'url' => ['type' => 'STRING', 'description' => 'The full URL the visitor shared, e.g. "https://example.com".'],
                    ],
                    'required' => ['url'],
                ],
            ],
            [
                'name' => 'signal_handoff',
                'description' => 'Immediately notify Caleb that this visitor needs him live — use when the '
                    . 'visitor is clearly frustrated, repeatedly asks for a human, or mentions a high-budget '
                    . 'or enterprise-scale project. Include whatever contact details you already have; never '
                    . 'invent them. Call at most once per conversation.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'reason' => ['type' => 'STRING', 'description' => 'One line on why the handoff triggered, e.g. "enterprise logistics platform, budget $40k+".'],
                        'name' => ['type' => 'STRING', 'description' => 'Visitor name if they stated one.'],
                        'email' => ['type' => 'STRING', 'description' => 'Visitor email if they stated one.'],
                        'phone' => ['type' => 'STRING', 'description' => 'Visitor phone if they stated one.'],
                    ],
                    'required' => ['reason'],
                ],
            ],
            [
                'name' => 'search_content',
                'description' => 'Search past projects and blog posts for something relevant to what the '
                    . 'visitor described, so you can reference real, specific work instead of speaking in '
                    . 'generalities.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'query' => [
                            'type' => 'STRING',
                            'description' => 'A few keywords, e.g. "restaurant ordering app" or "SEO blog".',
                        ],
                    ],
                    'required' => ['query'],
                ],
            ],
        ];
    }

    /** @return array<string,mixed> JSON-safe result for the functionResponse turn. */
    private static function runTool(string $name, array $args, \PDO $pdo): array
    {
        try {
            if ($name === 'book_appointment') {
                $result = AppointmentController::createBooking($args);
                if (!($result['success'] ?? true)) {
                    // A booking rejection is easy to blame on "the slot got
                    // taken" without evidence — logging the exact args the
                    // AI sent (date/time especially) makes a reformatting
                    // bug (e.g. "4 PM" sent as 04:00 instead of 16:00)
                    // immediately visible in Admin -> Error Logs instead of
                    // an unreproducible one-off.
                    error_log(sprintf(
                        'Live Chat book_appointment rejected: reason=%s args=%s',
                        $result['error'] ?? 'unknown',
                        json_encode($args)
                    ));
                }
                return $result;
            }

            return match ($name) {
                'get_site_info' => self::toolGetSiteInfo(),
                'log_inquiry' => self::toolLogInquiry($args, $pdo),
                'check_availability' => AppointmentController::getAvailableSlots((string) ($args['date'] ?? '')),
                'search_content' => self::toolSearchContent($pdo, (string) ($args['query'] ?? '')),
                'audit_website' => self::toolAuditWebsite((string) ($args['url'] ?? '')),
                'signal_handoff' => self::toolSignalHandoff($args, $pdo),
                default => ['error' => 'Unknown tool.'],
            };
        } catch (\Throwable $e) {
            error_log(sprintf('Live Chat tool "%s" threw: %s', $name, $e->getMessage()));
            return ['error' => 'Tool failed to run.'];
        }
    }

    private static function toolGetSiteInfo(): array
    {
        $fields = [
            'about_bio' => 'bio',
            'about_intro' => 'intro',
            'availability_badge' => 'current_availability',
            'tech_badges' => 'tech_stack',
            'contact_location' => 'location',
            'social_email' => 'email',
            'social_github' => 'github',
            'social_linkedin' => 'linkedin',
            'social_whatsapp' => 'whatsapp',
        ];
        $info = [];
        foreach ($fields as $settingKey => $outKey) {
            $value = Settings::get($settingKey);
            if (!empty($value)) {
                $info[$outKey] = $value;
            }
        }

        $services = [];
        for ($i = 1; $i <= 3; $i++) {
            $title = Settings::get("service_{$i}_title");
            if (empty($title)) {
                continue;
            }
            $services[] = [
                'title' => $title,
                'summary' => Settings::get("service_{$i}_summary"),
                'description' => Settings::get("service_{$i}_desc"),
            ];
        }
        if ($services) {
            $info['services'] = $services;
        }

        $highlights = [];
        for ($i = 1; $i <= 4; $i++) {
            $label = Settings::get("stat_{$i}_label");
            $value = Settings::get("stat_{$i}_value");
            if (empty($label) || empty($value)) {
                continue;
            }
            $highlights[] = trim(
                (Settings::get("stat_{$i}_prefix") ?? '') . $value . (Settings::get("stat_{$i}_suffix") ?? '')
                . ' ' . $label
            );
        }
        if ($highlights) {
            $info['highlights'] = $highlights;
        }

        // Public engineering tiers, so estimation conversations anchor to the
        // real published starting prices instead of the model guessing.
        $tiers = [];
        for ($i = 1; $i <= 3; $i++) {
            $name = Settings::get("pricing_tier_{$i}_name");
            $price = Settings::get("pricing_tier_{$i}_price");
            if (empty($name) || empty($price)) {
                continue;
            }
            $tiers[] = [
                'tier' => $name,
                'starting_price' => $price,
                'covers' => Settings::get("pricing_tier_{$i}_tagline"),
            ];
        }
        if ($tiers) {
            $info['engineering_tiers'] = $tiers;
        }

        return $info;
    }

    private static function toolLogInquiry(array $args, \PDO $pdo): array
    {
        $name = trim((string) ($args['name'] ?? ''));
        $email = trim((string) ($args['email'] ?? ''));
        $phone = trim((string) ($args['phone'] ?? ''));
        $summary = trim((string) ($args['summary'] ?? ''));

        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || $summary === '') {
            return ['error' => 'Missing or invalid name, email, or summary — ask the visitor for whatever is missing, then call this again.'];
        }

        self::recordInquiry($pdo, $name, $email, "[Live Chat]" . ($phone !== '' ? " Phone: {$phone}\n\n" : ' ') . $summary);

        return ['logged' => true];
    }

    /**
     * Live technical audit of a visitor-supplied URL. Fetches the page once
     * and reports objective facts (timing, SSL, viewport, SEO basics) for the
     * model to translate into business impact — it never editorializes here.
     */
    private static function toolAuditWebsite(string $url): array
    {
        $url = trim($url);
        if ($url !== '' && !preg_match('#^https?://#i', $url)) {
            $url = 'https://' . $url;
        }

        $parts = parse_url($url);
        $host = strtolower((string) ($parts['host'] ?? ''));
        if (!filter_var($url, FILTER_VALIDATE_URL) || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) || $host === '') {
            return ['error' => 'That does not look like a valid website address.'];
        }

        // SSRF guard: refuse anything that resolves to a private/reserved
        // address — this tool exists to audit public marketing sites only.
        $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : gethostbyname($host);
        if (
            $host === 'localhost'
            || !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)
        ) {
            return ['error' => 'That address is not publicly reachable, so it cannot be audited.'];
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_ENCODING => '', // advertise gzip/br so compression support is observable
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HEADER => true,
            CURLOPT_USERAGENT => 'PrinceCalebSiteAudit/1.0 (+https://princecaleb.dev)',
        ]);
        $raw = curl_exec($ch);
        $sslOk = true;
        if ($raw === false) {
            $errno = curl_errno($ch);
            // Retry without cert verification purely to distinguish "broken
            // SSL" (a reportable finding) from "site unreachable". Numeric
            // codes because the CURLE_* constants for 51/58/60 aren't defined
            // in every PHP build: 35=SSL connect, 51=peer verification,
            // 58=local cert, 60=CA cert problem.
            if (in_array($errno, [35, 51, 58, 60], true)) {
                // A verification failure can also mean OUR CA store is broken
                // (e.g. PHP with no curl.cainfo). Verify a known-good anchor:
                // if that fails too, report "unknown" rather than falsely
                // telling the visitor their certificate is invalid.
                $probe = curl_init('https://www.google.com/generate_204');
                curl_setopt_array($probe, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_NOBODY => true,
                    CURLOPT_CONNECTTIMEOUT => 4,
                    CURLOPT_TIMEOUT => 4,
                    CURLOPT_SSL_VERIFYPEER => true,
                ]);
                curl_exec($probe);
                $sslOk = curl_errno($probe) === 0 ? false : null;
                curl_close($probe);

                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
                $raw = curl_exec($ch);
            }
            if ($raw === false) {
                curl_close($ch);
                return ['error' => 'The site could not be reached (timeout, DNS failure, or connection refused).'];
            }
        }

        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $totalTime = round((float) curl_getinfo($ch, CURLINFO_TOTAL_TIME), 2);
        $ttfb = round((float) curl_getinfo($ch, CURLINFO_STARTTRANSFER_TIME), 2);
        $finalUrl = (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        $headers = strtolower(substr($raw, 0, $headerSize));
        $html = substr($raw, $headerSize);
        $htmlLower = strtolower($html);

        $imgCount = preg_match_all('/<img\b/i', $html);
        $imgWithAlt = preg_match_all('/<img\b[^>]*\balt\s*=/i', $html);

        $title = preg_match('/<title[^>]*>(.*?)<\/title>/is', $html, $m) ? trim(html_entity_decode($m[1])) : '';
        $metaDescription = preg_match(
            '/<meta[^>]+name=["\']description["\'][^>]*content=["\']([^"\']*)["\']|<meta[^>]+content=["\']([^"\']*)["\'][^>]*name=["\']description["\']/i',
            $html,
            $m
        ) ? trim($m[1] !== '' ? $m[1] : ($m[2] ?? '')) : '';

        return [
            'final_url' => $finalUrl,
            'http_status' => $status,
            'uses_https' => str_starts_with(strtolower($finalUrl), 'https://'),
            'ssl_certificate_valid' => $sslOk,
            'load_time_seconds' => $totalTime,
            'time_to_first_byte_seconds' => $ttfb,
            'page_weight_kb' => (int) round(strlen($html) / 1024),
            'compression_enabled' => (bool) preg_match('/content-encoding:\s*(gzip|br|deflate|zstd)/', $headers),
            'mobile_viewport_tag' => str_contains($htmlLower, 'name="viewport"') || str_contains($htmlLower, "name='viewport'"),
            'title_tag' => $title !== '' ? mb_substr($title, 0, 120) : null,
            'meta_description' => $metaDescription !== '' ? mb_substr($metaDescription, 0, 200) : null,
            'h1_count' => preg_match_all('/<h1\b/i', $html),
            'images_total' => $imgCount,
            'images_missing_alt' => max(0, $imgCount - $imgWithAlt),
        ];
    }

    /**
     * "Signal Caleb" for a live handoff: files an urgent inquiry, which rides
     * the existing webhook queue to his Slack/email in near-real-time, and
     * hands back the WhatsApp link so the model can offer an immediate channel.
     */
    private static function toolSignalHandoff(array $args, \PDO $pdo): array
    {
        $reason = trim((string) ($args['reason'] ?? ''));
        if ($reason === '') {
            return ['error' => 'A one-line reason is required.'];
        }

        $name = trim((string) ($args['name'] ?? '')) ?: 'Live chat visitor';
        $email = trim((string) ($args['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $email = 'live-chat@princecaleb.dev';
        }
        $phone = trim((string) ($args['phone'] ?? ''));

        self::recordInquiry(
            $pdo,
            $name,
            $email,
            "[LIVE HANDOFF REQUESTED] 🔴 A visitor in live chat needs you now.\n\n"
                . "Reason: {$reason}"
                . ($phone !== '' ? "\nPhone: {$phone}" : '')
        );

        $result = ['signaled' => true];
        $whatsapp = Settings::get('social_whatsapp');
        if (!empty($whatsapp)) {
            $result['whatsapp_link'] = $whatsapp;
        }
        return $result;
    }

    private static function toolSearchContent(\PDO $pdo, string $query): array
    {
        $words = array_filter(
            preg_split('/\W+/', strtolower(trim($query))) ?: [],
            fn($w) => strlen($w) > 2
        );
        if (!$words) {
            return ['results' => []];
        }

        $score = function (string $haystack) use ($words): int {
            $haystack = strtolower($haystack);
            $n = 0;
            foreach ($words as $w) {
                if (str_contains($haystack, $w)) {
                    $n++;
                }
            }
            return $n;
        };

        $results = [];
        foreach ($pdo->query('SELECT title, slug, summary, case_study_body FROM projects WHERE is_published = 1') as $p) {
            $s = $score($p['title'] . ' ' . $p['summary'] . ' ' . ($p['case_study_body'] ?? ''));
            if ($s > 0) {
                $results[] = [
                    'score' => $s,
                    'type' => 'project',
                    'title' => $p['title'],
                    'url' => '/project.html?slug=' . urlencode($p['slug']),
                    'snippet' => $p['summary'],
                ];
            }
        }
        foreach ($pdo->query('SELECT title, slug, excerpt FROM blog_posts WHERE is_published = 1') as $b) {
            $s = $score($b['title'] . ' ' . $b['excerpt']);
            if ($s > 0) {
                $results[] = [
                    'score' => $s,
                    'type' => 'blog_post',
                    'title' => $b['title'],
                    'url' => '/archive-post.html?slug=' . urlencode($b['slug']),
                    'snippet' => $b['excerpt'],
                ];
            }
        }

        usort($results, fn($a, $b) => $b['score'] <=> $a['score']);
        $top = array_slice($results, 0, 3);
        foreach ($top as &$t) {
            unset($t['score']);
        }
        return ['results' => $top];
    }

    private static function prototypeWithGemini(array $transcript): ?string
    {
        $conversation = implode("\n", array_map(
            fn($t) => ($t['role'] === 'user' ? 'Client' : 'Assistant') . ': ' . $t['text'],
            $transcript
        ));

        $prompt = "Based on this conversation with a potential client, produce a polished single-file HTML "
            . "concept prototype of what they described.\n\nConversation:\n$conversation\n\nRules:\n"
            . "- One complete HTML document, inline <style> only.\n"
            . "- Absolutely NO JavaScript, no <script> tags, no event handlers.\n"
            . "- No external assets except Google Fonts.\n"
            . "- Use realistic placeholder copy tailored to their business; for images use CSS gradients or inline SVG.\n"
            . "- Modern, premium design; mobile-friendly.\n"
            . "- Add a small fixed badge bottom-left: \"Concept by Prince Caleb — princecaleb.dev\".\n"
            . "Output ONLY the HTML document, no markdown fences, no commentary.";

        $html = AiText::generate($prompt, null, 45);
        if ($html === null) {
            return null;
        }

        // Strip markdown fences if the model added them, then defang scripts.
        $html = preg_replace('/^```(?:html)?\s*|```\s*$/m', '', trim($html));
        $html = preg_replace('#<script\b[^>]*>.*?</script>#is', '', $html);
        $html = preg_replace('/\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|\S+)/i', '', $html);

        return trim($html) !== '' ? $html : null;
    }

    /** @return array<string,mixed> Decoded Gemini response, or [] on any transport/HTTP failure. */
    private static function callGeminiRaw(string $apiKey, string $body, int $timeout): array
    {
        if (!function_exists('curl_init')) {
            return []; // no curl on this host — callers fall back gracefully
        }
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' . $apiKey;
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_TIMEOUT => $timeout,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            // Silent failures here are indistinguishable from "model declined to
            // answer" without this — log enough to diagnose a bad request shape
            // (e.g. a malformed tool-response turn) versus a real outage.
            error_log(sprintf(
                'Gemini API call failed: status=%s curl_error=%s body=%s',
                $status,
                $curlError !== '' ? $curlError : 'none',
                $response !== false ? substr($response, 0, 800) : 'n/a'
            ));
            return [];
        }
        return json_decode($response, true) ?? [];
    }

    private static function keywordFallback(string $message, array $projects): string
    {
        if (mb_strlen(trim($message)) < 25
            && preg_match('/^(hi|hello|hey|hiya|yo|good\s+(morning|afternoon|evening))\b/i', trim($message))) {
            return 'Hello! 👋 What kind of website or app are you thinking about? Describe it briefly and I\'ll help.';
        }

        if (!self::shouldSearchProjectFallback($message)) {
            return "I'm here. Tell me what you want to do next: describe a project, ask about services or pricing, or say \"book a call\" and I can check the calendar.";
        }

        $needle = strtolower($message);
        $best = null;
        $bestScore = 0;
        foreach ($projects as $project) {
            $haystack = strtolower($project['title'] . ' ' . $project['summary'] . ' ' . $project['tag_names']);
            $score = 0;
            foreach (preg_split('/\W+/', $needle) as $word) {
                if (strlen($word) > 2 && str_contains($haystack, $word)) {
                    $score++;
                }
            }
            if ($score > $bestScore) {
                $bestScore = $score;
                $best = $project;
            }
        }

        if ($best) {
            return "Sounds interesting! \"{$best['title']}\" is a similar project I've built — {$best['summary']} "
                . "Tell me more about what you have in mind, or use the contact form for a detailed quote.";
        }
        return "I'd love to hear more about your project — describe what you're building, "
            . "or use the contact form and I'll get back to you personally.";
    }

    private static function shouldSearchProjectFallback(string $message): bool
    {
        return (bool) preg_match(
            '/\b(portfolio|case study|case studies|example|similar|built|build|website|web app|mobile app|app|project|ecommerce|cms|dashboard|booking system|quote|pricing|price|cost|service|services|prototype|mockup|mock-up|demo|mvp)\b/i',
            $message
        );
    }

    private static function bookingFallback(string $message, array $transcript): ?string
    {
        $context = trim(implode("\n", array_map(
            fn($turn) => ($turn['role'] ?? '') . ': ' . ($turn['text'] ?? ''),
            array_slice($transcript, -8)
        )));
        $text = trim($context . "\nuser: " . $message);

        // Bare topic words like "book"/"booking"/"call"/"schedule" are common in
        // completely unrelated messages — e.g. "I need a booking application for
        // my business" (a project description) or a stray mention of "call" in
        // an earlier turn. Require an actual scheduling phrase in the CURRENT
        // message, or that we're already mid booking-flow (the last thing Lisa
        // asked was one of this function's own date/time/name/email questions)
        // so a bare "tomorrow" or "3pm" reply still continues it correctly.
        $lastAssistantText = '';
        for ($i = count($transcript) - 1; $i >= 0; $i--) {
            if (($transcript[$i]['role'] ?? '') === 'assistant') {
                $lastAssistantText = $transcript[$i]['text'] ?? '';
                break;
            }
        }
        $inBookingFlow = (bool) preg_match(
            '/what (date|time|name|email)|should i book|not open on|available times include|any open slots/i',
            $lastAssistantText
        );

        $bookingPhrase = '/\bbook(?:ing)?\s+(?:a|an|the)?\s*(?:call|appointment|meeting|slot|time)\b'
            . '|\bschedule\s+(?:a|an|the)?\s*(?:call|appointment|meeting|time)\b'
            . '|\bset up\s+(?:a|an)?\s*call\b|\b(?:hop|jump|get)\s+on\s+a\s+call\b'
            . '|\b(?:talk|speak)\s+(?:to|with)\s+(?:prince|caleb|you)\b'
            . '|\bgive\s+(?:me|us)\s+a\s+call\b|\bcall me\b|\bbook it\b/i';

        $hasBookingIntent = $inBookingFlow
            || preg_match($bookingPhrase, $message)
            || preg_match('/\b(go ahead|confirm|yes|please do|lock it in|book it|that works)\b/i', $message);
        if (!$hasBookingIntent) {
            return null;
        }

        $confirmed = preg_match('/\b(go ahead|confirm|yes|please do|lock it in|book it|that works)\b/i', $message);
        $details = self::extractBookingDetails($text, $confirmed ? $transcript : [], $confirmed ? $message : $text);
        if (empty($details['date'])) {
            return 'Sure - what date would you like to book? You can send it as YYYY-MM-DD, or say tomorrow.';
        }
        if (empty($details['time'])) {
            return "Sure - what time should I check for {$details['date']}? Please send it like 10:00 or 14:30.";
        }

        $availability = AppointmentController::getAvailableSlots($details['date']);
        if (!($availability['enabled'] ?? false)) {
            return 'Booking is not available right now. Please leave your name, email, and message here and Prince will follow up.';
        }
        if (isset($availability['error'])) {
            return $availability['error'];
        }
        if (!in_array($details['time'], $availability['slots'] ?? [], true)) {
            $slots = array_slice($availability['slots'] ?? [], 0, 6);
            if (!$slots) {
                return "I don't see any open slots on {$details['date']}. Try another date and I can check it.";
            }
            return "That time is not open on {$details['date']}. Available times include: " . implode(', ', $slots) . '.';
        }

        if (empty($details['name'])) {
            return 'That slot is open. What name should I put on the booking?';
        }
        if (empty($details['email'])) {
            return 'That slot is open. What email should I use for the confirmation?';
        }

        if (!$confirmed) {
            $friendlyDate = self::friendlyBookingDate($details['date']);
            return "That slot is open. Just to confirm, should I book {$friendlyDate} at {$details['time']} ({$availability['timezone']}) for {$details['name']}?";
        }

        $result = AppointmentController::createBooking([
            'name' => $details['name'],
            'email' => $details['email'],
            'phone' => $details['phone'] ?? '',
            'date' => $details['date'],
            'time' => $details['time'],
            'topic' => $details['topic'] ?? 'Call booked from Live Chat',
        ]);
        if (!($result['success'] ?? false)) {
            return $result['error'] ?? 'I could not complete that booking. Please try another slot.';
        }

        $friendlyDate = self::friendlyBookingDate($details['date']);
        return "You're all set! I've booked your call with Prince for {$friendlyDate} at {$details['time']} ({$result['timezone']}). You should receive a confirmation email shortly.";
    }

    private static function extractBookingDetails(string $text, array $confirmationTranscript = [], ?string $timeSource = null): array
    {
        $out = [];
        $tz = Settings::get('booking_timezone') ?: 'Africa/Accra';
        if (preg_match_all('/\b(\d{4}-\d{2}-\d{2})\b/', $text, $matches) && !empty($matches[1])) {
            $out['date'] = end($matches[1]);
        } elseif (preg_match('/\btomorrow\b/i', $text)) {
            $out['date'] = (new \DateTime('tomorrow', new \DateTimeZone($tz)))->format('Y-m-d');
        } elseif (preg_match('/\btoday\b/i', $text)) {
            $out['date'] = (new \DateTime('today', new \DateTimeZone($tz)))->format('Y-m-d');
        }

        if ($confirmationTranscript) {
            $offered = self::latestOfferedBookingSlot($confirmationTranscript);
            if (!empty($offered['time'])) {
                $out['time'] = $offered['time'];
            }
            if (!empty($offered['date'])) {
                $out['date'] = $offered['date'];
            }
        }

        $timeText = preg_replace('/\b\d{4}-\d{2}-\d{2}\b/', ' ', $timeSource ?? $text);
        if (empty($out['time'])) {
            if (preg_match_all('/(?:\bat\b|\bfor\b|\baround\b|time is)\s+([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm)?\b/i', $timeText, $matches, PREG_SET_ORDER)
                || preg_match_all('/\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)?\b/i', $timeText, $matches, PREG_SET_ORDER)) {
                $m = end($matches);
                $out['time'] = self::normalizeTimeMatch($m);
            }
        }

        if (preg_match('/\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/i', $text, $m)) {
            $out['email'] = $m[0];
        }
        if (preg_match('/(?:my name is|name is|i am|i\'m)\s+([A-Z][A-Za-z .\'-]{1,80})/i', $text, $m)) {
            $name = trim(preg_replace('/\s+and\s+my\s+email.*$/i', '', $m[1]));
            $out['name'] = trim($name, " .\t\n\r\0\x0B");
        }
        if (preg_match('/\+?\d[\d\s().-]{7,}\d/', $text, $m)) {
            $out['phone'] = trim($m[0]);
        }

        return $out;
    }

    private static function latestOfferedBookingSlot(array $transcript): array
    {
        foreach (array_reverse($transcript) as $turn) {
            if (($turn['role'] ?? '') !== 'assistant') {
                continue;
            }
            $text = (string) ($turn['text'] ?? '');
            if (!preg_match('/\b(would|should|confirm|work|book)\b/i', $text)) {
                continue;
            }
            $slot = [];
            if (preg_match_all('/\b(\d{4}-\d{2}-\d{2})\b/', $text, $dateMatches) && !empty($dateMatches[1])) {
                $slot['date'] = end($dateMatches[1]);
            }
            if (preg_match_all('/\b([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm)\b/i', $text, $matches, PREG_SET_ORDER)
                || preg_match_all('/\b([01]?\d|2[0-3]):([0-5]\d)\b/i', $text, $matches, PREG_SET_ORDER)) {
                $m = end($matches);
                $slot['time'] = self::normalizeTimeMatch($m);
            }
            if (!empty($slot['time'])) {
                return $slot;
            }
        }

        return [];
    }

    private static function normalizeTimeMatch(array $m): string
    {
        $hour = (int) $m[1];
        $minute = isset($m[2]) && $m[2] !== '' ? (int) $m[2] : 0;
        $ampm = strtolower($m[3] ?? '');
        if ($ampm === 'pm' && $hour < 12) {
            $hour += 12;
        } elseif ($ampm === 'am' && $hour === 12) {
            $hour = 0;
        }
        return sprintf('%02d:%02d', $hour, $minute);
    }

    private static function friendlyBookingDate(string $date): string
    {
        try {
            return (new \DateTime($date))->format('l, F j, Y');
        } catch (\Throwable) {
            return $date;
        }
    }

    /**
     * Used by chatWithGemini/chatWithOpenRouter/chatWithGroq when a
     * book_appointment call already succeeded earlier in the same turn but
     * a later round's raw API call then fails (e.g. quota/credit exhausted
     * mid-turn) — without this, the caller would see a hard failure, retry
     * the whole turn on a different provider, and that provider would
     * re-call book_appointment for the same slot, which is now genuinely
     * taken by the booking that already succeeded. The visitor would be
     * told their booking failed when it actually went through. Confirming
     * directly from the known-successful tool result sidesteps needing any
     * more AI text generation for it.
     */
    private static function bookingConfirmationText(array $booking): string
    {
        $friendlyDate = self::friendlyBookingDate((string) ($booking['date'] ?? ''));
        return "You're all set! I've got you down for {$friendlyDate} at {$booking['time']} ({$booking['timezone']}). "
            . "You should receive a confirmation email shortly.";
    }
}
