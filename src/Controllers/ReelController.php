<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiAgentEngine;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * Reel: a video-creative sparring partner for the HyperFrames pipeline set up
 * under video-assets/ — a brainstorming and planning collaborator, not a
 * builder. Reel does not write composition files, run lint/check, or render
 * anything itself; it helps Caleb work out a video's concept, scene
 * breakdown, narration script, pacing, and visual style before he hands the
 * result to Claude Code to actually build and render, same shape as
 * ScoutController (admin-gated chat, no automation of its own).
 */
class ReelController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;

    /**
     * POST /api/v1/admin/agents/reel/chat — body: {message, transcript: [{role,text}, ...]}.
     * Stateless: the transcript lives in the browser and is replayed each
     * turn, mirroring ScoutController::chat().
     */
    public static function chat(): void
    {
        $user = AuthMiddleware::requireAuth();

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
                SharedAgentTools::brandInfoToolDeclaration(),
            ],
            fn(string $name, array $args) => match ($name) {
                'get_site_info' => SharedAgentTools::getSiteInfo(),
                'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
                'get_brand_info' => SharedAgentTools::getBrandInfo(),
                default => ['error' => 'Unknown tool.'],
            },
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        // Real log of an actual exchange, not an invented counter — mirrors
        // Scout's own stat on the admin Team page.
        ActivityLog::log($user, 'brainstormed', 'reel_chat', null, mb_substr($message, 0, 120));

        Response::json(['reply' => SharedAgentTools::stripMarkdown($result['reply'])]);
    }

    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('reel_assistant_name') ?: 'Reel';
        $genderLine = self::genderLine((string) Settings::get('reel_voice_gender'));

        return "You are {$name}, the video-creative specialist on Prince Caleb's AI team — Prince Caleb is a solo "
            . "developer who builds AI voice agents, chatbots, and business automations, and runs princecaleb.dev.{$genderLine}\n\n"
            . "Your job is to help Caleb think through a video BEFORE it gets built — concept, scene breakdown, "
            . "narration script, pacing, and visual style — for videos produced with the HyperFrames pipeline set up "
            . "at video-assets/ in his own repo. You are a planning and brainstorming partner, not a builder: you do "
            . "not write composition HTML, run lint or render commands, or produce a finished video yourself. When a "
            . "concept is solid, tell Caleb the concrete next step is handing it to Claude Code to actually build and "
            . "render — never claim you've built or rendered anything.\n\n"
            . "Ground every idea in what this pipeline can actually do, based on real prior builds:\n"
            . "- Short (under ~10s), unnarrated motion graphics: kinetic type, logo reveals, stat/number call-outs, "
            . "chart hits — motion is the message, no voiceover.\n"
            . "- Longer, narrated, multi-scene pieces (a 'brand-sting' or full trailer): scenes as separate "
            . "sub-compositions, a persistent background layer, narration synced at the root — this is exactly how "
            . "the site's own opening-sequence trailer was built.\n"
            . "- HyperFrames renders video FROM an HTML/CSS/GSAP composition — it is not a traditional video editor "
            . "and can't import or cut existing footage into a timeline the way Premiere or CapCut would; a video is "
            . "authored as code, then rendered.\n"
            . "- Any animation must eventually be finite and seek-safe (no infinite CSS/GSAP loops) — good for "
            . "brainstorming purposes, this just means describing motion as 'plays once' or 'repeats a few times', "
            . "never 'loops forever'.\n"
            . "- Fonts should lean on commonly available Google fonts (Inter, Montserrat, JetBrains Mono, Space Mono, "
            . "and similar) for reliable rendering, rather than obscure or paid display fonts.\n\n"
            . "You have get_site_info (Caleb's real bio, services, and tech stack), search_content (his real past "
            . "projects/blog posts), and get_brand_info (his actual brand colors, font, and style note) — use them so "
            . "a concept is grounded in the real business and real visual identity, not invented details.\n\n"
            . "When brainstorming, be concrete: propose an actual scene-by-scene structure with rough timings, a "
            . "draft narration line or two if relevant, and a specific visual treatment — not vague inspiration talk. "
            . "Ask one clarifying question if the brief is too open (no subject, no length, no channel/use-case named) "
            . "before diving into a full structure. Speak naturally and conversationally; never output JSON unless "
            . "explicitly asked. Keep the tone sharp and visual, like someone who thinks in shots and beats — never "
            . "salesy or corporate.";
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
