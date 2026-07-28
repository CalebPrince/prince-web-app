<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\ActivityLog;
use App\Support\AiText;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;

/**
 * Reviewed account-based proof pages. AI drafts structured copy from stored
 * evidence; it never writes executable HTML and nothing is public until an
 * authenticated admin publishes it.
 */
class AccountDemoController
{
    public static function generate(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $lead = self::lead($pdo, (int) ($params['id'] ?? 0));
        if (empty($lead['audit_findings']) && empty($lead['research_findings'])) {
            Response::error('Run a site audit or research dossier first so the account demo has verified evidence.', 422);
        }

        $audit = json_decode((string) ($lead['audit_findings'] ?? ''), true) ?: [];
        $research = json_decode((string) ($lead['research_findings'] ?? ''), true) ?: [];
        $snapshot = [
            'business_name' => $lead['business_name'],
            'website_url' => $lead['website_url'],
            'audit' => $audit,
            'research' => $research,
        ];
        $draft = self::draft((string) $lead['business_name'], $snapshot);
        $token = self::existingToken($pdo, (int) $lead['id']) ?: bin2hex(random_bytes(18));

        $pdo->prepare(
            "INSERT INTO account_demos
             (lead_id, token, status, headline, outcome_summary, friction_label, workflow_json,
              proof_note, source_snapshot_json, generated_at)
             VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(lead_id) DO UPDATE SET
               status='draft', headline=excluded.headline, outcome_summary=excluded.outcome_summary,
               friction_label=excluded.friction_label, workflow_json=excluded.workflow_json,
               proof_note=excluded.proof_note, source_snapshot_json=excluded.source_snapshot_json,
               generated_at=datetime('now'), published_at=NULL"
        )->execute([
            $lead['id'],
            $token,
            $draft['headline'],
            $draft['outcome_summary'],
            $draft['friction_label'],
            json_encode($draft['workflow'], JSON_UNESCAPED_SLASHES),
            $draft['proof_note'],
            json_encode($snapshot, JSON_UNESCAPED_SLASHES),
        ]);
        $pdo->prepare('UPDATE marketing_leads SET is_high_priority=1, updated_at=datetime(\'now\') WHERE id=?')
            ->execute([$lead['id']]);
        ActivityLog::log($user, 'generated', 'account_demo', (string) $lead['id'], (string) $lead['business_name']);
        Response::json(['demo' => self::forLead($pdo, (int) $lead['id'])], 201);
    }

    public static function update(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $leadId = (int) ($params['id'] ?? 0);
        $demo = self::forLead($pdo, $leadId);
        if (!$demo) Response::error('Generate the account demo first.', 404);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        try {
            $headline = self::text($data['headline'] ?? $demo['headline'], 160, 'Headline');
            $summary = self::text($data['outcome_summary'] ?? $demo['outcome_summary'], 700, 'Outcome summary');
            $friction = self::text($data['friction_label'] ?? $demo['friction_label'], 300, 'Current-state framing');
            $proof = self::text($data['proof_note'] ?? $demo['proof_note'], 500, 'Proof note');
            $workflow = self::workflow($data['workflow'] ?? $demo['workflow']);
        } catch (\InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        }

        $pdo->prepare(
            'UPDATE account_demos SET headline=?, outcome_summary=?, friction_label=?, workflow_json=?, proof_note=? WHERE lead_id=?'
        )->execute([$headline, $summary, $friction, json_encode($workflow), $proof, $leadId]);
        if (array_key_exists('is_high_priority', $data)) {
            $pdo->prepare('UPDATE marketing_leads SET is_high_priority=?, updated_at=datetime(\'now\') WHERE id=?')
                ->execute([!empty($data['is_high_priority']) ? 1 : 0, $leadId]);
        }
        ActivityLog::log($user, 'updated', 'account_demo', (string) $leadId, $headline);
        Response::json(['demo' => self::forLead($pdo, $leadId)]);
    }

    public static function publish(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $leadId = (int) ($params['id'] ?? 0);
        $demo = self::forLead($pdo, $leadId);
        if (!$demo) Response::error('Generate the account demo first.', 404);
        $pdo->prepare("UPDATE account_demos SET status='published', published_at=datetime('now') WHERE lead_id=?")
            ->execute([$leadId]);
        ActivityLog::log($user, 'published', 'account_demo', (string) $leadId, (string) $demo['business_name']);
        Response::json(['demo' => self::forLead($pdo, $leadId)]);
    }

    public static function show(array $params): void
    {
        $token = trim((string) ($params['token'] ?? ''));
        if (!preg_match('/^[a-f0-9]{36}$/', $token)) Response::error('Account demo not found.', 404);
        $pdo = Database::get();
        $stmt = $pdo->prepare(
            "SELECT ad.*, ml.business_name, ml.website_url
             FROM account_demos ad JOIN marketing_leads ml ON ml.id=ad.lead_id
             WHERE ad.token=? AND ad.status='published'"
        );
        $stmt->execute([$token]);
        $demo = $stmt->fetch();
        if (!$demo) Response::error('Account demo not found.', 404);
        Response::json(self::publicShape($demo));
    }

    public static function track(array $params): void
    {
        RateLimitMiddleware::enforce('account_demo_track', 30);
        $token = trim((string) ($params['token'] ?? ''));
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $event = (string) ($data['event'] ?? '');
        if (!preg_match('/^[a-f0-9]{36}$/', $token) || !in_array($event, ['view', 'cta'], true)) {
            Response::error('Invalid event.', 422);
        }
        $pdo = Database::get();
        $sql = $event === 'view'
            ? "UPDATE account_demos SET views=views+1, last_viewed_at=datetime('now') WHERE token=? AND status='published'"
            : "UPDATE account_demos SET cta_clicks=cta_clicks+1 WHERE token=? AND status='published'";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$token]);
        Response::json(['tracked' => $stmt->rowCount() > 0]);
    }

    public static function forLead(\PDO $pdo, int $leadId): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT ad.*, ml.business_name, ml.is_high_priority
             FROM account_demos ad JOIN marketing_leads ml ON ml.id=ad.lead_id WHERE ad.lead_id=?'
        );
        $stmt->execute([$leadId]);
        $row = $stmt->fetch();
        if (!$row) return null;
        $row['workflow'] = json_decode((string) $row['workflow_json'], true) ?: [];
        $row['url'] = '/account-demo.html?token=' . $row['token'];
        unset($row['workflow_json'], $row['source_snapshot_json']);
        return $row;
    }

    public static function publishedUrlForLead(\PDO $pdo, int $leadId): ?string
    {
        $stmt = $pdo->prepare("SELECT token FROM account_demos WHERE lead_id=? AND status='published'");
        $stmt->execute([$leadId]);
        $token = $stmt->fetchColumn();
        return $token ? 'https://princecaleb.dev/account-demo.html?token=' . $token : null;
    }

    private static function lead(\PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM marketing_leads WHERE id=?');
        $stmt->execute([$id]);
        $lead = $stmt->fetch();
        if (!$lead) Response::error('Lead not found.', 404);
        return $lead;
    }

    private static function existingToken(\PDO $pdo, int $leadId): ?string
    {
        $stmt = $pdo->prepare('SELECT token FROM account_demos WHERE lead_id=?');
        $stmt->execute([$leadId]);
        return $stmt->fetchColumn() ?: null;
    }

    private static function draft(string $businessName, array $snapshot): array
    {
        $fallback = [
            'headline' => "A quieter customer journey for {$businessName}",
            'outcome_summary' => 'A focused AI assistant can handle routine requests immediately, keep the next step moving, and bring a person in when judgment is needed.',
            'friction_label' => 'A likely starting point: routine calls and messages compete with the work only your team can do.',
            'workflow' => [
                ['label' => 'A request arrives', 'detail' => 'A customer calls or sends a message and receives an immediate, consistent response.', 'actor' => 'Lisa'],
                ['label' => 'The routine work moves', 'detail' => 'Approved questions, details, and next steps are handled without adding another staff interruption.', 'actor' => 'Lisa'],
                ['label' => 'Exceptions reach a person', 'detail' => 'Sensitive, urgent, or uncertain requests are handed to the right team member with context.', 'actor' => 'Team'],
                ['label' => 'The loop closes', 'detail' => 'The customer gets a clear next step while the business keeps a record for follow-up.', 'actor' => 'System'],
            ],
            'proof_note' => 'This is a proposed workflow based only on publicly available and audited information. It is not a claim about current internal operations.',
        ];
        if (empty(Settings::get('gemini_api_key')) && empty(Settings::get('openrouter_api_key')) && empty(Settings::get('groq_api_key'))) {
            return $fallback;
        }
        $prompt = "Create structured copy for a private, reviewed outcome walkthrough for {$businessName}. "
            . "Use only the evidence JSON below. Do not claim knowledge of internal operations, missed revenue, call "
            . "volume, staff behavior, or results. Frame operational friction as a likely scenario or proposed starting "
            . "point. Focus on the future the buyer gets, not product features. Return JSON only with headline, "
            . "outcome_summary, friction_label, proof_note, and workflow (exactly four objects with label, detail, actor; "
            . "actor must be Lisa, Team, or System). Keep every field concise and specific.\n\nEvidence:\n"
            . json_encode($snapshot, JSON_UNESCAPED_SLASHES);
        $raw = AiText::generate($prompt, null, 25);
        if (!$raw) return $fallback;
        $raw = trim(preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $raw));
        $parsed = json_decode($raw, true);
        if (!is_array($parsed)) return $fallback;
        try {
            return [
                'headline' => self::text($parsed['headline'] ?? '', 160, 'Headline'),
                'outcome_summary' => self::text($parsed['outcome_summary'] ?? '', 700, 'Outcome summary'),
                'friction_label' => self::text($parsed['friction_label'] ?? '', 300, 'Current-state framing'),
                'workflow' => self::workflow($parsed['workflow'] ?? []),
                'proof_note' => self::text($parsed['proof_note'] ?? '', 500, 'Proof note'),
            ];
        } catch (\Throwable) {
            return $fallback;
        }
    }

    private static function text(mixed $value, int $max, string $label): string
    {
        $value = trim(strip_tags((string) $value));
        if ($value === '' || mb_strlen($value) > $max) {
            throw new \InvalidArgumentException("{$label} is required and must be under {$max} characters.");
        }
        return $value;
    }

    private static function workflow(mixed $steps): array
    {
        if (!is_array($steps) || count($steps) !== 4) {
            throw new \InvalidArgumentException('The walkthrough needs exactly four steps.');
        }
        $out = [];
        foreach ($steps as $step) {
            $actor = ucfirst(strtolower(trim((string) ($step['actor'] ?? 'System'))));
            if (!in_array($actor, ['Lisa', 'Team', 'System'], true)) $actor = 'System';
            $out[] = [
                'label' => self::text($step['label'] ?? '', 80, 'Step label'),
                'detail' => self::text($step['detail'] ?? '', 280, 'Step detail'),
                'actor' => $actor,
            ];
        }
        return $out;
    }

    private static function publicShape(array $row): array
    {
        return [
            'business_name' => $row['business_name'],
            'headline' => $row['headline'],
            'outcome_summary' => $row['outcome_summary'],
            'friction_label' => $row['friction_label'],
            'workflow' => json_decode((string) $row['workflow_json'], true) ?: [],
            'proof_note' => $row['proof_note'],
            'cta_label' => 'Talk through a monitored pilot',
            'cta_url' => '/contact.html?source=account-demo',
        ];
    }
}
