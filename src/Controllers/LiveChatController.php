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
 * Live Chat: a requirements-gathering conversation that can generate an HTML
 * concept prototype for the visitor to approve or comment on. Feedback flows
 * into the inquiries inbox (and its Slack webhook queue) plus a dedicated
 * chat_sessions record the admin panel lists under "Chat Leads".
 *
 * Both the conversation and prototype generation fall back across Gemini,
 * OpenRouter, and Groq (whichever keys are configured in Admin -> Settings);
 * without any of the three, the chat still works via keyword/booking-intent
 * fallback, minus AI-driven tool calls and the prototype step.
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
            // The widget shows "Build my prototype" once the AI itself has
            // signaled (via the mark_ready_for_prototype tool) that it has
            // enough real context — not just after N messages, since chit-chat
            // shouldn't count. This sticks once earned, even if a later turn
            // has to fall back to keyword mode.
            'can_prototype' => $readyForPrototype,
        ]);
    }

    /** GET /api/v1/chat/session/{token} — rehydrates a session for the two-column workspace page */
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

    /** POST /api/v1/chat/prototype — body: {token} */
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

        $pdo = Database::get();
        $session = self::requireSession($pdo, self::tokenFromBody());
        $transcript = json_decode($session['transcript_json'], true) ?: [];
        if (count($transcript) < 2) {
            Response::error('Tell me a bit about your project first.', 422);
        }

        $html = self::prototypeWithGemini($transcript);
        if ($html === null) {
            Response::error('Prototype generation failed — please try again in a moment.', 502);
        }

        $pdo->prepare(
            "UPDATE chat_sessions SET prototype_html = ?, prototype_status = 'generated',
             updated_at = datetime('now') WHERE id = ?"
        )->execute([$html, $session['id']]);

        Response::json(['url' => '/api/v1/chat/prototype/' . $session['token']]);
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
        $stmt = $pdo->prepare(
            'INSERT INTO inquiries (name, email, message, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $name,
            $email,
            $summary,
            $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            $_SERVER['HTTP_USER_AGENT'] ?? null,
        ]);
        $pdo->prepare('INSERT INTO webhook_queue (inquiry_id) VALUES (?)')->execute([(int) $pdo->lastInsertId()]);

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

        $stmt = $pdo->prepare(
            'INSERT INTO inquiries (name, email, message, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $name,
            $email,
            "[Live Chat]" . ($phone !== '' ? " Phone: $phone\n\n" : ' ') . $message,
            $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            $_SERVER['HTTP_USER_AGENT'] ?? null,
        ]);
        $pdo->prepare('INSERT INTO webhook_queue (inquiry_id) VALUES (?)')->execute([(int) $pdo->lastInsertId()]);

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

    private static function tokenFromBody(): string
    {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        return (string) ($data['token'] ?? '');
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

        $system = "You are the live-chat assistant on Prince Caleb's web & mobile development portfolio. "
            . "Talk like a genuinely curious, friendly person having a conversation — not an intake form. "
            . "If the visitor just greets you (hi, hello, hey), reply with a warm one-sentence hello and ask "
            . "what brings them by — nothing else.\n\n"
            . "Not every visitor wants to scope out a build. Some just have a general question — about what "
            . "Prince builds, his experience, tech stack, process, turnaround, location, or pricing. Answer "
            . "those directly and helpfully using your tools, as normal conversation — don't redirect every "
            . "reply toward \"what would you like to build?\" unless that's genuinely where things are headed.\n\n"
            . "When a visitor does describe something they want built, get to know it through natural "
            . "back-and-forth: ask about it one question at a time, following their lead rather than a fixed "
            . "script. Don't stop at the bare basics (what it's for, who it's for) — once those are covered, "
            . "keep going and dig into how it should actually work: the core workflow step by step, how the "
            . "different roles interact, what happens to data as it moves through, and any specifics they "
            . "mention in passing (priority/ordering, notifications, timing) that are worth a follow-up "
            . "question rather than leaving vague. Some visitors want to chat a while before they're ready to "
            . "see anything; others are ready sooner — read the room, but when in doubt ask one more clarifying "
            . "question rather than calling it done early. Never mention a \"Build my prototype\" button "
            . "yourself — whether it's shown is handled separately. Keep replies short and conversational "
            . "(1-4 sentences), never a bulleted interview.\n\n"
            . "You have tools available, and using them well is part of being helpful:\n"
            . "- get_site_info: use it for general questions about Prince's background, services, tech stack, "
            . "experience, location, or contact/social links, so you answer with real facts instead of guessing.\n"
            . "- get_pricing: use it whenever cost, packages, or \"how much\" comes up, so you quote real numbers.\n"
            . "- search_content: use it when something they describe reminds you of a past project or blog "
            . "post worth mentioning — share it naturally, with the link.\n"
            . "- check_availability / book_appointment: use these when they want to talk it through live or "
            . "book a call. Always read the exact date, time, and timezone back to them and get an explicit "
            . "yes before calling book_appointment — never book without confirmation. When calling "
            . "book_appointment, copy the `time` value character-for-character from the slot check_availability "
            . "returned — never convert or re-derive it yourself (e.g. \"4 PM\" is the slot string \"16:00\", "
            . "not \"04:00\"); a reformatted value won't match and the booking will be wrongly rejected as "
            . "unavailable. If a booking is rejected, don't assume the slot is genuinely taken — re-run "
            . "check_availability for that date and confirm you're using one of its exact returned strings "
            . "before trying again or telling the visitor it's unavailable.\n"
            . "- mark_ready_for_prototype: call this once — and only once — the conversation has covered more "
            . "than just the basics: what it's for, who it's for, AND at least the core workflow (the actual "
            . "steps a user or role goes through) or a couple of specific features/details they care about — "
            . "not just a one-line pitch. Never call it for greetings, small talk, general questions, or "
            . "before a real back-and-forth has happened. This is what unlocks the prototype button for them, "
            . "so if you're unsure whether you have enough, ask one more question instead of calling it.\n\n"
            . "If relevant, you may mention one of these case studies:\n" . $catalog;

        $persona = Settings::get('chat_persona');
        if (!empty($persona)) {
            $system .= "\n\nAdditional instructions from Prince: " . $persona;
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

        for ($round = 0; $round < self::MAX_TOOL_ROUNDS; $round++) {
            $payload = [
                'system_instruction' => ['parts' => [['text' => $system]]],
                'contents' => $contents,
                'generationConfig' => ['maxOutputTokens' => 2048],
            ];
            // On the last allowed round, don't offer tools at all — otherwise
            // a model that wants a second sequential tool call (e.g. search
            // one thing, then decide to call mark_ready_for_prototype) uses
            // up every round on functionCalls and never emits final text,
            // which surfaced as the whole turn silently falling all the way
            // through to keyword matching. Forcing text here guarantees a
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

            foreach ($functionCalls as $call) {
                if ($call['name'] === 'mark_ready_for_prototype') {
                    $ready = true;
                }
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

        for ($round = 0; $round < self::MAX_TOOL_ROUNDS; $round++) {
            $payload = ['model' => $model, 'messages' => $messages];
            // See chatWithGemini — force text on the last round so a model
            // wanting a second sequential tool call can't run out the clock
            // on functionCalls and never produce a reply.
            if ($round < self::MAX_TOOL_ROUNDS - 1) {
                $payload['tools'] = $tools;
            }
            $result = self::callOpenRouterRaw($apiKey, $payload, self::OPENROUTER_CHAT_TIMEOUT_SECONDS);
            if ($result === null) {
                return null;
            }

            $message = $result['choices'][0]['message'] ?? null;
            if (!is_array($message)) {
                error_log('OpenRouter chat: no message in response: ' . json_encode($result));
                return null;
            }

            $toolCalls = $message['tool_calls'] ?? null;
            if (!$toolCalls) {
                $text = $message['content'] ?? null;
                return ['reply' => $text !== null && $text !== '' ? $text : null, 'ready' => $ready];
            }

            foreach ($toolCalls as $call) {
                if (($call['function']['name'] ?? '') === 'mark_ready_for_prototype') {
                    $ready = true;
                }
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
                $messages[] = [
                    'role' => 'tool',
                    'tool_call_id' => $call['id'] ?? '',
                    'content' => json_encode($toolResult),
                ];
            }
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

        for ($round = 0; $round < self::MAX_TOOL_ROUNDS; $round++) {
            $payload = ['model' => $model, 'messages' => $messages];
            if ($round < self::MAX_TOOL_ROUNDS - 1) {
                $payload['tools'] = $tools;
            }
            $result = self::callGroqRaw($apiKey, $payload, self::GROQ_CHAT_TIMEOUT_SECONDS);
            if ($result === null) {
                return null;
            }

            $message = $result['choices'][0]['message'] ?? null;
            if (!is_array($message)) {
                error_log('Groq chat: no message in response: ' . json_encode($result));
                return null;
            }

            $toolCalls = $message['tool_calls'] ?? null;
            if (!$toolCalls) {
                $text = $message['content'] ?? null;
                return ['reply' => $text !== null && $text !== '' ? $text : null, 'ready' => $ready];
            }

            foreach ($toolCalls as $call) {
                if (($call['function']['name'] ?? '') === 'mark_ready_for_prototype') {
                    $ready = true;
                }
            }

            $messages[] = $message;
            foreach ($toolCalls as $call) {
                $name = $call['function']['name'] ?? '';
                $args = json_decode($call['function']['arguments'] ?? '{}', true) ?: [];
                $toolResult = self::runTool($name, $args, $pdo);
                $messages[] = [
                    'role' => 'tool',
                    'tool_call_id' => $call['id'] ?? '',
                    'content' => json_encode($toolResult),
                ];
            }
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
            error_log(sprintf(
                'Live Chat Groq fallback failed: status=%s body=%s',
                $status,
                is_string($response) ? substr($response, 0, 800) : 'n/a'
            ));
            return null;
        }

        return json_decode($response, true);
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
                'name' => 'get_pricing',
                'description' => 'Get the current service pricing tiers (name, price, tagline, features) '
                    . 'to answer questions about cost or packages accurately instead of guessing.',
                'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
            ],
            [
                'name' => 'mark_ready_for_prototype',
                'description' => 'Call once the conversation has gone beyond the basics (what it is, who '
                    . 'it is for) into the actual workflow — the steps a user or role goes through, or a '
                    . 'couple of specific features/details they care about. A one-line project pitch alone '
                    . 'is not enough. This unlocks the "Build my prototype" button for them. Never call this '
                    . 'for greetings, small talk, general questions, or before a real back-and-forth has '
                    . 'happened — if unsure, ask one more question first.',
                'parameters' => ['type' => 'OBJECT', 'properties' => (object) []],
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
                'get_pricing' => self::toolGetPricing(),
                'check_availability' => AppointmentController::getAvailableSlots((string) ($args['date'] ?? '')),
                'search_content' => self::toolSearchContent($pdo, (string) ($args['query'] ?? '')),
                'mark_ready_for_prototype' => ['acknowledged' => true],
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

        return $info;
    }

    private static function toolGetPricing(): array
    {
        $tiers = [];
        for ($i = 1; $i <= 3; $i++) {
            $name = Settings::get("pricing_tier_{$i}_name");
            if (empty($name)) {
                continue;
            }
            $tiers[] = [
                'name' => $name,
                'price' => Settings::get("pricing_tier_{$i}_price"),
                'tagline' => Settings::get("pricing_tier_{$i}_tagline"),
                'features' => array_values(array_filter(array_map(
                    'trim',
                    explode("\n", (string) Settings::get("pricing_tier_{$i}_features"))
                ))),
            ];
        }
        return ['currency' => Settings::get('pricing_currency') ?: 'GHS', 'tiers' => $tiers];
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
                    'url' => '/blog-post.html?slug=' . urlencode($b['slug']),
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
            '/\b(portfolio|case study|case studies|example|similar|built|build|website|web app|mobile app|app|project|ecommerce|cms|dashboard|booking system|quote|pricing|price|cost|service|services)\b/i',
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

        $hasBookingIntent = preg_match('/\b(book|booking|call|appointment|schedule|meet|meeting)\b/i', $text)
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
}
