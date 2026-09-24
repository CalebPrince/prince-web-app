<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\AiAgentEngine;
use App\Support\AiDocumentReader;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * Ledger's pricing check: Caleb gives a project (typed in, or a proposal/
 * contract/quote document to read) and the price he's charging, answers a
 * short structured questionnaire about the work, and gets back a verdict —
 * too low, on target, too high, or needs adjustment — with a suggested
 * range and the reasoning, grounded in the real published pricing tiers
 * (get_site_info) and genuinely similar past work (search_content) rather
 * than a guessed number.
 *
 * Read-only against the rest of the app: this never touches proposals,
 * invoices or clients — it only ever writes its own pricing_reviews row.
 */
class PricingReviewController
{
    private const MAX_PROJECT_NAME_LENGTH = 200;
    private const MAX_DESCRIPTION_LENGTH = 4000;
    private const SUPPORTED_CURRENCIES = ['GHS', 'NGN', 'USD', 'ZAR'];

    private const MAX_DOCUMENT_BYTES = 8388608; // 8 MB, matches Ada's document intake
    private const DOCUMENT_EXTRACT_LIMIT = 20000;
    private const DOCUMENT_TIMEOUT_SECONDS = 45;

    private const NATIVE_MIME = [
        'pdf'  => 'application/pdf',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'webp' => 'image/webp',
        'gif'  => 'image/gif',
    ];
    private const TEXT_EXT = ['txt', 'md', 'csv', 'json'];

    private const VALID_VERDICTS = ['too_low', 'needs_adjustment', 'on_target', 'too_high'];
    private const VALID_CONFIDENCE = ['low', 'medium', 'high'];

    /**
     * The questionnaire. Kept as one fixed source of truth here — used both
     * to validate incoming answers and to render them into the prompt in
     * plain English. The frontend mirrors these keys/options but the
     * server never trusts it: anything not on this list is dropped.
     *
     * @return array<string,array{label:string,options:string[]}>
     */
    private static function questions(): array
    {
        return [
            'project_type' => [
                'label' => 'Project type',
                'options' => [
                    'Website', 'Mobile app', 'AI voice agent', 'WhatsApp / chat assistant',
                    'Workflow automation', 'AI operations system', 'E-commerce', 'Brand / design', 'Other',
                ],
            ],
            'scope_size' => [
                'label' => 'Scope size',
                'options' => [
                    'Small (single feature or landing page)',
                    'Medium (multi-page site or several features)',
                    'Large (complex system, multiple integrations)',
                    'Enterprise (mission-critical, compliance-heavy)',
                ],
            ],
            'integrations' => [
                'label' => 'Third-party integrations',
                'options' => ['None', '1-2', '3-5', '6 or more'],
            ],
            'timeline' => [
                'label' => 'Timeline pressure',
                'options' => ['Flexible', 'Standard', 'Rushed / urgent'],
            ],
            'custom_work' => [
                'label' => 'How custom is the work',
                'options' => [
                    'Fully custom build', 'Mostly custom with reusable components', 'Templated / near off-the-shelf',
                ],
            ],
            'support_included' => [
                'label' => 'Ongoing support included',
                'options' => ['None', 'Basic (bug fixes only)', 'Full (retainer / SLA)'],
            ],
            'client_budget_signal' => [
                'label' => "Client's budget signal",
                'options' => ['Price-sensitive', 'Mid-market', 'Premium / enterprise budget'],
            ],
            'client_relationship' => [
                'label' => 'Relationship with this client',
                'options' => ['New / cold lead', 'Referral', 'Repeat / existing client'],
            ],
            'competing_quotes' => [
                'label' => 'Competing quotes',
                'options' => [
                    'None known', 'Lower quotes seen elsewhere', 'Similar quotes seen elsewhere', 'Higher quotes seen elsewhere',
                ],
            ],
        ];
    }

    /** GET /api/v1/admin/pricing-review — most recent 50 reviews, newest first. */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();

        $pdo = Database::get();
        $stmt = $pdo->query(
            'SELECT id, project_name, description, document_name, price_amount, currency, answers, '
            . 'verdict, confidence, suggested_min, suggested_max, reasoning, adjustment_notes, '
            . 'grounding_source, grounding_note, created_at '
            . 'FROM pricing_reviews ORDER BY created_at DESC LIMIT 50'
        );
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
        foreach ($rows as &$row) {
            $row['answers'] = json_decode((string) $row['answers'], true) ?: [];
        }
        unset($row);

        Response::json(['reviews' => $rows]);
    }

    /** DELETE /api/v1/admin/pricing-review/{id} */
    public static function destroy(array $params): void
    {
        AuthMiddleware::requireAuth();

        $id = (int) ($params['id'] ?? 0);
        $pdo = Database::get();
        $stmt = $pdo->prepare('DELETE FROM pricing_reviews WHERE id = ?');
        $stmt->execute([$id]);

        Response::json(['status' => $stmt->rowCount() > 0 ? 'deleted' : 'not_found']);
    }

    /**
     * POST /api/v1/admin/pricing-review/generate
     * body: {project_name, description?, price_amount, currency, answers: {key:value},
     *        document?: {name, data (base64)}}
     */
    public static function generate(): void
    {
        AuthMiddleware::requireAuth();
        set_time_limit(120);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $projectName = trim((string) ($data['project_name'] ?? ''));
        $description = trim((string) ($data['description'] ?? ''));
        $priceAmount = (float) ($data['price_amount'] ?? 0);
        $currency = strtoupper(trim((string) ($data['currency'] ?? '')));
        $answersIn = is_array($data['answers'] ?? null) ? $data['answers'] : [];
        $document = is_array($data['document'] ?? null) ? $data['document'] : null;

        if ($projectName === '' || mb_strlen($projectName) > self::MAX_PROJECT_NAME_LENGTH) {
            Response::error('A project name (under ' . self::MAX_PROJECT_NAME_LENGTH . ' characters) is required.', 422);
        }
        if ($priceAmount <= 0) {
            Response::error('The price you are charging must be a positive number.', 422);
        }
        if (!in_array($currency, self::SUPPORTED_CURRENCIES, true)) {
            Response::error('Currency must be one of: ' . implode(', ', self::SUPPORTED_CURRENCIES) . '.', 422);
        }
        if (mb_strlen($description) > self::MAX_DESCRIPTION_LENGTH) {
            Response::error('Description must be under ' . self::MAX_DESCRIPTION_LENGTH . ' characters.', 422);
        }

        // Drop anything not on the real questionnaire, and any option that
        // isn't one of the ones actually offered for that question.
        $questions = self::questions();
        $answers = [];
        foreach ($questions as $key => $question) {
            $value = trim((string) ($answersIn[$key] ?? ''));
            if ($value !== '' && in_array($value, $question['options'], true)) {
                $answers[$key] = $value;
            }
        }

        $documentName = null;
        $documentExcerpt = null;
        if ($document !== null && !empty($document['data'])) {
            $documentName = basename((string) ($document['name'] ?? 'document'));
            try {
                $documentExcerpt = self::extractDocument($documentName, (string) $document['data']);
            } catch (\RuntimeException $e) {
                Response::error('Could not read the uploaded document: ' . $e->getMessage(), 422);
            }
        }

        if ($description === '' && $documentExcerpt === null) {
            Response::error('Describe the project or upload a document — there is nothing to evaluate otherwise.', 422);
        }

        $pdo = Database::get();
        $verdict = self::buildVerdict($projectName, $description, $priceAmount, $currency, $answers, $documentExcerpt, $pdo);
        if ($verdict === null) {
            Response::error('Could not generate a verdict — check that an AI provider is configured and reachable.', 502);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO pricing_reviews (project_name, description, document_name, document_excerpt, '
            . 'price_amount, currency, answers, verdict, confidence, suggested_min, suggested_max, '
            . 'reasoning, adjustment_notes, grounding_source, grounding_note) '
            . 'VALUES (:project_name, :description, :document_name, :document_excerpt, :price_amount, '
            . ':currency, :answers, :verdict, :confidence, :suggested_min, :suggested_max, :reasoning, '
            . ':adjustment_notes, :grounding_source, :grounding_note)'
        );
        $stmt->execute([
            ':project_name' => $projectName,
            ':description' => $description !== '' ? $description : null,
            ':document_name' => $documentName,
            ':document_excerpt' => $documentExcerpt,
            ':price_amount' => (int) round($priceAmount * 100),
            ':currency' => $currency,
            ':answers' => json_encode($answers),
            ':verdict' => $verdict['verdict'],
            ':confidence' => $verdict['confidence'],
            ':suggested_min' => $verdict['suggested_min'],
            ':suggested_max' => $verdict['suggested_max'],
            ':reasoning' => $verdict['reasoning'],
            ':adjustment_notes' => $verdict['adjustment_notes'],
            ':grounding_source' => $verdict['grounding_source'],
            ':grounding_note' => $verdict['grounding_note'],
        ]);
        $id = (int) $pdo->lastInsertId();

        Response::json([
            'id' => $id,
            'project_name' => $projectName,
            'description' => $description !== '' ? $description : null,
            'document_name' => $documentName,
            'price_amount' => (int) round($priceAmount * 100),
            'currency' => $currency,
            'answers' => $answers,
            ...$verdict,
            'created_at' => date('Y-m-d H:i:s'),
        ]);
    }

    /**
     * Core generation, separated from the HTTP handler the same way
     * ProposalAgentController::buildDraft() is — one place that builds the
     * prompt, runs it through the shared engine, and parses the JSON
     * contract back into a typed array, or null if the model could not be
     * reached or returned something unusable.
     *
     * @return array{verdict:string,confidence:string,suggested_min:?int,suggested_max:?int,reasoning:string,adjustment_notes:string,grounding_source:string,grounding_note:string}|null
     */
    private static function buildVerdict(
        string $projectName,
        string $description,
        float $priceAmount,
        string $currency,
        array $answers,
        ?string $documentExcerpt,
        \PDO $pdo
    ): ?array {
        $userPrompt = self::buildUserPrompt($projectName, $description, $priceAmount, $currency, $answers, $documentExcerpt);

        $result = AiAgentEngine::run(
            self::buildSystemPrompt(),
            [SharedAgentTools::siteInfoToolDeclaration(), SharedAgentTools::searchContentToolDeclaration()],
            fn(string $name, array $args) => match ($name) {
                'get_site_info' => SharedAgentTools::getSiteInfo(),
                'search_content' => SharedAgentTools::searchContent($pdo, (string) ($args['query'] ?? '')),
                default => ['error' => 'Unknown tool.'],
            },
            [['role' => 'user', 'text' => $userPrompt]]
        );
        if ($result['reply'] === null) {
            return null;
        }

        $stripped = trim(preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $result['reply']));
        $parsed = json_decode($stripped, true);
        if (!is_array($parsed) || empty($parsed['verdict']) || empty($parsed['reasoning'])) {
            error_log('PricingReviewController buildVerdict: could not parse JSON from model output: ' . substr($stripped, 0, 800));
            return null;
        }

        $verdict = strtolower(trim((string) $parsed['verdict']));
        if (!in_array($verdict, self::VALID_VERDICTS, true)) {
            $verdict = 'needs_adjustment';
        }
        $confidence = strtolower(trim((string) ($parsed['confidence'] ?? 'medium')));
        if (!in_array($confidence, self::VALID_CONFIDENCE, true)) {
            $confidence = 'medium';
        }

        $suggestedMin = isset($parsed['suggested_min']) ? (float) $parsed['suggested_min'] : null;
        $suggestedMax = isset($parsed['suggested_max']) ? (float) $parsed['suggested_max'] : null;

        return [
            'verdict' => $verdict,
            'confidence' => $confidence,
            'suggested_min' => $suggestedMin !== null && $suggestedMin > 0 ? (int) round($suggestedMin * 100) : null,
            'suggested_max' => $suggestedMax !== null && $suggestedMax > 0 ? (int) round($suggestedMax * 100) : null,
            'reasoning' => SharedAgentTools::stripMarkdown((string) $parsed['reasoning']),
            'adjustment_notes' => SharedAgentTools::stripMarkdown((string) ($parsed['adjustment_notes'] ?? '')),
            'grounding_source' => (string) ($parsed['grounding_source'] ?? 'none'),
            'grounding_note' => SharedAgentTools::stripMarkdown((string) ($parsed['grounding_note'] ?? '')),
        ];
    }

    private static function buildSystemPrompt(): string
    {
        $name = Settings::get('proposal_assistant_name') ?: 'Ledger';

        return "You are {$name}, a pricing advisor for Caleb, a solo developer building AI voice agents, "
            . "WhatsApp/chat assistants, workflow automations, and custom websites/mobile apps "
            . "(princecaleb.dev). Caleb is about to charge (or already quoted) a specific price for a "
            . "specific project, and wants an honest second opinion: is that price too low, too high, "
            . "about right, or close but needing some adjustment.\n\n"
            . "You never invent numbers: call get_site_info and ground yourself in its implementation_tiers "
            . "(Caleb's real published starting prices) — find the tier(s) closest to the described project's "
            . "scope and complexity. Also call search_content to check for a genuinely similar past project; "
            . "if one exists, weigh what it suggests about market rate, but don't force a comparison that "
            . "isn't a real match. If neither source gives you enough to ground a number, say so plainly in "
            . "grounding_note and rely on general judgement from the questionnaire answers instead — never "
            . "present a guess as a grounded figure.\n\n"
            . "Weigh the questionnaire answers directly: scope size and integration count drive effort; a "
            . "rushed timeline or fully custom build justifies a premium; a templated build, a price-sensitive "
            . "client, or a repeat/referral relationship can justify pricing lower; included ongoing support "
            . "should be priced in, not given away; competing quotes are a real market signal when known.\n\n"
            . "Be direct and specific — this is a working opinion, not a hedge. If the price is fine, say so "
            . "plainly rather than manufacturing a reason to adjust it.\n\n"
            . "Return your response in this exact JSON format:\n\n"
            . "{\n"
            . "  \"verdict\": \"[one of: too_low, needs_adjustment, on_target, too_high]\",\n"
            . "  \"confidence\": \"[low, medium, or high — how confident you are given what was grounded]\",\n"
            . "  \"suggested_min\": [a plain decimal number in the same currency as the price given, the low end of a fair range],\n"
            . "  \"suggested_max\": [a plain decimal number, the high end of a fair range],\n"
            . "  \"reasoning\": \"[2-4 sentences: why this verdict, referencing the specific scope/tier/comparison that drove it]\",\n"
            . "  \"adjustment_notes\": \"[concrete next step if not on_target, e.g. what to add/cut/reprice; empty string if on_target]\",\n"
            . "  \"grounding_source\": \"[implementation_tiers, past_project, both, or none]\",\n"
            . "  \"grounding_note\": \"[one sentence: what you actually grounded the number in]\"\n"
            . "}\n\n"
            . "suggested_min/suggested_max are plain decimal numbers, not cents. Return JSON only — no "
            . "markdown fences, no commentary.";
    }

    private static function buildUserPrompt(
        string $projectName,
        string $description,
        float $priceAmount,
        string $currency,
        array $answers,
        ?string $documentExcerpt
    ): string {
        $parts = [
            "Evaluate this pricing decision.",
            "PROJECT: {$projectName}",
            "PRICE BEING CHARGED: {$currency} " . number_format($priceAmount, 2),
        ];

        if ($description !== '') {
            $parts[] = "DESCRIPTION (from Caleb):\n{$description}";
        }

        $questions = self::questions();
        if ($answers !== []) {
            $lines = [];
            foreach ($answers as $key => $value) {
                $label = $questions[$key]['label'] ?? $key;
                $lines[] = "- {$label}: {$value}";
            }
            $parts[] = "QUESTIONNAIRE ANSWERS:\n" . implode("\n", $lines);
        }

        if ($documentExcerpt !== null) {
            $parts[] = "UPLOADED DOCUMENT (transcribed):\n{$documentExcerpt}";
        }

        return implode("\n\n", $parts);
    }

    /**
     * Same shape as Ada's extractDocument(): plain text is decoded as-is;
     * PDFs/images go through AiDocumentReader so layout (which line item a
     * figure sits on) survives instead of being flattened away.
     *
     * @throws \RuntimeException with a message safe to show the user
     */
    private static function extractDocument(string $name, string $base64): string
    {
        $raw = base64_decode($base64, true);
        if ($raw === false || $raw === '') {
            throw new \RuntimeException('the upload was not readable');
        }
        if (strlen($raw) > self::MAX_DOCUMENT_BYTES) {
            throw new \RuntimeException('larger than the 8 MB limit');
        }

        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        if (in_array($ext, self::TEXT_EXT, true)) {
            return mb_substr($raw, 0, self::DOCUMENT_EXTRACT_LIMIT);
        }
        if (!isset(self::NATIVE_MIME[$ext])) {
            throw new \RuntimeException('unsupported type (try pdf, png, jpg, webp, txt, md, csv or json)');
        }

        $text = AiDocumentReader::transcribe(
            self::NATIVE_MIME[$ext],
            $base64,
            "Transcribe this document as plain text. Preserve every figure, date, scope item and "
            . "price exactly as written, and keep the structure readable. Do not summarise or omit anything.",
            self::DOCUMENT_TIMEOUT_SECONDS
        );
        if ($text === null) {
            error_log('PricingReviewController document extract failed: ' . AiDocumentReader::lastError());
            throw new \RuntimeException('could not be read (' . AiDocumentReader::lastError() . ')');
        }
        return mb_substr($text, 0, self::DOCUMENT_EXTRACT_LIMIT);
    }
}
