<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Support\LeadAttribution;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\ActivityLog;
use App\Support\AiAgentEngine;
use App\Support\AiText;
use App\Support\Automations;
use App\Support\Database;
use App\Support\Jwt;
use App\Support\LisaInstructions;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;
use App\Support\WhapiClient;

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
    private const ROLLING_TRANSCRIPT_MESSAGES = 30;

    /** GET /api/v1/chat/status — availability plus the editable widget copy */
    public static function status(): void
    {
        Response::json([
            'online' => (!empty(Settings::get('gemini_api_key')) || !empty(Settings::get('openrouter_api_key'))
                || !empty(Settings::get('groq_api_key')))
                && self::isWithinScheduledHours(),
            'greeting' => Settings::get('chat_greeting')
                ?? 'Hi there! 👋 Welcome. We build AI voice agents, WhatsApp assistants, and automations around the work your team repeats.',
            'intro' => Settings::get('chat_intro')
                ?? "Pick an option below, or describe the call, message, or repetitive workflow you want to improve.",
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

        $transcript = self::rollingTranscript($transcript);

        $transcript[] = ['role' => 'user', 'text' => $message];

        $projects = self::projectCatalog($pdo);
        $result = self::generateReply($message, $transcript, $projects, $pdo, self::isOwnerSession(), [
            'name' => $session['client_name'] ?? '',
            'email' => $session['client_email'] ?? '',
            'phone' => $session['client_phone'] ?? '',
        ]);

        $transcript[] = ['role' => 'assistant', 'text' => $result['reply']];
        $readyForPrototype = (bool) $session['ready_for_prototype'] || $result['ready'];
        self::saveTranscript($pdo, (int) $session['id'], $transcript, $readyForPrototype);
        self::markChatUnread($pdo, (int) $session['id']);

        Response::json([
            'token' => $session['token'],
            'reply' => $result['reply'],
            'mode' => $result['mode'],
            // Temporary debug aid for verifying the Gemini->OpenRouter->Groq
            // fallback actually triggers in production — 'gemini',
            // 'openrouter', 'groq', or null (keyword fallback served this
            // reply). Safe to remove later; not relied on by any UI logic.
            'provider' => $result['provider'],
            // AI-driven prototype building is disabled — the model has no tool
            // to set ready_for_prototype anymore, so this (and the "Build my
            // prototype" button it used to gate) stays permanently false.
            // Visitors asking for a prototype are redirected to Caleb instead
            // (see the system prompt).
            'can_prototype' => $readyForPrototype,
        ]);
    }

    /**
     * POST /api/v1/admin/agents/lisa/chat — body: {message, transcript: [{role,text}, ...]}.
     * The same Lisa the public widget and WhatsApp use (generateReply(), same
     * brain, same tools), but reachable from the admin "Talk to Agents"
     * console so Caleb can hold a live working conversation with her.
     *
     * Runs in owner mode ($isOwner = true) — exactly like the WhatsApp
     * owner-number path — so she drops the lead-capture/sales workflow: no
     * asking for name/email/phone, no quote pitch, no log_inquiry treating
     * this as a new lead. Tools stay available where genuinely useful
     * (check_availability, get_site_info, search_content, audit_website).
     * Stateless: the transcript lives in the browser and is replayed each
     * turn, matching the other admin agents (see NurturerController::chat()).
     */
    public static function adminChat(): void
    {
        AuthMiddleware::requireAuth();
        // Same worst-case provider-fallback budget as the public widget's
        // message() — a reply can fall through Gemini -> OpenRouter -> Groq.
        set_time_limit(135);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim((string) ($data['message'] ?? ''));
        $transcript = is_array($data['transcript'] ?? null) ? $data['transcript'] : [];

        if ($message === '' || mb_strlen($message) > 1000) {
            Response::error('A message under 1000 characters is required.', 422);
        }
        if (count($transcript) > self::MAX_TRANSCRIPT_MESSAGES) {
            $transcript = array_slice($transcript, -self::MAX_TRANSCRIPT_MESSAGES);
        }
        $transcript[] = ['role' => 'user', 'text' => $message];

        $pdo = Database::get();
        $projects = self::projectCatalog($pdo);
        $result = self::generateReply($message, $transcript, $projects, $pdo, true);

        Response::json(['reply' => $result['reply']]);
    }

    /**
     * Shared by the web widget (message()) and the WhatsApp webhook — runs one
     * turn against Gemini -> OpenRouter -> Groq -> keyword/booking fallback and
     * returns the reply plus which path served it. $transcript must already
     * include the new user turn as its last entry.
     *
     * @return array{reply: string, mode: string, provider: ?string, ready: bool}
     */
    private static function generateReply(
        string $message,
        array $transcript,
        array $projects,
        \PDO $pdo,
        bool $isOwner = false,
        array $handoffContext = []
    ): array
    {
        // book_appointment's success is tracked here (rather than inside the
        // engine, which knows nothing about Lisa's tools) so that if a
        // provider confirms a booking but then fails before producing final
        // text, $onExhaustedFallback below can still hand the visitor a real
        // confirmation instead of losing it to a retry on another provider
        // that would re-attempt — and likely reject — the same slot.
        $confirmedBooking = null;
        // If a provider executes a side-effecting tool and then fails while
        // writing its reply, the engine retries the turn with the next
        // provider. Reuse the first result so that retry cannot insert the
        // same inquiry once per configured AI provider.
        $sideEffectResults = [];
        $toolExecutor = function (string $name, array $args) use ($pdo, &$confirmedBooking, &$sideEffectResults, $transcript, $isOwner, $handoffContext) {
            if (isset($sideEffectResults[$name])) {
                return $sideEffectResults[$name];
            }

            if ($name === 'signal_handoff') {
                foreach (['name', 'email', 'phone'] as $field) {
                    if (trim((string) ($args[$field] ?? '')) === '' && trim((string) ($handoffContext[$field] ?? '')) !== '') {
                        $args[$field] = $handoffContext[$field];
                    }
                }
            }
            $result = self::runTool($name, $args, $pdo, $isOwner);
            if (in_array($name, ['log_inquiry', 'signal_handoff'], true)) {
                $sideEffectResults[$name] = $result;
            }
            if ($name === 'book_appointment' && ($result['success'] ?? false)) {
                $confirmedBooking = $result;
                self::queueProposalDraft($args, $result, $transcript, $pdo);
            }
            return $result;
        };
        $onExhaustedFallback = function () use (&$confirmedBooking, $transcript) {
            return $confirmedBooking !== null
                ? ['reply' => self::bookingConfirmationText($confirmedBooking, $transcript), 'ready' => false]
                : null;
        };
        $onGroqFailedGeneration = fn (string $failedGeneration) => self::recoverGroqFailedToolGeneration($failedGeneration, $toolExecutor);

        $result = AiAgentEngine::run(
            self::buildSystemPrompt($projects, $isOwner),
            self::toolDeclarations($isOwner),
            $toolExecutor,
            $transcript,
            $onExhaustedFallback,
            $onGroqFailedGeneration
        );

        if ($result['reply'] === null) {
            // A visitor mid-conversation degrading to canned keyword replies is easy to
            // miss (it still looks like a normal reply) — the engine's own provider
            // error_log calls explain *why* each one failed, but nothing said "and so
            // this turn had no real AI at all" until now. Only worth logging when a
            // provider was actually configured and attempted (dev environments with no
            // keys at all fall back on every turn by design).
            if (!empty(Settings::get('gemini_api_key')) || !empty(Settings::get('openrouter_api_key')) || !empty(Settings::get('groq_api_key'))) {
                error_log(sprintf(
                    'Live Chat: all configured AI providers failed this turn — degraded to keyword/booking fallback. message="%s"',
                    substr($message, 0, 200)
                ));
            }
            $bookingReply = self::bookingFallback($message, $transcript);
            $result['reply'] = $bookingReply ?? ($isOwner
                ? self::ownerKeywordFallback($message)
                : self::keywordFallback($message, $projects));
        }

        return $result;
    }

    /**
     * POST /api/v1/whatsapp/webhook — Twilio's incoming-message webhook.
     * Lisa on WhatsApp: same brain as the web widget (generateReply(), same
     * tools including signal_handoff for a human handoff), just a different
     * front door. The session is keyed by the visitor's WhatsApp number
     * itself (e.g. "whatsapp:+14155551234") via findOrCreateSessionByExactToken() —
     * so a returning number resumes its own thread automatically, same as a
     * saved browser token does for the web widget. Every WhatsApp thread
     * also shows up in Admin -> Chat Leads alongside web ones.
     *
     * Replies via TwiML in the webhook response itself (Twilio's supported
     * way to answer an incoming message synchronously) rather than a
     * separate outbound API call — simpler, and needs only the Auth Token
     * (for verifying the request really came from Twilio), not the Account
     * SID or a REST call.
     */
    public static function whatsappWebhook(): void
    {
        set_time_limit(135);
        if (Settings::get('whatsapp_provider') === 'whapi') {
            self::respondTwiml('');
            return;
        }

        $authToken = Settings::get('twilio_auth_token');
        if (empty($authToken) || !self::verifyTwilioSignature($authToken)) {
            http_response_code(403);
            exit;
        }

        $from = trim((string) ($_POST['From'] ?? '')); // e.g. "whatsapp:+14155551234"
        $body = trim((string) ($_POST['Body'] ?? ''));
        $profileName = trim((string) ($_POST['ProfileName'] ?? ''));

        if ($from === '' || $body === '' || mb_strlen($body) > 1000) {
            self::respondTwiml('');
            return;
        }

        // Keyed per WhatsApp number (not IP) — the number itself is already
        // a stable, hard-to-spoof identity here (Twilio only forwards real
        // WhatsApp messages, verified above).
        RateLimitMiddleware::enforce('whatsapp_' . preg_replace('/[^a-zA-Z0-9]/', '', $from), 30);

        $pdo = Database::get();
        $session = self::findOrCreateSessionByExactToken($pdo, $from);
        $transcript = json_decode($session['transcript_json'], true) ?: [];

        if (empty($session['client_phone'])) {
            // Strip the "whatsapp:" prefix for display — Admin -> Chat Leads
            // builds a tel: link straight from client_phone, which a raw
            // "whatsapp:+14155551234" would break. The session's actual
            // token (used for lookups above) keeps the prefixed form.
            $displayPhone = preg_replace('/^whatsapp:/', '', $from);
            $pdo->prepare('UPDATE chat_sessions SET client_phone = ?, client_name = ? WHERE id = ?')
                ->execute([$displayPhone, $profileName !== '' ? $profileName : null, $session['id']]);
        }

        $transcript = self::rollingTranscript($transcript);

        // Verified by matching Twilio's real, unspoofable From number against
        // the admin-configured owner number — never inferred from message
        // text (anyone could type "I'm Prince"), only from the phone itself.
        $isOwner = self::isOwnerWhatsAppNumber($from);

        $transcript[] = ['role' => 'user', 'text' => $body];
        $projects = self::projectCatalog($pdo);
        $result = self::generateReply($body, $transcript, $projects, $pdo, $isOwner, [
            'name' => $profileName,
            'phone' => preg_replace('/^whatsapp:/', '', $from),
        ]);

        $transcript[] = ['role' => 'assistant', 'text' => $result['reply']];
        $readyForPrototype = (bool) $session['ready_for_prototype'] || $result['ready'];
        self::saveTranscript($pdo, (int) $session['id'], $transcript, $readyForPrototype);
        self::markChatUnread($pdo, (int) $session['id']);

        self::respondTwiml($result['reply']);
    }

    /**
     * Whapi.Cloud linked-device webhook. A private custom header configured
     * in Whapi authenticates callbacks, and message IDs prevent retry loops.
     */
    public static function whapiWebhook(): void
    {
        set_time_limit(135);
        if (Settings::get('whatsapp_provider') !== 'whapi') {
            Response::json(['ok' => true, 'ignored' => 'provider_disabled']);
        }
        $expected = trim((string) Settings::get('whapi_webhook_secret'));
        $provided = trim((string) ($_SERVER['HTTP_X_WHAPI_SECRET'] ?? ''));
        if ($expected === '' || $provided === '' || !hash_equals($expected, $provided)) {
            Response::error('Invalid webhook secret.', 403);
        }

        $payload = json_decode(file_get_contents('php://input'), true) ?? [];
        $messages = is_array($payload['messages'] ?? null) ? $payload['messages'] : [];
        $pdo = Database::get();
        $processed = 0;
        foreach ($messages as $message) {
            if (!is_array($message) || !empty($message['from_me']) || ($message['type'] ?? '') !== 'text') continue;
            $messageId = mb_substr(trim((string) ($message['id'] ?? '')), 0, 255);
            $chatId = trim((string) ($message['chat_id'] ?? ''));
            $body = trim((string) ($message['text']['body'] ?? ''));
            if ($messageId === '' || $chatId === '' || $body === '' || mb_strlen($body) > 1000) continue;

            $insert = $pdo->prepare('INSERT OR IGNORE INTO whapi_webhook_events (message_id) VALUES (?)');
            $insert->execute([$messageId]);
            if ($insert->rowCount() === 0) continue;

            $digits = preg_replace('/\D+/', '', preg_replace('/@.+$/', '', $chatId) ?? '') ?? '';
            if ($digits === '') continue;
            $from = 'whatsapp:+' . $digits;
            RateLimitMiddleware::enforce('whatsapp_' . $digits, 30);

            $session = self::findOrCreateSessionByExactToken($pdo, $from);
            $transcript = json_decode($session['transcript_json'], true) ?: [];
            $profileName = trim((string) ($message['from_name'] ?? ''));
            if (empty($session['client_phone'])) {
                $pdo->prepare('UPDATE chat_sessions SET client_phone = ?, client_name = ? WHERE id = ?')
                    ->execute(['+' . $digits, $profileName !== '' ? $profileName : null, $session['id']]);
            }

            $transcript = self::rollingTranscript($transcript);
            $isOwner = self::isOwnerWhatsAppNumber($from);
            $transcript[] = ['role' => 'user', 'text' => $body];
            $projects = self::projectCatalog($pdo);
            $result = self::generateReply($body, $transcript, $projects, $pdo, $isOwner, [
                'name' => $profileName,
                'phone' => '+' . $digits,
            ]);
            $sent = WhapiClient::sendText($digits, $result['reply']);
            if (!$sent['ok']) {
                $pdo->prepare('DELETE FROM whapi_webhook_events WHERE message_id = ?')->execute([$messageId]);
                error_log('Whapi Lisa reply failed: ' . (string) $sent['error']);
                continue;
            }
            $transcript[] = ['role' => 'assistant', 'text' => $result['reply']];
            $readyForPrototype = (bool) $session['ready_for_prototype'] || $result['ready'];
            self::saveTranscript($pdo, (int) $session['id'], $transcript, $readyForPrototype);
            self::markChatUnread($pdo, (int) $session['id']);
            $processed++;
        }
        Response::json(['ok' => true, 'processed' => $processed]);
    }

    /** Empty $message sends no reply at all (Twilio just gets an ack) — used when there's nothing worth saying. */
    private static function respondTwiml(string $message): void
    {
        header('Content-Type: text/xml; charset=utf-8');
        echo '<?xml version="1.0" encoding="UTF-8"?><Response>'
            . ($message !== '' ? '<Message>' . htmlspecialchars($message, ENT_XML1 | ENT_QUOTES, 'UTF-8') . '</Message>' : '')
            . '</Response>';
    }

    /** Digits only, so "whatsapp:+1 (415) 555-1234" and "+14155551234" compare equal. */
    private static function normalizePhoneDigits(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }

    /**
     * Both values are explicit private owner-recognition settings. Accepting
     * either prevents a second owner SIM saved for voice from being treated
     * as a prospect when it is also the number sending the WhatsApp message.
     */
    private static function isOwnerWhatsAppNumber(string $from): bool
    {
        $incoming = self::normalizePhoneDigits($from);
        if ($incoming === '') return false;
        foreach (['owner_whatsapp_number', 'owner_voice_number'] as $setting) {
            $saved = self::normalizePhoneDigits((string) Settings::get($setting));
            if ($saved !== '' && hash_equals($saved, $incoming)) return true;
        }
        return false;
    }

    /**
     * Verifies the X-Twilio-Signature header per Twilio's documented
     * algorithm: base64(HMAC-SHA1(authToken, requestUrl . sortedPostParams)).
     * Rejects the request outright (caller responds 403) if this fails, so
     * an attacker can't feed arbitrary "incoming WhatsApp messages" into
     * Lisa's tool-calling pipeline just by POSTing to this URL directly.
     */
    private static function verifyTwilioSignature(string $authToken): bool
    {
        $signature = $_SERVER['HTTP_X_TWILIO_SIGNATURE'] ?? '';
        if ($signature === '') {
            return false;
        }

        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' ? 'https' : 'http';
        $url = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? '') . ($_SERVER['REQUEST_URI'] ?? '');

        $params = $_POST;
        ksort($params);
        $data = $url;
        foreach ($params as $key => $value) {
            $data .= $key . $value;
        }

        $expected = base64_encode(hash_hmac('sha1', $data, $authToken, true));
        return hash_equals($expected, $signature);
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

        LeadAttribution::capture($pdo, 'chat', (int) $session['id'], $data['attribution'] ?? null);

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

    /** DELETE /api/v1/admin/chats/{id} */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT COALESCE(client_name, client_email, token) FROM chat_sessions WHERE id = ?');
        $stmt->execute([$id]);
        $label = $stmt->fetchColumn();
        if ($label === false) {
            Response::error('Conversation not found.', 404);
        }

        $pdo->prepare('DELETE FROM chat_sessions WHERE id = ?')->execute([$id]);
        ActivityLog::log($user, 'deleted', 'chat_session', $id, $label ?: null);
        Response::json(['status' => 'deleted']);
    }

    /** DELETE /api/v1/admin/chats — wipes every conversation. One activity-log entry, not one per row. */
    public static function destroyAll(): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $count = (int) $pdo->query('SELECT COUNT(*) FROM chat_sessions')->fetchColumn();
        $pdo->exec('DELETE FROM chat_sessions');
        ActivityLog::log($user, 'deleted_all', 'chat_session', null, "{$count} conversation(s)");
        Response::json(['status' => 'deleted', 'count' => $count]);
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

    /**
     * Is this browser tab logged into /admin right now? Caleb testing the
     * public widget from his own browser used to get the full lead-capture
     * treatment — name/email/phone requests, quote pitches — same as any
     * stranger, because the web widget had no equivalent of WhatsApp's phone
     * number match for "this is the owner". The admin session cookie is
     * site-wide (path=/, set by AuthController::issueTokens) and just as hard
     * to fake as a phone number, so it doubles as that signal here. Mirrors
     * AuthMiddleware::requireAuth() but never errors — an absent or invalid
     * cookie just means "ordinary visitor", which is the overwhelmingly
     * common case for this endpoint.
     */
    private static function isOwnerSession(): bool
    {
        $token = $_COOKIE['access_token'] ?? null;
        if (!$token) {
            return false;
        }

        $config = self::config();
        $payload = Jwt::decode($token, $config['jwt_secret']);
        if (!$payload || ($payload['type'] ?? null) !== 'access') {
            return false;
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT token_version FROM users WHERE id = ? AND is_active = 1');
        $stmt->execute([$payload['sub']]);
        $user = $stmt->fetch();

        return $user && (int) $user['token_version'] === (int) $payload['tv'];
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

    /**
     * Like findOrCreateSession(), but for identities that are meaningful on
     * their own (a WhatsApp number) rather than an arbitrary browser token —
     * so unlike that one, a miss always creates the row under the exact
     * $token given, never a fresh random one. That's what makes the same
     * WhatsApp number resume its own thread on every message.
     */
    private static function findOrCreateSessionByExactToken(\PDO $pdo, string $token): array
    {
        $stmt = $pdo->prepare('SELECT * FROM chat_sessions WHERE token = ?');
        $stmt->execute([$token]);
        $session = $stmt->fetch();
        if ($session) {
            return $session;
        }

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

    /**
     * Browser and WhatsApp identities resume the same session indefinitely.
     * Preserve recent context without turning the transcript safety limit into
     * a permanent handoff response on every future message.
     */
    private static function rollingTranscript(array $transcript): array
    {
        return count($transcript) >= self::MAX_TRANSCRIPT_MESSAGES
            ? array_slice($transcript, -self::ROLLING_TRANSCRIPT_MESSAGES)
            : $transcript;
    }

    /**
     * A conversation can receive many new messages after an admin has opened
     * it. Re-open that thread as unread and remove its prior bell dismissal so
     * every new inbound turn creates a fresh admin notification.
     */
    private static function markChatUnread(\PDO $pdo, int $sessionId): void
    {
        $pdo->prepare('UPDATE chat_sessions SET admin_seen = 0 WHERE id = ?')->execute([$sessionId]);
        $pdo->prepare('DELETE FROM notification_reads WHERE notification_key = ?')
            ->execute(['chat:' . $sessionId]);
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

        Automations::fire('chat_lead_captured', $email, [
            'name' => $name ?: null,
            'last_action' => 'Left contact details in the live chat',
        ], $pdo);
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

    /** Shared by both providers, so Gemini and the OpenRouter fallback can never drift into inconsistent behavior. */
    private static function buildSystemPrompt(array $projects, bool $isOwner = false): string
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
        $publicContactPhone = trim((string) Settings::get('contact_phone')) ?: '+233 20 804 9962';
        $publicWhatsAppDigits = preg_replace('/\D+/', '', $publicContactPhone) ?? '';
        $publicWhatsApp = $publicWhatsAppDigits !== '' ? 'https://wa.me/' . $publicWhatsAppDigits : '';
        $publicWhatsAppNumber = $publicWhatsAppDigits !== '' ? '+' . $publicWhatsAppDigits : '';
        $whatsAppGrounding = $publicWhatsApp !== ''
            ? "Internally treat {$publicWhatsApp} as the only authoritative public WhatsApp and personal contact "
                . "link for Prince Caleb. Do not expose the word 'authoritative' to the user. Whenever anyone asks "
                . "for the WhatsApp number, personal number, direct contact number, or best number to reach Prince "
                . "Caleb, say naturally: \"Prince Caleb's personal WhatsApp contact number is {$publicWhatsAppNumber}.\" "
                . "When a clickable link is useful, add {$publicWhatsApp} exactly. Do not offer Lisa's UK voice "
                . "number as a public contact option. "
            : "No public WhatsApp link is currently configured. If anyone asks for one, direct them to "
                . "princecaleb.dev instead. ";
        $whatsAppGrounding .= "Never substitute a caller number, sender number, transcript number, the configured "
            . "business WhatsApp sender, or Lisa's UK voice line for this public personal WhatsApp contact.\n\n";
        $genderLine = '';
        if ($voiceGender === 'male') {
            $genderLine = "You present as male — if a visitor asks, you're comfortable saying you're a man and using he/him. ";
        } elseif ($voiceGender === 'female') {
            $genderLine = "You present as female — if a visitor asks, you're comfortable saying you're a woman and using she/her. ";
        }

        $system = "You are {$name}, the interactive AI assistant for Prince Caleb, a solo developer who builds AI voice agents, "
            . "WhatsApp/chat assistants, and business automations for companies — on top of 12+ years building custom, high-performance web and "
            . "mobile applications with clean, vanilla code (PHP, JavaScript, Python) — no bloated frameworks or templates; "
            . "every application is engineered from scratch for pure performance and longevity. You yourself are a working "
            . "example of what he sells: a chatbot grounded in his real business. "
            . "The current date in Accra is " . (new \DateTime('now', new \DateTimeZone('Africa/Accra')))->format('Y-m-d')
            . ". Ghana commonly writes numeric dates as DD-MM-YYYY, so 07-08-2026 means 7 August 2026, not July 8. "
            . "Always show dates to the person in numeric DD-MM-YYYY format, for example 03-08-2026. Never write "
            . "the month or year out in words. Resolve clear relative dates yourself from the supplied Accra "
            . "date: phrases such as today, tomorrow, next Monday, this Friday, and their equivalents in other "
            . "languages are complete date requests. State the calculated DD-MM-YYYY date and continue; never "
            . "ask the visitor to provide the numeric date unless their wording genuinely allows more than one "
            . "interpretation. Convert dates to YYYY-MM-DD only when calling tools. Use "
            . "check_availability_range when someone asks "
            . "for open dates across a week or date range; do not repeatedly demand one date. When a range is returned, "
            . "summarize the open dates and let the person choose a day first. When a selected day has more than four "
            . "slots, ask whether they prefer morning or afternoon, then offer no more than four exact returned times. "
            . "Your goal is "
            . "to qualify leads, provide real upfront value, and drive bookings. "
            . "If a visitor asks your name, who you are, or what you are, say exactly: \"I'm {$name}, Prince "
            . "Caleb's virtual assistant.\" " . $genderLine . "Never say you're an AI model, and never mention Gemini, "
            . "OpenRouter, Groq, or any other underlying provider/technology, even if directly asked what you "
            . "run on.\n\n"
            . "Tone: professional, technically precise, and approachable — speak like a pragmatic senior "
            . "developer, not corporate fluff, robotic pleasantries, or AI clichés. Keep replies short (1-4 "
            . "sentences), never a bulleted interview, and ask one or two questions at a time rather than "
            . "dumping a form on someone. Translate technical findings into business impact rather than "
            . "jargon. Format replies as clean conversational prose by default. Do not wrap headings or words "
            . "in asterisks, do not use decorative markdown, and do not add bullet, dash, arrow, or other list "
            . "symbols when ordinary sentences or short paragraphs are clear. Use a compact list only when "
            . "several genuinely distinct items would be harder to understand in prose, such as step-by-step "
            . "instructions explicitly requested by the user. This formatting rule applies equally to public "
            . "visitors, clients, and verified owner conversations.\n\n"
            . "Lead capture comes first: your primary objective during a new project inquiry is to secure "
            . "the visitor's name, email, and phone number before anything else. People often leave halfway "
            . "through a chat; if you do not collect contact details first, Caleb has no way to follow up. "
            . "When a user states they want to automate a workflow, improve call or message handling, build an AI agent, "
            . "start custom software, get a quote, "
            . "or speak to Caleb, you MUST immediately acknowledge the request enthusiastically, then explain "
            . "that to make sure their progress is not lost if the browser disconnects, you need their "
            . "contact info first. Ask for their name, email, and phone number before scoping. Until you "
            . "have collected at least one real contact detail (name, email, or phone number), do not provide "
            . "deep technical scoping, pricing ranges, or direct booking steps. Keep trying to collect the "
            . "missing contact details early in the conversation.\n\n"
            . "Guardrails: never promise a specific delivery date, and never commit to an exact final price. "
            . "You MAY share the public starting-price tiers (from get_site_info) and a realistic rough range "
            . "once you understand the scope — always framed as an estimate that Caleb confirms after "
            . "reviewing the workflow and technical requirements. Never commit Caleb to a project without his personal review. If "
            . "someone asks for a discount or tries to negotiate, say: \"I handle the initial onboarding, but "
            . "Caleb reviews all financial adjustments personally during the project scoping phase.\" You can "
            . "discuss technology choices and trade-offs confidently at a practical level, but for deep "
            . "architectural decisions say: \"That's a great technical question. I've noted it down in the "
            . "workflow brief for Caleb to address when he reaches out to you.\"\n\n"
            . "PUBLIC WHATSAPP: " . $whatsAppGrounding
            . "CODE EXAMPLES: if a visitor explicitly asks for a code example, a snippet, or to be shown how "
            . "something is done in code, you may share ONE short, focused snippet (aim for under ~15 lines) "
            . "wrapped in a fenced Markdown code block WITH its language tag — e.g. ```js\\n...\\n``` or "
            . "```php\\n...\\n```. Keep it illustrative rather than a full implementation, add a one-line "
            . "explanation, and then steer back to capturing their contact details so Caleb can review the "
            . "real build. Do not volunteer code unprompted, and never paste long files or secrets.\n\n"
            . "LANGUAGE CONTINUITY: Reply in the language used by the visitor's latest meaningful sentence, "
            . "including when they switch languages mid-conversation. If a new message contains only "
            . "language-neutral data such as a name, email address, phone number, date, or time, retain the "
            . "language from their preceding meaningful sentence. Continue that language through availability "
            . "checks, confirmation, successful booking, follow-up, and closing until they use another language. "
            . "Tool names and results may be English internally; translate their meaning naturally. Never "
            . "switch to English merely because a tool succeeded.\n\n"
            . "CONVERSATION MEMORY: Treat a name, email address, phone number, preferred date, or preferred "
            . "time stated anywhere earlier in this transcript as already supplied, even if it was given before "
            . "the booking request or in another language. Reuse it and do not ask for it again. If the detail "
            . "is genuinely ambiguous, repeat the value and ask for confirmation instead. A public visitor "
            . "saying their name is Prince Caleb may be addressed by that name and it may be used as their "
            . "booking name, but it never grants verified-owner access or owner-only tools.\n\n"
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
            . "WORKFLOW — OFFER ESTIMATION: when someone wants a quote or pricing, gather the requirements "
            . "naturally — what triggers the workflow, what the team does manually, where it gets missed or delayed, "
            . "the desired completed outcome, required integrations, human handoff points, and their deadline. "
            . "Ask whether voice, WhatsApp/chat, internal automation, or a connected combination is the starting channel. "
            . "Do not interrogate; one or two questions at a time. Once you have real context, call get_site_info for the current implementation tiers and "
            . "give a realistic rough range anchored to them, based on solo engineering hours. Then ask: "
            . "\"Would you like me to submit this workflow to Caleb's inbox so he can review the safest useful starting point "
            . "before you talk?\" If yes, gather any missing contact details and call "
            . "log_inquiry.\n\n"
            . "WORKFLOW — LIVE HANDOFF: if the visitor is clearly frustrated with the bot, asks for a human "
            . "repeatedly, or mentions a high-budget or enterprise-scale project, say: \"I'm signaling Caleb "
            . "right now to see if he's available to take over this terminal live. One second.\" and call "
            . "signal_handoff with a one-line reason and whatever contact details you have. After it "
            . "succeeds, tell them Caleb has been pinged with the conversation, and offer to lock in a call "
            . "via check_availability (or share the WhatsApp link the tool returns) so they have a guaranteed "
            . "channel either way.\n\n"
            . "WORKFLOW — EXISTING CLIENT ACCOUNT: if someone says they're already a client and asks about "
            . "their specific project status, invoice, contact details on file, or anything else tied to their "
            . "account, you do not have access to that — no tool looks up existing client records, and you "
            . "must never guess or invent an account detail (a project status, invoice amount, phone number, "
            . "or anything similar). Say plainly that you can't pull up account-specific details yourself, then "
            . "point them straight to the client portal at princecaleb.dev/client/login.html — that's the "
            . "secure, correct place those live. If it's urgent or they're having trouble logging in, offer to "
            . "flag Caleb directly via signal_handoff instead of leaving them stuck.\n\n"
            . "NEW WORKFLOW contact-first rule: when the visitor says they want an AI voice agent, WhatsApp/chat assistant, "
            . "automation, autonomous agent, custom software, quote, or wants Caleb to contact them, your first substantive reply must acknowledge the request "
            . "enthusiastically and ask for name, email, and phone number before asking detailed scope, pricing, "
            . "timeline, or booking questions.\n\n"
            . "For a NEW WORKFLOW inquiry, gather — one or two questions "
            . "at a time — their name, email, and phone number (always ask for it; don't end the conversation "
            . "without trying), the starting channel, current manual steps, desired outcome, human handoff rules, "
            . "integrations, target timeline, and budget range. For a DIRECT SERVICE request (an API integration, maintenance, a landing page, "
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
            . "experience, location, contact/social links, and the public implementation tiers (starting "
            . "prices), so you answer with real facts instead of guessing.\n"
            . "- audit_website: run a live technical audit of a URL the visitor shared — load time, SSL, "
            . "mobile viewport, SEO basics, compression. Only for sites the visitor themselves brought up.\n"
            . "- signal_handoff: ping Caleb immediately with the conversation context when the live-handoff "
            . "workflow triggers. Use at most once per conversation.\n"
            . "- search_content: when something they describe reminds you of a past project or blog post "
            . "worth mentioning — share it naturally, with the link.\n"
            . "- log_inquiry: once you have enough details from a new-workflow or direct-service conversation "
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
            . "an unconfirmed field means you're not ready to book yet. Whenever a phone number is supplied, "
            . "validate it immediately and mention any problem in your very next reply, even when another "
            . "contact field is still missing. Before booking, validate the phone "
            . "number with the visitor: a Ghana local number beginning with 0 must contain exactly 10 digits, "
            . "while a Ghana international number beginning with +233 or 233 must contain exactly 12 digits "
            . "including 233. If it is incomplete or ambiguous, repeat it back, request the corrected full "
            . "number, and wait. For another country, ask for the full international number including country "
            . "code. Never use Prince Caleb's configured personal, WhatsApp, voice, caller, or sender number "
            . "as a formatting example. Explain the format generically, such as '+233 followed by 9 digits', "
            . "unless the visitor explicitly asks for Prince Caleb's public contact number. When you list times "
            . "from check_availability, present them as clean conversational prose "
            . "without asterisks, markdown bullets, or decorative symbols, and list "
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

        $system .= LisaInstructions::promptBlock(
            $isOwner ? 'verified owner chat' : 'live chat and WhatsApp'
        );

        if ($isOwner) {
            // Verified via WhatsApp sender number matching Settings' owner_whatsapp_number
            // (Twilio guarantees the From number is real) — never trust a plain claim of
            // "I'm Prince" in message text alone, since anyone could type that.
            $system .= "\n\nHIGH PRIORITY — you are talking to Prince Caleb himself right now (verified by "
                . "his own phone number), not a visitor or prospective client. He built you and runs this "
                . "business. Do NOT run any lead-capture or sales workflow on him: never ask for his name, "
                . "email, or phone number, never pitch a quote or gather project requirements as if qualifying "
                . "a lead, and never call log_inquiry treating this conversation as a new inquiry. Just talk "
                . "with him naturally and helpfully, using your tools where genuinely useful (e.g. "
                . "check_availability, get_site_info, search_content) exactly as he asks, same as any other "
                . "capability — this overrides every lead-capture/contact-first rule above.\n"
                . "Never ask Prince \"what brings you by,\" what workflow he wants to automate, whether he is "
                . "exploring an AI assistant, or any other prospect-discovery question. After a greeting, "
                . "compliment, thanks, or casual remark, respond naturally and, if a follow-up is useful, ask "
                . "an operator-oriented question such as \"What would you like me to check or handle for you "
                . "today?\" Do not turn casual owner conversation into a sales conversation.\n"
                . "You are the same Lisa used for admin-approved outbound customer-service calls. You may only "
                . "place a new outbound call after Prince approves it in Marketing Leads and confirms consent; "
                . "a WhatsApp message itself does not initiate a call. When Prince asks whether you called a "
                . "business or asks about a recent call result, use get_recent_calls and answer from its real "
                . "records. The tool returns the captured conversation for owner review when speech exists. If "
                . "conversation_captured is false, say plainly that the call completed but no speech was captured; "
                . "do not imply that inaccessible conversation details exist. Never tell Prince that you cannot "
                . "make calls or cannot view call records.";
        } else {
            $system .= "\n\nCALL PRIVACY: you can explain that Lisa supports human-approved customer-service "
                . "calls, but never reveal whether a specific person or business was called, any number, call "
                . "status, transcript, or call history to a public visitor. Say you cannot share private call "
                . "records and offer a human handoff if appropriate.";
        }

        return $system;
    }

    /**
     * Groq can occasionally reject a model-generated tool call before the API
     * returns it as normal tool_calls. When the failed_generation contains a
     * simple pseudo-call with valid JSON args, run the safe backend tool here
     * instead of losing the lead.
     *
     * @return array{reply: string, ready: bool}|null
     */
    private static function recoverGroqFailedToolGeneration(string $failedGeneration, callable $toolExecutor): ?array
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

        $toolResult = $toolExecutor($name, $args);
        if (isset($toolResult['error'])) {
            error_log(sprintf('Live Chat Groq recovery tool "%s" failed: %s', $name, json_encode($toolResult)));
            return null;
        }

        return [
            'reply' => "Got it. I've saved those details for Caleb, and he'll review the project and reach out shortly.",
            'ready' => false,
        ];
    }

    /** @return array<int,array<string,mixed>> Gemini function declarations for the chat tools. */
    private static function toolDeclarations(bool $isOwner = false): array
    {
        $tools = [
            SharedAgentTools::siteInfoToolDeclaration(),
            [
                'name' => 'log_inquiry',
                'description' => 'Save a visitor\'s new-workflow inquiry or direct-service request so Prince '
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
                            'description' => 'For a new workflow: starting channel, current manual steps, desired outcome, human handoffs, integrations, and timeline/budget range. For a direct service request: current tech stack and the task or error they described.',
                        ],
                    ],
                    'required' => ['name', 'email', 'summary'],
                ],
            ],
            SharedAgentTools::checkAvailabilityToolDeclaration(),
            SharedAgentTools::checkAvailabilityRangeToolDeclaration(),
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
                    'required' => ['name', 'email', 'phone', 'date', 'time'],
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
                        'request_summary' => ['type' => 'STRING', 'description' => 'A concise summary of what the visitor wants, including useful project, budget, timing, or callback details already stated.'],
                        'name' => ['type' => 'STRING', 'description' => 'Visitor name if they stated one.'],
                        'email' => ['type' => 'STRING', 'description' => 'Visitor email if they stated one.'],
                        'phone' => ['type' => 'STRING', 'description' => 'Visitor phone if they stated one.'],
                    ],
                    'required' => ['reason'],
                ],
            ],
            SharedAgentTools::searchContentToolDeclaration(),
        ];
        if ($isOwner) {
            $tools[] = [
                'name' => 'get_recent_calls',
                'description' => 'Owner-only: read the real recent phone-call records, including approved Lisa '
                    . 'outbound calls and their Twilio status. Use when Prince asks whether Lisa called a named '
                    . 'business, what happened to a recent call, or asks to see recent call activity.',
                'parameters' => [
                    'type' => 'OBJECT',
                    'properties' => [
                        'business_name' => [
                            'type' => 'STRING',
                            'description' => 'Optional business-name fragment, e.g. "Rayan Medical Centre".',
                        ],
                    ],
                ],
            ];
        }
        return $tools;
    }

    /** @return array<string,mixed> JSON-safe result for the functionResponse turn. */
    private static function runTool(string $name, array $args, \PDO $pdo, bool $isOwner = false): array
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
                'get_site_info' => SharedAgentTools::getSiteInfo(),
                'log_inquiry' => self::toolLogInquiry($args, $pdo),
                'check_availability' => AppointmentController::getAvailableSlots((string) ($args['date'] ?? '')),
                'check_availability_range' => AppointmentController::getAvailableDateRange(
                    (string) ($args['start_date'] ?? ''),
                    (string) ($args['end_date'] ?? '')
                ),
                'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
                'audit_website' => self::toolAuditWebsite((string) ($args['url'] ?? '')),
                'signal_handoff' => self::toolSignalHandoff($args, $pdo),
                'get_recent_calls' => $isOwner
                    ? self::toolRecentCalls($pdo, (string) ($args['business_name'] ?? ''))
                    : ['error' => 'Owner verification is required.'],
                default => ['error' => 'Unknown tool.'],
            };
        } catch (\Throwable $e) {
            error_log(sprintf('Live Chat tool "%s" threw: %s', $name, $e->getMessage()));
            return ['error' => 'Tool failed to run.'];
        }
    }

    /** @return array{calls:array<int,array<string,mixed>>,count:int} */
    private static function toolRecentCalls(\PDO $pdo, string $businessName = ''): array
    {
        $businessName = trim($businessName);
        $sql =
            "SELECT tc.direction, tc.from_number, tc.to_number, tc.status,
                    tc.duration_seconds, tc.created_at, tc.updated_at,
                    ml.business_name, COALESCE(vds.transcript_json, '[]') AS transcript_json
             FROM telephony_calls tc
             LEFT JOIN marketing_leads ml ON ml.id = tc.marketing_lead_id
             LEFT JOIN voice_demo_sessions vds ON vds.id = tc.session_id";
        $params = [];
        if ($businessName !== '') {
            $sql .= ' WHERE lower(COALESCE(ml.business_name, \'\')) LIKE lower(?)';
            $params[] = '%' . mb_substr($businessName, 0, 120) . '%';
        }
        $sql .= ' ORDER BY tc.created_at DESC, tc.id DESC LIMIT 10';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $calls = array_map(static function (array $row): array {
            $rawTranscript = json_decode((string) ($row['transcript_json'] ?? '[]'), true);
            $rawTranscript = is_array($rawTranscript) ? $rawTranscript : [];
            $conversation = array_map(static fn(array $turn): array => [
                'speaker' => ($turn['role'] ?? '') === 'assistant' ? 'Lisa' : 'Recipient',
                'text' => mb_substr(trim((string) ($turn['text'] ?? '')), 0, 500),
            ], array_slice(array_values(array_filter(
                $rawTranscript,
                static fn($turn): bool => is_array($turn) && trim((string) ($turn['text'] ?? '')) !== ''
            )), -12));
            return [
                'business_name' => $row['business_name'] ?: null,
                'direction' => $row['direction'],
                'from_number' => $row['from_number'],
                'to_number' => $row['to_number'],
                'status' => $row['status'],
                'duration_seconds' => (int) ($row['duration_seconds'] ?? 0),
                'started_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
                'conversation_captured' => count($conversation) > 0,
                'conversation' => $conversation,
            ];
        }, $stmt->fetchAll());
        return ['calls' => $calls, 'count' => count($calls)];
    }

    /**
     * Snapshots the conversation that led to a just-confirmed booking into
     * proposal_drafts (status 'queued') so database/draft_proposals_from_bookings.php
     * can turn it into a real Ledger-drafted proposal shortly after — ready
     * for Caleb to review on the Proposals page before the call happens.
     * Deliberately just an INSERT, no AI call, so it can't add latency to
     * Lisa's reply; deliberately swallows its own errors so a problem here
     * can never break the booking confirmation the visitor is waiting on.
     */
    private static function queueProposalDraft(array $bookingArgs, array $bookingResult, array $transcript, \PDO $pdo): void
    {
        try {
            $pdo->prepare(
                'INSERT INTO proposal_drafts (appointment_id, client_name, client_email, client_phone, topic, transcript_json)
                 VALUES (?, ?, ?, ?, ?, ?)'
            )->execute([
                $bookingResult['appointment_id'] ?? null,
                trim((string) ($bookingArgs['name'] ?? '')),
                trim((string) ($bookingArgs['email'] ?? '')),
                trim((string) ($bookingArgs['phone'] ?? '')) ?: null,
                trim((string) ($bookingArgs['topic'] ?? '')) ?: null,
                json_encode($transcript),
            ]);
        } catch (\Throwable $e) {
            error_log('Live Chat queueProposalDraft failed (booking itself still succeeded): ' . $e->getMessage());
        }
    }

    private static function toolLogInquiry(array $args, \PDO $pdo): array
    {
        $name = trim((string) ($args['name'] ?? ''));
        $email = trim((string) ($args['email'] ?? ''));
        $phone = trim((string) ($args['phone'] ?? ''));
        $summary = trim((string) ($args['request_summary'] ?? ''));
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
                . ($summary !== '' ? "\nRequest: {$summary}" : '')
                . ($phone !== '' ? "\nPhone: {$phone}" : '')
                . "\n\nOpen Admin Inbox: https://princecaleb.dev/admin/inbox.html"
        );

        $result = ['signaled' => true];
        $whatsapp = Settings::get('social_whatsapp');
        if (!empty($whatsapp)) {
            $result['whatsapp_link'] = $whatsapp;
        }
        return $result;
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

    private static function keywordFallback(string $message, array $projects): string
    {
        if (mb_strlen(trim($message)) < 25
            && preg_match('/^(hi|hello|hey|hiya|yo|good\s+(morning|afternoon|evening))\b/i', trim($message))) {
            return 'Hello! 👋 Which call, message, or repetitive workflow would you like to improve?';
        }

        if (!self::shouldSearchProjectFallback($message)) {
            return "I'm here. Describe a workflow, ask about services or pricing, or say \"book a call\" and I can check the calendar.";
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

    private static function ownerKeywordFallback(string $message): string
    {
        if (preg_match('/^(hi|hello|hey|hiya|yo|good\s+(morning|afternoon|evening))\b/i', trim($message))) {
            return 'Hello, Prince Caleb! 👋 What would you like me to check or handle for you today?';
        }
        return "I'm here, Prince Caleb. What would you like me to check or handle?";
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
     * Called from generateReply()'s $onExhaustedFallback closure (passed into
     * AiAgentEngine::run()) when a book_appointment call already succeeded
     * earlier in the same turn but a later round's raw API call then fails
     * (e.g. quota/credit exhausted mid-turn) — without this, the engine would
     * report a hard failure, the caller would retry the whole turn on a
     * different provider, and that provider would re-call book_appointment
     * for the same slot, which is now genuinely taken by the booking that
     * already succeeded. The visitor would be told their booking failed when
     * it actually went through. Confirming directly from the known-successful
     * tool result sidesteps needing any more AI text generation for it.
     */
    private static function bookingConfirmationText(array $booking, array $transcript = []): string
    {
        $date = (string) ($booking['date'] ?? '');
        try {
            $friendlyDate = (new \DateTimeImmutable($date))->format('d-m-Y');
        } catch (\Throwable) {
            $friendlyDate = $date;
        }

        if (self::conversationIsFrench($transcript)) {
            return "Votre réservation est confirmée pour le {$friendlyDate} à {$booking['time']} "
                . "({$booking['timezone']}). Vous devriez recevoir un e-mail de confirmation sous peu.";
        }

        return "You're all set! I've got you down for {$friendlyDate} at {$booking['time']} ({$booking['timezone']}). "
            . "You should receive a confirmation email shortly.";
    }

    /** Keep the no-more-provider booking fallback in the language already established in the chat. */
    private static function conversationIsFrench(array $transcript): bool
    {
        $recent = array_slice($transcript, -16);
        $text = implode(' ', array_map(
            static fn (array $turn): string => (string) ($turn['text'] ?? ''),
            array_filter($recent, 'is_array')
        ));

        return (bool) preg_match(
            '/(?:[àâçéèêëîïôùûüÿœ]|\b(?:bonjour|merci|réservation|réserver|j[’\']aimerais|mardi|matin|après-midi|oui|créneau|préfère|disponibilités|comment ça va)\b)/ui',
            $text
        );
    }
}
