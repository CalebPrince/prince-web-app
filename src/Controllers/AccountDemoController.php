<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Agents\Arch;
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
            'industry' => $lead['industry'] ?? null,
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
        ActivityLog::log(
            $user,
            'generated',
            'account_demo',
            (string) $lead['id'],
            Arch::displayName() . ' · ' . (string) $lead['business_name']
        );
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
        if (!preg_match('/^[a-f0-9]{36}$/', $token) || !in_array($event, ['view', 'cta', 'interaction', 'scroll', 'engaged', 'session'], true)) {
            Response::error('Invalid event.', 422);
        }
        $pdo = Database::get();
        $value = max(0, (int) ($data['value'] ?? 0));
        $sql = match ($event) {
            'view' => "UPDATE account_demos SET views=views+1, last_viewed_at=datetime('now'), last_event_at=datetime('now') WHERE token=? AND status='published'",
            'cta' => "UPDATE account_demos SET cta_clicks=cta_clicks+1, last_event_at=datetime('now') WHERE token=? AND status='published'",
            'interaction' => "UPDATE account_demos SET interaction_count=interaction_count+1, last_event_at=datetime('now') WHERE token=? AND status='published'",
            'scroll' => "UPDATE account_demos SET max_scroll_depth=MAX(max_scroll_depth, ?), last_event_at=datetime('now') WHERE token=? AND status='published'",
            'engaged' => "UPDATE account_demos SET engaged_seconds=MAX(engaged_seconds, ?), last_event_at=datetime('now') WHERE token=? AND status='published'",
            'session' => "UPDATE account_demos SET max_scroll_depth=MAX(max_scroll_depth, ?), engaged_seconds=MAX(engaged_seconds, ?), last_event_at=datetime('now') WHERE token=? AND status='published'",
        };
        $stmt = $pdo->prepare($sql);
        if ($event === 'session') {
            $stmt->execute([
                min(100, max(0, (int) ($data['scroll'] ?? 0))),
                min(3600, max(0, (int) ($data['engaged'] ?? 0))),
                $token,
            ]);
        } else {
            $stmt->execute(in_array($event, ['scroll', 'engaged'], true)
                ? [min($event === 'scroll' ? 100 : 3600, $value), $token]
                : [$token]);
        }
        if ($stmt->rowCount() > 0) {
            self::refreshIntentScore($pdo, $token);
        }
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
        $row['personalization'] = self::personalization($row);
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

    private static function refreshIntentScore(\PDO $pdo, string $token): void
    {
        $stmt = $pdo->prepare(
            'SELECT views, cta_clicks, interaction_count, max_scroll_depth, engaged_seconds
             FROM account_demos WHERE token=?'
        );
        $stmt->execute([$token]);
        $metrics = $stmt->fetch();
        if (!$metrics) return;
        $score = min(20, (int) $metrics['views'] * 7)
            + min(25, (int) round((int) $metrics['max_scroll_depth'] * .25))
            + min(25, (int) round((int) $metrics['engaged_seconds'] / 6))
            + min(20, (int) $metrics['interaction_count'] * 4)
            + min(10, (int) $metrics['cta_clicks'] * 10);
        $pdo->prepare('UPDATE account_demos SET intent_score=? WHERE token=?')->execute([min(100, $score), $token]);
    }

    private static function draft(string $businessName, array $snapshot): array
    {
        $profile = self::profile($businessName, $snapshot);
        $fallback = self::fallbackDraft($businessName, $profile);
        $builderName = Arch::displayName();
        if (empty(Settings::get('gemini_api_key')) && empty(Settings::get('openrouter_api_key')) && empty(Settings::get('groq_api_key'))) {
            return $fallback;
        }
        $prompt = "You are {$builderName}, Prince Caleb's Architecture + AI website-builder agent. "
            . "Design the content architecture for a private, reviewed demo landing page for {$businessName}, "
            . "classified from the supplied evidence as {$profile['industry_label']}. "
            . "Use only the evidence JSON below. Do not claim knowledge of internal operations, missed revenue, call "
            . "volume, staff behavior, or results. Frame operational friction as a likely scenario or proposed starting "
            . "point. Make the language unmistakably specific to this business and sector: name the customer/request "
            . "type, handoff, and outcome that fit the evidence. Avoid generic phrases that could be pasted onto any "
            . "company. Focus on the future the buyer gets, not product features. Return JSON only with headline, "
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

    private static function profile(string $businessName, array $snapshot): array
    {
        $research = is_array($snapshot['research'] ?? null) ? $snapshot['research'] : [];
        $news = is_array($research['recent_news'] ?? null) ? $research['recent_news'] : [];
        $haystack = strtolower($businessName . ' ' . (string) ($snapshot['industry'] ?? '') . ' '
            . (string) ($research['summary'] ?? '') . ' '
            . implode(' ', array_map(
                static fn(mixed $item): string => is_array($item) ? (string) ($item['title'] ?? '') : (string) $item,
                $news
            )));
        $profiles = [
            'healthcare' => ['clinic', 'medical', 'hospital', 'health', 'dental', 'pharmacy', 'doctor', 'care'],
            'hospitality' => ['hotel', 'restaurant', 'bistro', 'cafe', 'food', 'resort', 'lodge', 'bar '],
            'finance' => ['bank', 'finance', 'insurance', 'credit', 'investment', 'pay ', 'fintech', 'accounting'],
            'property' => ['real estate', 'property', 'homes', 'construction', 'architect', 'estate'],
            'education' => ['school', 'academy', 'college', 'university', 'training', 'education', 'institute'],
            'commerce' => ['shop', 'store', 'retail', 'market', 'fashion', 'beauty', 'salon', 'logistics'],
        ];
        $template = 'professional';
        foreach ($profiles as $candidate => $keywords) {
            foreach ($keywords as $keyword) {
                if (str_contains($haystack, $keyword)) {
                    $template = $candidate;
                    break 2;
                }
            }
        }
        $labels = [
            'healthcare' => 'Patient access & care',
            'hospitality' => 'Guest experience',
            'finance' => 'Client service & trust',
            'property' => 'Enquiry-to-viewing journey',
            'education' => 'Learner enquiries & enrolment',
            'commerce' => 'Customer service & fulfilment',
            'professional' => 'Client operations',
        ];
        return ['template' => $template, 'industry_label' => $labels[$template]];
    }

    private static function fallbackDraft(string $businessName, array $profile): array
    {
        $sector = [
            'healthcare' => [
                'headline' => "A calmer patient journey for {$businessName}",
                'summary' => 'Give patients an immediate first response, capture the reason for contact, and move booking or follow-up forward without interrupting clinical attention.',
                'friction' => 'A likely pressure point: appointment and service questions arrive while the team is already focused on patient care.',
                'steps' => [
                    ['A patient reaches out', 'Calls and messages receive an immediate, reassuring first response.', 'Lisa'],
                    ['The need is understood', 'Approved questions, service details, and booking information are captured clearly.', 'Lisa'],
                    ['Clinical judgment stays human', 'Urgent, sensitive, or uncertain requests reach the appropriate team member with context.', 'Team'],
                    ['Follow-up stays visible', 'The patient receives a next step and the clinic retains a clear follow-up record.', 'System'],
                ],
            ],
            'hospitality' => [
                'headline' => "A more attentive guest journey for {$businessName}",
                'summary' => 'Respond to booking and service enquiries while interest is fresh, keep routine questions moving, and hand special requests to the right person.',
                'friction' => 'A likely pressure point: guest questions and booking enquiries compete with serving the people already on site.',
                'steps' => [
                    ['A guest makes an enquiry', 'Availability, location, menu, or service questions receive an immediate first response.', 'Lisa'],
                    ['The request takes shape', 'Dates, party details, preferences, and the next booking step are captured.', 'Lisa'],
                    ['Special requests reach staff', 'Exceptions and requests needing discretion move to the team with context.', 'Team'],
                    ['The guest gets clarity', 'A confirmation or clear next step keeps the experience moving.', 'System'],
                ],
            ],
            'finance' => [
                'headline' => "A clearer client service journey for {$businessName}",
                'summary' => 'Triage routine enquiries consistently, collect the right context, and preserve human review wherever trust, identity, or financial judgment matters.',
                'friction' => 'A likely pressure point: repetitive service enquiries consume time while sensitive decisions still require qualified human review.',
                'steps' => [
                    ['A client asks for help', 'The enquiry receives an immediate acknowledgement and clear boundaries.', 'Lisa'],
                    ['Context is collected', 'Approved service information and the reason for contact are captured consistently.', 'Lisa'],
                    ['Sensitive work stays human', 'Identity, account, and judgment-based matters are handed to authorised staff.', 'Team'],
                    ['The next step is recorded', 'The client receives clear direction and the business retains an auditable follow-up trail.', 'System'],
                ],
            ],
            'property' => [
                'headline' => "Turn property interest into a clear next step for {$businessName}",
                'summary' => 'Answer initial property questions, qualify viewing intent, and route serious enquiries to an agent with the details already organised.',
                'friction' => 'A likely pressure point: property enquiries lose momentum when basic questions and viewing details wait for an available agent.',
                'steps' => [
                    ['A buyer shows interest', 'The property enquiry receives an immediate response.', 'Lisa'],
                    ['Intent is qualified', 'Location, budget, timing, and viewing preferences are captured.', 'Lisa'],
                    ['An agent takes over', 'Negotiation and property-specific judgment reach the team with context.', 'Team'],
                    ['The viewing moves forward', 'The prospect receives a clear next step and follow-up remains visible.', 'System'],
                ],
            ],
            'education' => [
                'headline' => "A simpler enquiry-to-enrolment journey for {$businessName}",
                'summary' => 'Help prospective learners and parents find programme information, capture enrolment intent, and reach admissions staff with the right context.',
                'friction' => 'A likely pressure point: repeated programme and admissions questions arrive while staff are supporting current learners.',
                'steps' => [
                    ['A learner asks a question', 'Programme, schedule, and application enquiries receive an immediate response.', 'Lisa'],
                    ['Interest is captured', 'The course, timing, and contact details are organised for follow-up.', 'Lisa'],
                    ['Admissions steps in', 'Eligibility and exception-based questions reach staff with context.', 'Team'],
                    ['Enrolment stays moving', 'The learner receives the next action and the enquiry remains visible.', 'System'],
                ],
            ],
            'commerce' => [
                'headline' => "A faster customer journey for {$businessName}",
                'summary' => 'Handle product and service questions immediately, capture buying intent, and bring staff in for exceptions without losing the customer’s context.',
                'friction' => 'A likely pressure point: availability, order, and service questions interrupt fulfilment while customers wait for answers.',
                'steps' => [
                    ['A customer reaches out', 'Product, availability, delivery, or service questions get a quick first response.', 'Lisa'],
                    ['Buying intent is captured', 'The requested item, timing, and contact details are organised.', 'Lisa'],
                    ['Exceptions reach staff', 'Pricing judgment, complaints, and unusual requests move to the team.', 'Team'],
                    ['The order stays moving', 'The customer receives a next step and follow-up is recorded.', 'System'],
                ],
            ],
            'professional' => [
                'headline' => "A more responsive client journey for {$businessName}",
                'summary' => 'Give new enquiries an immediate response, collect the essentials, and route judgment-based work to the right person without losing context.',
                'friction' => 'A likely pressure point: routine enquiries compete with the focused work only the team can deliver.',
                'steps' => [
                    ['A client reaches out', 'A new enquiry receives an immediate, consistent first response.', 'Lisa'],
                    ['The need is clarified', 'Service interest, timing, and essential details are captured.', 'Lisa'],
                    ['Judgment stays human', 'Complex, sensitive, or commercial decisions reach the team with context.', 'Team'],
                    ['Follow-up stays organised', 'The client receives a clear next step and the opportunity remains visible.', 'System'],
                ],
            ],
        ][$profile['template']];
        return [
            'headline' => $sector['headline'],
            'outcome_summary' => $sector['summary'],
            'friction_label' => $sector['friction'],
            'workflow' => array_map(static fn(array $step): array => [
                'label' => $step[0], 'detail' => $step[1], 'actor' => $step[2],
            ], $sector['steps']),
            'proof_note' => 'This proposed workflow uses only publicly available and audited information. It is a starting point for review, not a claim about current internal operations.',
        ];
    }

    private static function personalization(array $row): array
    {
        $snapshot = json_decode((string) ($row['source_snapshot_json'] ?? '{}'), true) ?: [];
        $profile = self::profile((string) $row['business_name'], $snapshot);
        $themes = [
            'healthcare' => ['accent' => '#087f8c', 'navy' => '#103b43', 'paper' => '#f1f8f7', 'soft' => '#d9efeb', 'warm' => '#e89b62'],
            'hospitality' => ['accent' => '#a4475b', 'navy' => '#40243a', 'paper' => '#fbf5f0', 'soft' => '#f2d9d7', 'warm' => '#d79a4a'],
            'finance' => ['accent' => '#2455a6', 'navy' => '#142b4a', 'paper' => '#f4f7fa', 'soft' => '#dce6f3', 'warm' => '#c59a42'],
            'property' => ['accent' => '#b75d31', 'navy' => '#293833', 'paper' => '#f7f5ef', 'soft' => '#e8e1d2', 'warm' => '#d6a84b'],
            'education' => ['accent' => '#6556b3', 'navy' => '#2f2854', 'paper' => '#f7f5fb', 'soft' => '#e8e2f5', 'warm' => '#e0a146'],
            'commerce' => ['accent' => '#d0572b', 'navy' => '#28282d', 'paper' => '#faf7f2', 'soft' => '#f2ded2', 'warm' => '#e8a331'],
            'professional' => ['accent' => '#3157e8', 'navy' => '#101b35', 'paper' => '#f5f7fb', 'soft' => '#dfe6ff', 'warm' => '#e6a234'],
        ];
        $audit = is_array($snapshot['audit'] ?? null) ? $snapshot['audit'] : [];
        $research = is_array($snapshot['research'] ?? null) ? $snapshot['research'] : [];
        $evidence = [];
        if (($audit['reachable'] ?? null) === false) {
            $evidence[] = 'The public website was unreachable during the recorded audit.';
        }
        foreach (array_slice(is_array($audit['issues'] ?? null) ? $audit['issues'] : [], 0, 2) as $issue) {
            $detail = trim((string) (is_array($issue) ? ($issue['detail'] ?? '') : $issue));
            if ($detail !== '') $evidence[] = $detail;
        }
        foreach (array_slice(is_array($research['tech_stack'] ?? null) ? $research['tech_stack'] : [], 0, 2) as $tech) {
            $signal = trim((string) (is_array($tech) ? ($tech['signal'] ?? '') : $tech));
            if ($signal !== '') $evidence[] = "Public site signal: {$signal}.";
        }
        if (!$evidence) {
            $evidence[] = empty($snapshot['website_url'])
                ? 'No public website was on file when this walkthrough was prepared.'
                : 'The concept is limited to the public website and research evidence reviewed.';
        }
        $name = trim((string) $row['business_name']);
        $words = preg_split('/\s+/', $name) ?: [];
        $initials = strtoupper(implode('', array_map(
            static fn(string $word): string => mb_substr($word, 0, 1),
            array_slice(array_filter($words), 0, 2)
        )));
        $host = parse_url((string) ($snapshot['website_url'] ?? ''), PHP_URL_HOST) ?: null;
        return [
            'template' => $profile['template'],
            'variant' => (abs((int) crc32($name)) % 3) + 1,
            'industry_label' => $profile['industry_label'],
            'builder_name' => Arch::displayName(),
            'initials' => $initials ?: 'PC',
            'website_host' => $host ? preg_replace('/^www\./i', '', (string) $host) : null,
            'theme' => $themes[$profile['template']],
            'evidence_points' => array_slice(array_values(array_unique($evidence)), 0, 4),
        ];
    }

    private static function publicShape(array $row): array
    {
        $personalization = self::personalization($row);
        return [
            'business_name' => $row['business_name'],
            'headline' => $row['headline'],
            'outcome_summary' => $row['outcome_summary'],
            'friction_label' => $row['friction_label'],
            'workflow' => json_decode((string) $row['workflow_json'], true) ?: [],
            'proof_note' => $row['proof_note'],
            'personalization' => $personalization,
            'cta_label' => 'Talk through a monitored pilot',
            'cta_url' => '/contact.html?source=account-demo',
        ];
    }
}
