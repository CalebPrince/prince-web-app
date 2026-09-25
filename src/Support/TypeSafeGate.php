<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Cheap pre-filter for Beacon's unsupervised paths, using TypeSafe's
 * System One (Jev) typed-judgment API instead of a full generative call.
 * Beacon's cron currently scores every raw search snippet with a full
 * ~3.3k-token AiAgentEngine call and rejects ~90% of them (see the comment
 * on BeaconController::generateForPost). This runs first and, once enforced,
 * skips that call for the obvious rejects.
 *
 * Fails open on any problem (no key configured, timeout, bad response):
 * the screen returns null and the caller falls straight through to the
 * existing full generative scoring. This can only ever cost a wasted network
 * round-trip, never make Beacon miss a lead it would otherwise have caught.
 *
 * Setting `typesafe_gate_mode`: 'shadow' (default) judges and logs only,
 * 'enforce' lets a failed gate skip the generative call, 'off' disables it.
 */
class TypeSafeGate
{
    private const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

    public static function mode(): string
    {
        $mode = strtolower(trim((string) Settings::get('typesafe_gate_mode')));
        return in_array($mode, ['off', 'enforce'], true) ? $mode : 'shadow';
    }

    /**
     * @return array{passes_gate:bool,buying_intent_score:float,competitor_probability:float}|null
     */
    public static function screenPost(string $platform, string $postContent, ?string $postUrl): ?array
    {
        $answers = self::ask([
            'platform' => $platform,
            'post_content' => $postContent,
            'post_url' => $postUrl,
        ], [
            'buying_intent' => [
                'type' => 'score',
                'instructions' => 'Rate whether the poster themselves needs web/mobile development '
                    . 'work done and could plausibly pay someone to do it, not whether the post is '
                    . 'merely on-topic for web development.',
                'criteria' => [
                    'Not a lead: a developer debugging/discussing tooling, a student, general '
                        . 'commentary, or a recruiter posting a salaried in-house role',
                    'Ambiguous: some signal either way, not enough to judge confidently',
                    'Genuine prospect: describes a concrete project or problem of their own they '
                        . 'want built and could hire someone for',
                ],
            ],
            'is_competitor_pitch' => self::competitorQuestion(
                'Is this actually someone or some agency pitching their OWN services, dressed up as '
                . 'if it were a question or a request for help?',
                'Agency-style phrasing ("we build/DM us/link in bio"), a business-like username, or '
                . 'a reusable ad template rather than a specific problem'
            ),
        ]);

        return self::verdict($answers, 'buying_intent', 'is_competitor_pitch');
    }

    /**
     * Same gate for a LinkedIn engagement lead (ICP fit on a profile headline,
     * not buying intent on a post). Returns the same shape as screenPost() so
     * Beacon treats both paths identically; buying_intent_score carries the
     * ICP-fit score here.
     *
     * @return array{passes_gate:bool,buying_intent_score:float,competitor_probability:float}|null
     */
    public static function screenEngager(string $name, ?string $headline, string $engagementType, ?string $commentText): ?array
    {
        $answers = self::ask([
            'name' => $name,
            'headline' => $headline,
            'engagement_type' => $engagementType,
            'comment_text' => $commentText,
        ], [
            'icp_fit' => [
                'type' => 'score',
                'instructions' => 'Rate whether this person could plausibly hire a web/mobile/AI '
                    . 'developer for their own business or team, judged from their headline and '
                    . 'comment, not from whether they are interested in the topic.',
                'criteria' => [
                    'Not a fit: a developer, designer, student, job seeker, or someone who builds '
                        . 'the same things we do',
                    'Ambiguous: vague headline or a bare reaction, not enough to judge confidently',
                    'Strong fit: owns, runs, or makes purchasing decisions for a business or team',
                ],
            ],
            'is_competitor' => self::competitorQuestion(
                'Is this person a freelancer, agency owner, or service provider selling web, app, or '
                . 'AI development to others?',
                'Headline or comment describes offering development/agency services'
            ),
        ]);

        return self::verdict($answers, 'icp_fit', 'is_competitor');
    }

    /** Shadow-mode audit line: the gate's call next to the full model's, for threshold tuning. */
    public static function logShadow(string $kind, ?array $gate, bool $modelQualified, int $modelConfidence): void
    {
        if ($gate === null || self::mode() !== 'shadow') {
            return;
        }
        try {
            Database::get()->prepare(
                'INSERT INTO typesafe_gate_log (kind, score, competitor, gate_passed, model_qualified, model_confidence)
                 VALUES (?, ?, ?, ?, ?, ?)'
            )->execute([
                $kind, $gate['buying_intent_score'], $gate['competitor_probability'],
                $gate['passes_gate'] ? 1 : 0, $modelQualified ? 1 : 0, $modelConfidence,
            ]);
        } catch (\Throwable $e) {
            // Table missing until migrate.php runs; the error_log line below still records it.
        }
        error_log(sprintf(
            'TypeSafeGate shadow [%s]: gate=%s score=%.2f competitor=%.2f | model qualified=%d confidence=%d%s',
            $kind,
            $gate['passes_gate'] ? 'pass' : 'reject',
            $gate['buying_intent_score'],
            $gate['competitor_probability'],
            $modelQualified ? 1 : 0,
            $modelConfidence,
            (!$gate['passes_gate'] && $modelQualified) ? ' | WOULD HAVE MISSED A LEAD' : ''
        ));
    }

    /** True when the gate should actually skip the generative call. */
    public static function shouldReject(?array $gate): bool
    {
        return $gate !== null && !$gate['passes_gate'] && self::mode() === 'enforce';
    }

    /**
     * Result Beacon returns for a gate rejection, so both paths reject identically.
     *
     * @return array{qualified:bool,confidence_score:int,reasoning:string,drafted_reply:string}
     */
    public static function rejection(array $gate): array
    {
        return [
            'qualified' => false,
            'confidence_score' => (int) round($gate['buying_intent_score'] * 50),
            'reasoning' => sprintf(
                'TypeSafe gate: fit %.2f, competitor_probability %.2f. Rejected before spending a generative call.',
                $gate['buying_intent_score'], $gate['competitor_probability']
            ),
            'drafted_reply' => '',
        ];
    }

    private static function competitorQuestion(string $instructions, string $trueCriterion): array
    {
        return [
            'type' => 'noul',
            'instructions' => $instructions,
            'criteria' => [
                'true' => $trueCriterion,
                'false' => 'Reads like a real individual or business describing their own need',
            ],
        ];
    }

    /** @return array<string,mixed>|null decoded `answers`, or null on any failure (fail open) */
    private static function ask(array $state, array $questions): ?array
    {
        $apiKey = Settings::get('typesafe_api_key');
        if (!$apiKey || !function_exists('curl_init') || self::mode() === 'off') {
            return null;
        }

        $ch = curl_init(self::ENDPOINT);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5, // the whole point of the gate is to stay fast: fail open, not slow
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'model' => 'jev-latest',
                'state' => json_encode($state),
                'questions' => $questions,
            ]),
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'TypeSafeGate: call failed: status=%s body=%s',
                $status,
                is_string($response) ? substr($response, 0, 500) : 'n/a'
            ));
            return null;
        }

        $decoded = json_decode($response, true);
        if (!is_array($decoded['answers'] ?? null)) {
            error_log('TypeSafeGate: unexpected response shape: ' . substr($response, 0, 500));
            return null;
        }
        return $decoded['answers'];
    }

    /** @return array{passes_gate:bool,buying_intent_score:float,competitor_probability:float}|null */
    private static function verdict(?array $answers, string $scoreKey, string $competitorKey): ?array
    {
        if ($answers === null) {
            return null;
        }
        $score = $answers[$scoreKey]['score'] ?? null;
        $competitor = $answers[$competitorKey]['noul'] ?? null;
        if (!is_numeric($score) || !is_numeric($competitor)) {
            error_log('TypeSafeGate: missing score/noul in answers: ' . substr((string) json_encode($answers), 0, 500));
            return null;
        }

        return [
            // score runs 0 (not a lead) .. 2 (genuine prospect), 1.0 = "ambiguous" midpoint.
            'passes_gate' => (float) $score >= 1.0 && (float) $competitor < 0.5,
            'buying_intent_score' => (float) $score,
            'competitor_probability' => (float) $competitor,
        ];
    }
}
