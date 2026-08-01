<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\RateLimitMiddleware;
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
 * not name-dropped. No client data is read or written; this is pure
 * brainstorming, same spirit as ScoutController but for marketing instead
 * of tech, and public instead of admin-gated (rate limited in its place).
 */
class SageController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;

    /**
     * POST /api/v1/agents/sage/chat — body: {message, transcript: [{role,text}, ...]}.
     * Stateless: the transcript lives in the browser and is replayed each
     * turn, same as Scout/Beacon/Nurturer's chat().
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
        $result = AiAgentEngine::run(
            self::buildChatSystemPrompt(),
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

    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('sage_assistant_name') ?: 'Sage';
        $genderLine = self::genderLine((string) Settings::get('sage_voice_gender'));

        return "You are {$name}, a marketing-frameworks sparring partner on Prince Caleb's AI team — Prince Caleb "
            . "is a solo developer who builds AI voice agents, chatbots, and business automations, and runs "
            . "princecaleb.dev.{$genderLine}\n\n"
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
            . "and point them to a real example, rather than forcing it into every answer.\n\n"
            . "Be concrete and specific to what the visitor actually described — ask one clarifying question if the "
            . "problem is too vague to work with (no product/offer, no audience, no channel named), otherwise give "
            . "sharp, usable advice over a long generic list. Speak naturally and conversationally; never output "
            . "JSON unless explicitly asked. Keep the tone sharp, direct, and a little contrarian — someone who has "
            . "seen a thousand offers fail for the same three reasons — never salesy or corporate.";
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
}
