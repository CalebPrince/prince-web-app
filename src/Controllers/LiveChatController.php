<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\Database;
use App\Support\Response;

/**
 * Live Chat: a requirements-gathering conversation that can generate an HTML
 * concept prototype for the visitor to approve or comment on. Feedback flows
 * into the inquiries inbox (and its Slack webhook queue) plus a dedicated
 * chat_sessions record the admin panel lists under "Chat Leads".
 *
 * Prototype generation needs GEMINI_API_KEY; without it the chat still works
 * via AiChatController-style keyword fallback, minus the prototype step.
 */
class LiveChatController
{
    private const MAX_TRANSCRIPT_MESSAGES = 40;

    /** POST /api/v1/chat/message — body: {token?, message} */
    public static function message(): void
    {
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

        if (!empty($config['gemini_api_key'])) {
            $reply = self::chatWithGemini($config['gemini_api_key'], $transcript, $projects);
            if ($reply !== null) {
                $mode = 'ai';
            }
        }
        if ($reply === null) {
            $reply = self::keywordFallback($message, $projects);
        }

        $transcript[] = ['role' => 'assistant', 'text' => $reply];
        self::saveTranscript($pdo, (int) $session['id'], $transcript);

        $userTurns = count(array_filter($transcript, fn($m) => $m['role'] === 'user'));

        Response::json([
            'token' => $session['token'],
            'reply' => $reply,
            'mode' => $mode,
            // The widget shows "Build my prototype" once the AI has enough context.
            'can_prototype' => $mode === 'ai' && $userTurns >= 2,
        ]);
    }

    /** POST /api/v1/chat/prototype — body: {token} */
    public static function generatePrototype(): void
    {
        $config = self::config();
        RateLimitMiddleware::enforce('prototype', 5);

        if (empty($config['gemini_api_key'])) {
            Response::error('Prototype generation is not available right now — please use the contact form.', 503);
        }

        $pdo = Database::get();
        $session = self::requireSession($pdo, self::tokenFromBody());
        $transcript = json_decode($session['transcript_json'], true) ?: [];
        if (count($transcript) < 2) {
            Response::error('Tell me a bit about your project first.', 422);
        }

        $html = self::prototypeWithGemini($config['gemini_api_key'], $transcript);
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

    /** GET /api/v1/admin/chats — admin-only list of chat leads */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            "SELECT id, token, transcript_json, prototype_status, client_comment, client_name,
                    client_email, admin_seen, created_at, updated_at,
                    CASE WHEN prototype_html IS NULL THEN 0 ELSE 1 END AS has_prototype
             FROM chat_sessions
             WHERE transcript_json != '[]'
             ORDER BY updated_at DESC"
        )->fetchAll();

        foreach ($rows as &$row) {
            $row['transcript'] = json_decode($row['transcript_json'], true) ?: [];
            unset($row['transcript_json']);
        }
        Response::json($rows);
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
        return ['id' => (int) $pdo->lastInsertId(), 'token' => $token, 'transcript_json' => '[]', 'prototype_status' => 'none'];
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

    private static function saveTranscript(\PDO $pdo, int $sessionId, array $transcript): void
    {
        $pdo->prepare("UPDATE chat_sessions SET transcript_json = ?, updated_at = datetime('now') WHERE id = ?")
            ->execute([json_encode($transcript), $sessionId]);
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

    private static function chatWithGemini(string $apiKey, array $transcript, array $projects): ?string
    {
        $catalog = implode("\n", array_map(
            fn($p) => "- {$p['title']} ({$p['tag_names']}): {$p['summary']}",
            $projects
        ));

        $system = "You are the live-chat assistant on Prince Caleb's web & mobile development portfolio. "
            . "Your job: understand what the visitor wants built so a concept prototype can be generated. "
            . "Find out (one short, friendly question at a time): what kind of site/app, its purpose and audience, "
            . "the key pages or features, and any style/color preferences. Keep every reply under 80 words. "
            . "After you understand the basics (usually 2-3 exchanges), tell them to press the "
            . "\"Build my prototype\" button below the chat to see a live concept. "
            . "If relevant, you may mention one of these case studies:\n" . $catalog;

        $contents = [];
        foreach (array_slice($transcript, -12) as $turn) {
            $contents[] = [
                'role' => $turn['role'] === 'user' ? 'user' : 'model',
                'parts' => [['text' => $turn['text']]],
            ];
        }

        $body = json_encode([
            'system_instruction' => ['parts' => [['text' => $system]]],
            'contents' => $contents,
        ]);

        return self::callGemini($apiKey, $body, 15);
    }

    private static function prototypeWithGemini(string $apiKey, array $transcript): ?string
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

        $body = json_encode(['contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]]]);
        $html = self::callGemini($apiKey, $body, 45);
        if ($html === null) {
            return null;
        }

        // Strip markdown fences if the model added them, then defang scripts.
        $html = preg_replace('/^```(?:html)?\s*|```\s*$/m', '', trim($html));
        $html = preg_replace('#<script\b[^>]*>.*?</script>#is', '', $html);
        $html = preg_replace('/\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|\S+)/i', '', $html);

        return trim($html) !== '' ? $html : null;
    }

    private static function callGemini(string $apiKey, string $body, int $timeout): ?string
    {
        $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' . $apiKey;
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
        curl_close($ch);

        if ($response === false || $status !== 200) {
            return null;
        }
        $decoded = json_decode($response, true);
        return $decoded['candidates'][0]['content']['parts'][0]['text'] ?? null;
    }

    private static function keywordFallback(string $message, array $projects): string
    {
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
}
