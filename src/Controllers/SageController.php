<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\ActivityLog;
use App\Support\AiAgentEngine;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * Sage: a public marketing-frameworks sparring partner, not a lead-gen or
 * client-facing sales agent. Visitors describe a real marketing problem
 * (an offer, a channel choice, a stuck funnel, a thumbnail/headline) and
 * get it worked through the lens of well-known marketing frameworks —
 * Hormozi-style offer construction, Brunson-style funnel/value-ladder
 * thinking, Ogilvy-style headline/copy discipline, Cialdini's influence
 * principles, Godin-style positioning and permission marketing — combined,
 * not name-dropped. Public and rate limited in place of admin auth (like
 * Lisa's live chat), unlike ScoutController which this was otherwise modeled
 * on. Every conversation is persisted to sage_chats (mirrors chat_sessions)
 * so Caleb can review who's using it and what they asked, under Admin →
 * Sage Chats — a name/email is only ever recorded if a visitor volunteers
 * it in the conversation itself; Sage never asks for it.
 */
class SageController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;

    /**
     * POST /api/v1/agents/sage/chat — body: {token?, message, transcript: [{role,text}, ...]}.
     * The transcript is replayed by the browser each turn (same as Scout/
     * Beacon/Nurturer's chat()); the token identifies the sage_chats row so
     * the same conversation keeps accumulating there across turns.
     */
    public static function chat(): void
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        $config = appConfig();
        RateLimitMiddleware::enforce('sage_chat', $config['ai_rate_limit']);

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
        $session = self::findOrCreateSession($pdo, is_string($data['token'] ?? null) ? $data['token'] : null);

        // Recognizes Prince Caleb without requiring auth for everyone else —
        // same site-wide admin session cookie LiveChatController checks for
        // Lisa. If it's him, mark the session so the admin Sage Chats list
        // shows "Prince Caleb" instead of "anonymous visitor" too.
        $owner = AuthMiddleware::tryAuth();
        // users has no display-name column (single-admin system, email-only) —
        // "Prince Caleb" is the one real admin this app has.
        if ($owner && empty($session['client_name'])) {
            $pdo->prepare('UPDATE sage_chats SET client_name = ? WHERE id = ?')->execute(['Prince Caleb', $session['id']]);
            $session['client_name'] = 'Prince Caleb';
        }

        $result = AiAgentEngine::run(
            self::buildChatSystemPrompt($owner !== null),
            [
                SharedAgentTools::siteInfoToolDeclaration(),
                SharedAgentTools::searchContentToolDeclaration(),
                self::logContactToolDeclaration(),
            ],
            fn(string $name, array $args) => match ($name) {
                'get_site_info' => SharedAgentTools::getSiteInfo(),
                'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
                'log_contact' => self::logContact($pdo, (int) $session['id'], $args),
                default => ['error' => 'Unknown tool.'],
            },
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        $reply = SharedAgentTools::stripMarkdown($result['reply']);
        $transcript[] = ['role' => 'agent', 'text' => $reply];
        $pdo->prepare(
            "UPDATE sage_chats SET transcript_json = ?, admin_seen = 0, updated_at = datetime('now') WHERE id = ?"
        )->execute([json_encode($transcript), $session['id']]);

        Response::json(['reply' => $reply, 'token' => $session['token']]);
    }

    /**
     * POST /api/v1/admin/agents/sage/chat — body: {message, transcript: [{role,text}, ...]}.
     * The admin-console counterpart to chat(), same "Talk to Agents" pattern as
     * Danielle/Arch/Scout/etc: stateless (transcript replayed each turn, no
     * sage_chats row) and no rate limit since it's behind admin auth already.
     * Always treats the caller as Caleb — this route only runs inside his own
     * logged-in session, never anonymous — and skips log_contact, which only
     * makes sense for an actual visitor.
     */
    public static function adminChat(): void
    {
        AuthMiddleware::requireAuth();

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
            self::buildChatSystemPrompt(true),
            [
                SharedAgentTools::siteInfoToolDeclaration(),
                SharedAgentTools::searchContentToolDeclaration(),
            ],
            fn(string $name, array $args) => match ($name) {
                'get_site_info' => SharedAgentTools::getSiteInfo(),
                'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
                default => ['error' => 'Unknown tool.'],
            },
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        Response::json(['reply' => SharedAgentTools::stripMarkdown($result['reply'])]);
    }

    /** @return array{id:int,token:string,client_name:?string,client_email:?string} */
    private static function findOrCreateSession(\PDO $pdo, ?string $token): array
    {
        if ($token) {
            $stmt = $pdo->prepare('SELECT id, token, client_name, client_email FROM sage_chats WHERE token = ?');
            $stmt->execute([$token]);
            $row = $stmt->fetch();
            if ($row) {
                return $row;
            }
        }
        $token = bin2hex(random_bytes(16));
        $pdo->prepare('INSERT INTO sage_chats (token) VALUES (?)')->execute([$token]);
        return ['id' => (int) $pdo->lastInsertId(), 'token' => $token, 'client_name' => null, 'client_email' => null];
    }

    private static function logContactToolDeclaration(): array
    {
        return [
            'name' => 'log_contact',
            'description' => 'Record a visitor\'s name and/or email ONLY when they volunteer it themselves in the '
                . 'conversation (e.g. signing off a message, or giving it when asked a clarifying question that '
                . 'happens to surface it). Never ask for this directly — Sage is not a lead-gen agent. This is purely '
                . 'so a real name shows up in place of "anonymous visitor" if one is naturally given.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'name' => ['type' => 'STRING', 'description' => 'The visitor\'s name, if given.'],
                    'email' => ['type' => 'STRING', 'description' => 'The visitor\'s email, if given.'],
                ],
            ],
        ];
    }

    private static function logContact(\PDO $pdo, int $sessionId, array $args): array
    {
        $name = trim((string) ($args['name'] ?? ''));
        $email = trim((string) ($args['email'] ?? ''));
        $validEmail = $email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL);
        if ($name === '' && !$validEmail) {
            return ['status' => 'nothing to record'];
        }
        $pdo->prepare('UPDATE sage_chats SET client_name = COALESCE(?, client_name), client_email = COALESCE(?, client_email) WHERE id = ?')
            ->execute([$name !== '' ? $name : null, $validEmail ? $email : null, $sessionId]);
        return ['status' => 'recorded'];
    }

    /**
     * Cold-outreach email pitch for the Marketing Lead Outreach Engine, run
     * through Sage's real persona, tools, and AiAgentEngine instead of a
     * separate prompt that only imitated her voice ("draft it the way Sage
     * would"). Subject/body only — MarketingLeadController::draftPitch()
     * still appends the demo link, case study, transparency line, and
     * signature; none of that is Sage's voice, it's fixed factual copy that
     * must never vary between drafts.
     */
    public static function draftOutreachPitch(string $businessName, string $findingsContext): ?array
    {
        $task = "Draft the BODY of a short, honest cold outreach email from Prince Caleb to a business called "
            . "\"{$businessName}\". This is a one-shot drafting task, not a conversation — do not ask a "
            . "clarifying question, just produce the best draft you can from what's given below.\n\n"
            . "{$findingsContext}\n\n"
            . "Structure: lead with one useful, specific observation tied to what's actually true above. Then use "
            . "1-2 sentences to show the practical improvement or free private walkthrough being offered, followed "
            . "by a short \"here's how I can help\" offer mentioning relevant services in general terms (AI voice "
            . "agents that answer business calls, WhatsApp/chat assistants, workflow automation, and connected "
            . "booking or follow-up systems). Mention custom web or mobile engineering only when the verified "
            . "findings make that foundation relevant WITHOUT claiming specific problems that weren't verified "
            . "above, then a low-pressure closing line inviting a reply.\n\n"
            . "Rules: 4-6 short sentences total, value-first, friendly and specific, never salesy or hyperbolic, "
            . "no invented statistics, no false urgency, no claims of financial harm or lost business you can't "
            . "verify. Do NOT include a sign-off or any contact details — those are appended separately.\n\n"
            . "Respond as JSON only: {\"subject\": \"...\", \"body\": \"...\"} — no markdown fences, no commentary.";

        $pdo = Database::get();
        $result = AiAgentEngine::run(
            self::buildChatSystemPrompt(false),
            [
                SharedAgentTools::siteInfoToolDeclaration(),
                SharedAgentTools::searchContentToolDeclaration(),
            ],
            fn(string $name, array $args) => match ($name) {
                'get_site_info' => SharedAgentTools::getSiteInfo(),
                'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
                default => ['error' => 'Unknown tool.'],
            },
            [['role' => 'user', 'text' => $task]]
        );

        $text = $result['reply'] ?? null;
        if ($text === null) {
            error_log('Sage outreach pitch: all configured AI providers failed.');
            return null;
        }

        $text = trim(preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $text));
        $parsed = json_decode($text, true);
        if (!is_array($parsed) || empty($parsed['subject']) || empty($parsed['body'])) {
            error_log('Sage outreach pitch: could not parse JSON from model output: ' . substr($text, 0, 800));
            return null;
        }

        return ['subject' => (string) $parsed['subject'], 'body' => (string) $parsed['body']];
    }

    private static function buildChatSystemPrompt(bool $isOwner = false): string
    {
        $name = Settings::get('sage_assistant_name') ?: 'Sage';
        $genderLine = self::genderLine((string) Settings::get('sage_voice_gender'));
        $ownerLine = $isOwner
            ? " You know who you're talking to right now: this is Prince Caleb himself, logged into his own admin "
                . "session, not an anonymous visitor — talk to him like the specialist on his own team that you are, "
                . "not like a stranger you're meeting for the first time. He may be testing you, planning site copy, "
                . "or working through a real problem of his own; either is fine."
            : '';

        return "You are {$name}, a marketing-frameworks sparring partner on Prince Caleb's AI team — Prince Caleb "
            . "is a solo developer who builds AI voice agents, chatbots, and business automations, and runs "
            . "princecaleb.dev.{$genderLine}{$ownerLine}\n\n"
            . "Visitors bring you a real marketing problem — an offer that isn't converting, a channel choice "
            . "(content vs. outbound), a stuck funnel, a headline or thumbnail, a pricing or positioning question — "
            . "and you work it through the combined lens of well-known marketing frameworks: Alex Hormozi's offer "
            . "construction (value equation, guarantees, scarcity done honestly), Russell Brunson's funnel and "
            . "value-ladder thinking, David Ogilvy's headline and copy discipline (clarity and a real reason to "
            . "believe over cleverness), Robert Cialdini's principles of influence (reciprocity, social proof, "
            . "authority, scarcity, consistency, liking — used ethically, never manipulatively), and Seth Godin's "
            . "positioning, permission marketing, and \"smallest viable audience\" thinking. Blend whichever "
            . "framework actually fits the problem instead of naming all of them every time — name the ones you're "
            . "drawing on only when it clarifies the advice.\n\n"
            . "You have get_site_info (Prince Caleb's real bio, services, and tech stack) and search_content (his "
            . "real past projects/blog posts) — you are not Prince Caleb's salesperson, but if a visitor's problem "
            . "is genuinely something an AI agent, chatbot, or automation would solve (e.g. they describe a lead "
            . "follow-up or qualification problem, not just a copywriting one), it's fair to mention that concretely "
            . "and point them to a real example, rather than forcing it into every answer. You also have log_contact "
            . "— use it only if a visitor volunteers their name or email themselves; never ask for it, you are not "
            . "collecting leads.\n\n"
            . "Be concrete and specific to what the visitor actually described — ask one clarifying question if the "
            . "problem is too vague to work with (no product/offer, no audience, no channel named), otherwise give "
            . "sharp, usable advice over a long generic list. Speak naturally and conversationally; never output "
            . "JSON unless explicitly asked. Keep the tone sharp, direct, and a little contrarian — someone who has "
            . "seen a thousand offers fail for the same three reasons — never salesy or corporate.\n\n"
            . "Above all, be brief. Visitors have said you talk too much — cut the throat-clearing, the recaps of "
            . "what they just told you, and the framework name-dropping unless it earns its place. Lead with the "
            . "answer, not a wind-up. Default to 2-4 sentences or a short punchy list; only go longer if the "
            . "problem genuinely has multiple moving parts that all need addressing. No restating the question "
            . "back, no \"great question\" filler, no closing recap of what you just said.";
    }

    /** Mirrors ScoutController::genderLine — no TTS surface writes to a client here. */
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

    /** GET /api/v1/admin/sage-chats — admin-only list, mirrors LiveChatController::adminIndex(). */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            "SELECT id, token, transcript_json, client_name, client_email, admin_seen, created_at, updated_at
             FROM sage_chats
             WHERE transcript_json != '[]'
             ORDER BY updated_at DESC"
        )->fetchAll();

        foreach ($rows as &$row) {
            $row['transcript'] = json_decode($row['transcript_json'], true) ?: [];
            unset($row['transcript_json']);
        }
        Response::json($rows);
    }

    /** PATCH /api/v1/admin/sage-chats/{id} — body: {"admin_seen": true} */
    public static function markSeen(array $params): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $pdo->prepare('UPDATE sage_chats SET admin_seen = 1 WHERE id = ?')->execute([(int) $params['id']]);
        Response::json(['status' => 'updated']);
    }

    /** DELETE /api/v1/admin/sage-chats/{id} */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT COALESCE(client_name, client_email, token) FROM sage_chats WHERE id = ?');
        $stmt->execute([$id]);
        $label = $stmt->fetchColumn();
        if ($label === false) {
            Response::error('Conversation not found.', 404);
        }

        $pdo->prepare('DELETE FROM sage_chats WHERE id = ?')->execute([$id]);
        ActivityLog::log($user, 'deleted', 'sage_chat', $id, $label ?: null);
        Response::json(['status' => 'deleted']);
    }

    /** DELETE /api/v1/admin/sage-chats — wipes every conversation. One activity-log entry, not one per row. */
    public static function destroyAll(): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $count = (int) $pdo->query('SELECT COUNT(*) FROM sage_chats')->fetchColumn();
        $pdo->exec('DELETE FROM sage_chats');
        ActivityLog::log($user, 'deleted_all', 'sage_chat', null, "{$count} conversation(s)");
        Response::json(['status' => 'deleted', 'count' => $count]);
    }
}
