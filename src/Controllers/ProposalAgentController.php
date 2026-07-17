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
 * Ledger: drafts a project proposal — scope, timeline, terms, and a payment
 * milestone breakdown — from a real quote request (inquiries.type =
 * 'project_request') and/or a short brief Caleb types himself. Unlike Beacon
 * and Nurturer, there is no Bearer-authed draft() for external automation:
 * every proposal starts from an admin action on the Proposals page or a
 * live chat, so generate() is admin-session-authed like chat() is.
 *
 * Deliberately has no write path anywhere in this file. Every tool and both
 * entry points only ever read data or return JSON — the only code that can
 * INSERT INTO proposals or send a proposal email is ProposalController's
 * store()/update()/send(), unchanged, still gated behind Caleb's own click.
 * A proposal commits to real payment terms a client may pay against, so
 * this agent gets a stricter guardrail than Beacon's log_qualified_lead
 * (which does write, once Caleb confirms mid-chat) — here there simply is
 * no tool that could.
 */
class ProposalAgentController
{
    private const MAX_MESSAGE_LENGTH = 1000;
    private const MAX_CHAT_TRANSCRIPT_TURNS = 30;
    private const MAX_BRIEF_LENGTH = 4000;
    private const SUPPORTED_CURRENCIES = ['GHS', 'NGN', 'USD', 'ZAR'];

    /** POST /api/v1/admin/proposals/generate — body: {inquiry_id?, brief?} */
    public static function generate(): void
    {
        AuthMiddleware::requireAuth();

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $inquiryId = !empty($data['inquiry_id']) ? (int) $data['inquiry_id'] : null;
        $brief = trim((string) ($data['brief'] ?? ''));

        if ($inquiryId === null && $brief === '') {
            Response::error('Provide an inquiry_id or a brief description of what the client wants.', 422);
        }
        if (mb_strlen($brief) > self::MAX_BRIEF_LENGTH) {
            Response::error('Brief must be under ' . self::MAX_BRIEF_LENGTH . ' characters.', 422);
        }

        $pdo = Database::get();
        if ($inquiryId !== null) {
            $exists = $pdo->prepare("SELECT 1 FROM inquiries WHERE type = 'project_request' AND id = ?");
            $exists->execute([$inquiryId]);
            if (!$exists->fetchColumn()) {
                Response::error('Quote request not found.', 404);
            }
        }

        $draft = self::buildDraft($inquiryId, $brief !== '' ? $brief : null, $pdo);
        if ($draft === null) {
            Response::error('Could not generate a draft — check that an AI provider is configured and reachable.', 502);
        }

        Response::json($draft);
    }

    /**
     * Core generation: builds the prompt, runs it through AiAgentEngine, and
     * parses the JSON contract. Shared by generate() (HTTP) and the
     * draft_proposal chat tool — same as how Nurturer's generateFollowUp()
     * backs both draft() and the cron.
     *
     * @return array{client_name:string,client_email:string,title:string,scope:string,timeline:string,terms:string,currency:string,milestones:array<int,array{title:string,amount:float,due_note:string}>,grounding_source:string,grounding_note:string}|null
     */
    public static function buildDraft(?int $inquiryId, ?string $brief, \PDO $pdo): ?array
    {
        $inquiry = null;
        if ($inquiryId !== null) {
            $stmt = $pdo->prepare(
                "SELECT id, name, email, message, project_type, budget, timeline, features "
                . "FROM inquiries WHERE type = 'project_request' AND id = ?"
            );
            $stmt->execute([$inquiryId]);
            $inquiry = $stmt->fetch(\PDO::FETCH_ASSOC) ?: null;
        }

        $userPrompt = self::buildGenerateUserPrompt($inquiry, $brief);
        $result = AiAgentEngine::run(
            self::buildGenerateSystemPrompt(),
            self::generateToolDeclarations(),
            fn(string $name, array $args) => self::runTool($name, $args, $pdo),
            [['role' => 'user', 'text' => $userPrompt]]
        );
        if ($result['reply'] === null) {
            return null;
        }

        $stripped = trim(preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $result['reply']));
        $parsed = json_decode($stripped, true);
        if (
            !is_array($parsed) || empty($parsed['title']) || empty($parsed['scope'])
            || empty($parsed['currency']) || empty($parsed['milestones']) || !is_array($parsed['milestones'])
        ) {
            error_log('ProposalAgentController buildDraft: could not parse JSON from model output: ' . substr($stripped, 0, 800));
            return null;
        }

        // Never trust the model for a real person's contact details — the
        // inquiry row (if we have one) is the source of truth, same reasoning
        // as Nurturer's toolFindLead surfacing real data instead of guesses.
        if ($inquiry) {
            $parsed['client_name'] = $inquiry['name'];
            $parsed['client_email'] = $inquiry['email'];
        } elseif (!filter_var($parsed['client_email'] ?? '', FILTER_VALIDATE_EMAIL)) {
            $parsed['client_email'] = '';
        }

        $currency = strtoupper(trim((string) ($parsed['currency'] ?? '')));
        if (!in_array($currency, self::SUPPORTED_CURRENCIES, true)) {
            $currency = Settings::get('pricing_currency') ?: 'GHS';
        }

        $milestones = [];
        foreach ($parsed['milestones'] as $milestone) {
            if (!is_array($milestone)) {
                continue;
            }
            $title = trim((string) ($milestone['title'] ?? ''));
            $amount = (float) ($milestone['amount'] ?? 0);
            if ($title === '' || $amount <= 0) {
                continue;
            }
            $milestones[] = [
                'title' => $title,
                'amount' => $amount,
                'due_note' => trim((string) ($milestone['due_note'] ?? '')),
            ];
        }
        if (!$milestones) {
            error_log('ProposalAgentController buildDraft: model returned no usable milestones.');
            return null;
        }

        return [
            'client_name' => (string) ($parsed['client_name'] ?? ''),
            'client_email' => (string) ($parsed['client_email'] ?? ''),
            'title' => (string) $parsed['title'],
            'scope' => (string) $parsed['scope'],
            'timeline' => (string) ($parsed['timeline'] ?? ''),
            'terms' => (string) ($parsed['terms'] ?? ''),
            'currency' => $currency,
            'milestones' => $milestones,
            'grounding_source' => (string) ($parsed['grounding_source'] ?? 'none'),
            'grounding_note' => (string) ($parsed['grounding_note'] ?? ''),
        ];
    }

    /**
     * POST /api/v1/admin/agents/proposal/chat — body: {message, transcript: [{role,text}, ...]}.
     * A live, free-form conversation with Caleb himself (admin session), not
     * the generate() pipeline — no JSON contract, just Ledger talking
     * naturally about pricing, scope, or a specific quote request.
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

    private static function generateToolDeclarations(): array
    {
        return [
            SharedAgentTools::siteInfoToolDeclaration(),
            SharedAgentTools::searchContentToolDeclaration(),
        ];
    }

    private static function chatToolDeclarations(): array
    {
        return [
            ...self::generateToolDeclarations(),
            self::findInquiryToolDeclaration(),
            self::findProposalToolDeclaration(),
            self::draftProposalToolDeclaration(),
        ];
    }

    private static function findInquiryToolDeclaration(): array
    {
        return [
            'name' => 'find_inquiry',
            'description' => 'Look up a real quote request on file by name or email, so you can draft from '
                . 'what was actually asked for instead of asking Caleb to retype it.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'query' => ['type' => 'STRING', 'description' => 'A name or email to search for.'],
                ],
                'required' => ['query'],
            ],
        ];
    }

    private static function findProposalToolDeclaration(): array
    {
        return [
            'name' => 'find_proposal',
            'description' => 'Look up an existing proposal by client name, email, or title — its status, '
                . 'total, and which milestones (if any) have been paid.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'query' => ['type' => 'STRING', 'description' => 'A client name, email, or proposal title to search for.'],
                ],
                'required' => ['query'],
            ],
        ];
    }

    private static function draftProposalToolDeclaration(): array
    {
        return [
            'name' => 'draft_proposal',
            'description' => 'Generate real proposal numbers — scope, timeline, terms, and grounded milestone '
                . 'amounts — from a quote request and/or a brief description. This only returns numbers for '
                . 'you to discuss here; it never creates or saves a proposal. To actually create one, Caleb '
                . 'has to open the Proposals page (the Draft with AI button there, or typing it in by hand) '
                . 'and click Create himself.',
            'parameters' => [
                'type' => 'OBJECT',
                'properties' => [
                    'inquiry_id' => ['type' => 'NUMBER', 'description' => 'A quote request id, if drafting from one on file.'],
                    'brief' => ['type' => 'STRING', 'description' => 'A short description of what the client wants, if there is no linked quote request.'],
                ],
            ],
        ];
    }

    private static function runTool(string $name, array $args, \PDO $pdo): array
    {
        return match ($name) {
            'get_site_info' => SharedAgentTools::getSiteInfo(),
            'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
            'find_inquiry' => self::toolFindInquiry($args, $pdo),
            'find_proposal' => self::toolFindProposal($args, $pdo),
            'draft_proposal' => self::toolDraftProposal($args, $pdo),
            default => ['error' => 'Unknown tool.'],
        };
    }

    /** @return array{inquiries: array<int,array<string,mixed>>} */
    private static function toolFindInquiry(array $args, \PDO $pdo): array
    {
        $query = trim((string) ($args['query'] ?? ''));
        if ($query === '') {
            return ['error' => 'A name or email to search for is required.'];
        }
        $like = '%' . $query . '%';

        $stmt = $pdo->prepare(
            "SELECT id, name, email, message, project_type, budget, timeline, features, pipeline_stage, created_at "
            . "FROM inquiries WHERE type = 'project_request' AND (name LIKE ? OR email LIKE ?) "
            . "ORDER BY created_at DESC LIMIT 5"
        );
        $stmt->execute([$like, $like]);
        return ['inquiries' => $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: []];
    }

    /** @return array{proposals: array<int,array<string,mixed>>} */
    private static function toolFindProposal(array $args, \PDO $pdo): array
    {
        $query = trim((string) ($args['query'] ?? ''));
        if ($query === '') {
            return ['error' => 'A client name, email, or proposal title to search for is required.'];
        }
        $like = '%' . $query . '%';

        $stmt = $pdo->prepare(
            'SELECT id, title, client_name, client_email, status, total_amount, currency, created_at, accepted_at '
            . 'FROM proposals WHERE client_name LIKE ? OR client_email LIKE ? OR title LIKE ? '
            . 'ORDER BY created_at DESC LIMIT 5'
        );
        $stmt->execute([$like, $like, $like]);
        $proposals = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];

        foreach ($proposals as &$proposal) {
            $milestoneStmt = $pdo->prepare(
                'SELECT pm.title, pm.amount, pm.due_note, pl.status AS payment_status '
                . 'FROM proposal_milestones pm LEFT JOIN payment_links pl ON pl.id = pm.payment_link_id '
                . 'WHERE pm.proposal_id = ? ORDER BY pm.sort_order'
            );
            $milestoneStmt->execute([$proposal['id']]);
            $proposal['milestones'] = $milestoneStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        }
        unset($proposal);

        return ['proposals' => $proposals];
    }

    /** Read-only wrapper around buildDraft() for narration mid-chat — writes nothing. */
    private static function toolDraftProposal(array $args, \PDO $pdo): array
    {
        $inquiryId = !empty($args['inquiry_id']) ? (int) $args['inquiry_id'] : null;
        $brief = trim((string) ($args['brief'] ?? '')) ?: null;
        if ($inquiryId === null && $brief === null) {
            return ['error' => 'Provide an inquiry_id or a brief description to draft from.'];
        }

        $draft = self::buildDraft($inquiryId, $brief, $pdo);
        if ($draft === null) {
            return ['error' => 'Could not generate a draft right now.'];
        }
        return $draft;
    }

    private static function buildGenerateSystemPrompt(): string
    {
        $name = Settings::get('proposal_assistant_name') ?: 'Ledger';
        $genderLine = self::genderLine((string) Settings::get('proposal_voice_gender'));

        return "You are {$name}, an AI proposal drafter for Caleb, a premium solo Web Designer and Mobile App "
            . "Developer (princecaleb.dev).{$genderLine} Your job is to turn a quote request (or a short brief "
            . "Caleb types himself) into a clear, professional project proposal — scope, timeline, terms, and "
            . "a payment milestone breakdown.\n\n"
            . "You never invent numbers: call get_site_info and ground your total in its engineering_tiers "
            . "(Caleb's real published pricing tiers) — pick whichever tier is the closest match to the "
            . "requested project_type/features, don't blend or invent one. If engineering_tiers is empty, "
            . "fall back to the inquiry's own stated budget if present. If neither exists, use round, "
            . "clearly-labelled placeholder numbers and say so plainly in grounding_note — Caleb must confirm "
            . "real pricing before this ever goes out. You may also call search_content to reference a "
            . "genuinely similar past project in the scope text, but only if it's a real match — don't force "
            . "a comparison.\n\n"
            . "TONE: direct, professional, zero-pressure — the same voice used across princecaleb.dev. No "
            . "filler like \"We are thrilled to present...\". Scope should read like a clear-eyed engineer "
            . "describing exactly what's included and what isn't; terms should be plain-English, not "
            . "legalese.\n\n"
            . "You are drafting only — never claim the proposal has been created or sent. Caleb reviews and "
            . "edits everything before it exists as a real record.\n\n"
            . "Return your response in this exact JSON format:\n\n"
            . "{\n"
            . "  \"client_name\": \"[Use the real name given, if any; otherwise empty string]\",\n"
            . "  \"client_email\": \"[Use the real email given, if any; otherwise empty string — never invent one]\",\n"
            . "  \"title\": \"[Short proposal title, e.g. 'E-commerce Rebuild Proposal']\",\n"
            . "  \"scope\": \"[What's included and what isn't, as clear prose with line breaks]\",\n"
            . "  \"timeline\": \"[e.g. '4-6 weeks after deposit']\",\n"
            . "  \"terms\": \"[Payment, revision, and acceptance terms, plain English]\",\n"
            . "  \"currency\": \"[GHS, NGN, USD, or ZAR — match whatever currency the budget/tier pricing is in]\",\n"
            . "  \"milestones\": [{\"title\": \"50% deposit\", \"amount\": 1500.00, \"due_note\": \"Due before kickoff\"}],\n"
            . "  \"grounding_source\": \"[engineering_tiers, inquiry_budget, or none]\",\n"
            . "  \"grounding_note\": \"[One sentence: how you arrived at the numbers]\"\n"
            . "}\n\n"
            . "milestones amounts are plain decimal numbers, not cents. Return JSON only — no markdown "
            . "fences, no commentary.";
    }

    private static function buildGenerateUserPrompt(?array $inquiry, ?string $brief): string
    {
        $parts = ['Draft a proposal for this prospective client.'];

        if ($inquiry) {
            $parts[] = "REAL QUOTE REQUEST ON FILE:\n"
                . "- Name: {$inquiry['name']}\n"
                . "- Email: {$inquiry['email']}\n"
                . '- Project type: ' . ($inquiry['project_type'] ?: 'not specified') . "\n"
                . '- Stated budget: ' . ($inquiry['budget'] ?: 'not specified') . "\n"
                . '- Requested timeline: ' . ($inquiry['timeline'] ?: 'not specified') . "\n"
                . '- Requested features: ' . ($inquiry['features'] ?: 'not specified') . "\n"
                . '- Message: ' . ($inquiry['message'] ?: 'none');
        }
        if ($brief) {
            $parts[] = "ADDITIONAL CONTEXT FROM CALEB:\n" . $brief;
        }

        return implode("\n\n", $parts);
    }

    /**
     * Talking directly to Caleb (verified by his own admin session), not
     * generating a proposal for the pipeline — mirrors the $isOwner branch
     * in LiveChatController::buildSystemPrompt(): drop the rigid JSON
     * contract, keep the persona and expertise.
     */
    private static function buildChatSystemPrompt(): string
    {
        $name = Settings::get('proposal_assistant_name') ?: 'Ledger';
        $genderLine = self::genderLine((string) Settings::get('proposal_voice_gender'));

        return "You are {$name}, an AI proposal drafter for Caleb, a premium solo Web Designer and Mobile App "
            . "Developer (princecaleb.dev).{$genderLine} You normally turn a quote request into a scoped "
            . "proposal — scope, timeline, terms, and a grounded payment milestone breakdown — direct, "
            . "professional, zero-pressure, never legalese or filler.\n\n"
            . "Right now you're talking directly with Caleb himself — this is a live working conversation, "
            . "not the drafting pipeline. Help him think through pricing for a lead, talk through what should "
            . "be in scope vs. out of scope, or draft the numbers for a specific quote request. Speak "
            . "naturally and conversationally — do not output JSON unless he explicitly asks for that exact "
            . "format.\n\n"
            . "You cannot create or send a proposal yourself — there is no tool for that, by design. If Caleb "
            . "says \"just send it\" or \"go ahead and create it\", explain that you can draft the numbers "
            . "and scope right here, but he still has to open the Proposals page — either the Draft with AI "
            . "button there, or typing it in by hand — and click Create/Save himself before anything real "
            . "exists.\n\n"
            . "You have tools available: get_site_info and search_content (ground yourself in real facts and "
            . "real past work rather than guessing), find_inquiry — whenever Caleb mentions a specific quote "
            . "request by name or email, look it up rather than asking him to repeat it — find_proposal — to "
            . "check the status of an existing proposal — and draft_proposal — to actually generate grounded "
            . "scope/timeline/terms/milestone numbers for a specific inquiry or brief, so you're proposing "
            . "real figures instead of guessing them aloud.";
    }

    /** No TTS surface here (unlike Lisa) — this only lightly flavors the system prompt's internal framing. */
    private static function genderLine(string $gender): string
    {
        if ($gender === 'male') {
            return ' Internally you may think of yourself as he/him, though this never appears in the drafted proposal.';
        }
        if ($gender === 'female') {
            return ' Internally you may think of yourself as she/her, though this never appears in the drafted proposal.';
        }
        return '';
    }
}
