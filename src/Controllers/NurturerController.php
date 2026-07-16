<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\AiAgentEngine;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * Nurturer: drafts a personalized follow-up email for a lead based on their
 * industry and last site interaction (e.g. downloaded a checklist, ran the
 * prototype generator). draft() is the AI generation step only — actual
 * sending (Resend/Postmark) and sequence scheduling happen outside this
 * app, authenticated the same way as IntegrationController (a static API
 * key as a Bearer token, since the caller is external automation, not an
 * admin session). chat() is a live conversation with Caleb himself,
 * admin-session-authed.
 *
 * Both modes run through AiAgentEngine so Nurturer can ground itself in
 * real facts (get_site_info, search_content — shared with Lisa via
 * SharedAgentTools) instead of guessing. check_availability only goes on
 * chat() — draft()'s single-shot input has no date to check against, so
 * offering that tool there would just invite the model to invent one;
 * checking a real slot only makes sense once Caleb names a date live.
 */
class NurturerController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;

    /** POST /api/v1/agents/nurturer/draft — body: {lead_name, lead_industry, last_action, sequence_number} */
    public static function draft(): void
    {
        $expectedKey = Settings::get('integration_api_key');
        $providedKey = self::bearerToken();
        if (!$expectedKey || !$providedKey || !hash_equals($expectedKey, $providedKey)) {
            Response::error('Unauthorized', 401);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $leadName = trim((string) ($data['lead_name'] ?? ''));
        $leadIndustry = trim((string) ($data['lead_industry'] ?? ''));
        $lastAction = trim((string) ($data['last_action'] ?? ''));
        $sequenceNumber = (int) ($data['sequence_number'] ?? 0);

        if ($leadName === '' || $leadIndustry === '' || $lastAction === '' || $sequenceNumber < 1) {
            Response::error('lead_name, lead_industry, last_action, and a sequence_number of at least 1 are all required.', 422);
        }

        $result = self::generateFollowUp($leadName, $leadIndustry, $lastAction, $sequenceNumber);
        if ($result === null) {
            Response::error('Could not generate a draft — check that an AI provider is configured and reachable.', 502);
        }

        Response::json($result);
    }

    /**
     * Core generation: builds the prompt, runs it through AiAgentEngine, and
     * parses the JSON contract. Shared by draft() (HTTP, which exits via
     * Response::json() and so can't be called directly from a cron) and
     * database/send_nurturer_emails.php.
     *
     * @return array{subject_line:string,email_body:string}|null null only on a hard failure
     */
    public static function generateFollowUp(string $leadName, string $leadIndustry, string $lastAction, int $sequenceNumber): ?array
    {
        $pdo = Database::get();
        $userPrompt = self::buildUserPrompt($leadName, $leadIndustry, $lastAction, $sequenceNumber);
        $result = AiAgentEngine::run(
            self::buildSystemPrompt(),
            self::draftToolDeclarations(),
            fn(string $name, array $args) => self::runTool($name, $args, $pdo),
            [['role' => 'user', 'text' => $userPrompt]]
        );
        if ($result['reply'] === null) {
            return null;
        }

        $stripped = trim(preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $result['reply']));
        $parsed = json_decode($stripped, true);
        if (!is_array($parsed) || empty($parsed['subject_line']) || empty($parsed['email_body'])) {
            error_log('Nurturer generateFollowUp: could not parse JSON from model output: ' . substr($stripped, 0, 800));
            return null;
        }

        return [
            'subject_line' => (string) $parsed['subject_line'],
            'email_body' => (string) $parsed['email_body'],
        ];
    }

    /**
     * POST /api/v1/admin/agents/nurturer/chat — body: {message, transcript: [{role,text}, ...]}.
     * A live, free-form conversation with Caleb himself (admin session), not
     * the automated draft() pipeline — no JSON contract, just Nurturer
     * talking naturally about a lead, an email in progress, or how it
     * works. Stateless: the transcript lives in the browser and is replayed
     * with each turn, same as the widget-side pattern in ai-widget.js.
     */
    public static function chat(): void
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
            self::buildChatSystemPrompt(),
            self::chatToolDeclarations(),
            fn(string $name, array $args) => self::runTool($name, $args, $pdo),
            $transcript
        );
        if ($result['reply'] === null) {
            Response::error('Could not generate a reply — check that an AI provider is configured and reachable.', 502);
        }

        Response::json(['reply' => $result['reply']]);
    }

    private static function draftToolDeclarations(): array
    {
        return [
            SharedAgentTools::siteInfoToolDeclaration(),
            SharedAgentTools::searchContentToolDeclaration(),
        ];
    }

    private static function chatToolDeclarations(): array
    {
        return [...self::draftToolDeclarations(), SharedAgentTools::checkAvailabilityToolDeclaration()];
    }

    private static function runTool(string $name, array $args, \PDO $pdo): array
    {
        return match ($name) {
            'get_site_info' => SharedAgentTools::getSiteInfo(),
            'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
            'check_availability' => AppointmentController::getAvailableSlots((string) ($args['date'] ?? '')),
            default => ['error' => 'Unknown tool.'],
        };
    }

    private static function buildSystemPrompt(): string
    {
        $name = Settings::get('nurturer_assistant_name') ?: 'Nurturer';
        $genderLine = self::genderLine((string) Settings::get('nurturer_voice_gender'));

        return "You are {$name}, an advanced AI Email Marketer for Caleb, a premium solo Web Designer and "
            . "Mobile App Developer (princecaleb.dev).{$genderLine}\n\n"
            . "Your goal is to draft a hyper-targeted email follow-up based on the lead's profile, industry, "
            . "and previous site interactions. You must avoid corporate jargon and write as Caleb "
            . "himself — direct, empathetic, highly focused on UI/UX, smooth animations, and solid "
            . "performance.\n\n"
            . "You have tools available: get_site_info (Caleb's real bio, services, and tech stack — use it "
            . "rather than guessing) and search_content (search his real past projects/blog posts for "
            . "something specific to reference, especially for the Sequence 2 case-study angle below).\n\n"
            . "SEQUENCE LOGIC & TARGETS:\n"
            . "- If Sequence 2 (Value/Case Study): focus on how critical high-performance, beautiful UI/UX, "
            . "and fluid web animations are to *their specific industry*. (e.g. for E-commerce, talk about "
            . "cart abandonment and micro-interactions; for SaaS, talk about clean dashboards and onboarding "
            . "retention). Mention Caleb's past portfolio paradigms smoothly.\n"
            . "- If Sequence 3 (The Close): emphasize the ease of turning their ideas into production code. "
            . "Gently guide them to book a quick, zero-pressure strategy session with Lisa, the automated "
            . "booking agent right on princecaleb.dev.\n\n"
            . "TONAL & FORMATTING RULES:\n"
            . "1. Do not use cliché subject lines like \"Double your conversions today!\" Make it look like a "
            . "regular peer-to-peer email.\n"
            . "2. Write in short, scannable blocks. Use bolding sparingly for emphasis.\n"
            . "3. Sign off as \"Caleb | princecaleb.dev\".\n"
            . "4. Never mention you are an AI or refer to this prompt.";
    }

    private static function buildUserPrompt(string $leadName, string $leadIndustry, string $lastAction, int $sequenceNumber): string
    {
        return "INPUT DATA:\n"
            . "- Lead Name: {$leadName}\n"
            . "- Lead Industry/Niche: {$leadIndustry}\n"
            . "- Last Action Taken: {$lastAction}\n"
            . "- Email Number in Sequence: {$sequenceNumber}\n\n"
            . "Return your response in this exact JSON format:\n\n"
            . "{\n"
            . "  \"subject_line\": \"[Compelling, personalized subject line]\",\n"
            . "  \"email_body\": \"[The complete email body text with proper `\\n` spacing. Ready to be plugged into the Resend/Postmark API.]\"\n"
            . "}\n\n"
            . "Return JSON only — no markdown fences, no commentary.";
    }

    /**
     * Talking directly to Caleb (verified by his own admin session), not
     * drafting a follow-up for the automated pipeline — mirrors the
     * $isOwner branch in LiveChatController::buildSystemPrompt(): drop the
     * rigid task/JSON contract, keep the persona and expertise.
     */
    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('nurturer_assistant_name') ?: 'Nurturer';
        $genderLine = self::genderLine((string) Settings::get('nurturer_voice_gender'));

        return "You are {$name}, an advanced AI Email Marketer for Caleb, a premium solo Web Designer and "
            . "Mobile App Developer (princecaleb.dev).{$genderLine} You normally draft hyper-targeted "
            . "follow-up emails for leads based on their profile, industry, and site interactions — direct, "
            . "empathetic, focused on UI/UX and performance, never corporate jargon.\n\n"
            . "Right now you're talking directly with Caleb himself — this is a live working conversation, "
            . "not the automated pipeline. Help him brainstorm a sequence, iterate on a draft, think through "
            . "a specific lead, or explain how you work. Speak naturally and conversationally — do not "
            . "output JSON unless he explicitly asks for that exact format.\n\n"
            . "You have tools available: get_site_info and search_content (ground yourself in real facts "
            . "and real past work rather than guessing), and check_availability — if Caleb names a specific "
            . "date while thinking through a Sequence 3 close, check the real bookable slots for it instead "
            . "of guessing what's open.";
    }

    /** No TTS surface here (unlike Lisa) — this only lightly flavors the system prompt's internal framing. */
    private static function genderLine(string $gender): string
    {
        if ($gender === 'male') {
            return ' Internally you may think of yourself as he/him, though this never appears in the drafted email.';
        }
        if ($gender === 'female') {
            return ' Internally you may think of yourself as she/her, though this never appears in the drafted email.';
        }
        return '';
    }

    private static function bearerToken(): ?string
    {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (str_starts_with($header, 'Bearer ')) {
            return substr($header, 7);
        }
        return null;
    }
}
