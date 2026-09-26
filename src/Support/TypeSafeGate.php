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

    /** Score below this rejects a candidate. Bounded so a typo cannot make the gate reject everything. */
    public const SCORE_MIN = 0.25;
    public const SCORE_MAX = 1.75;
    public const COMPETITOR_MIN = 0.2;
    public const COMPETITOR_MAX = 0.9;

    public static function scoreThreshold(): float
    {
        $v = Settings::get('typesafe_score_threshold');
        return is_numeric($v) ? max(self::SCORE_MIN, min(self::SCORE_MAX, (float) $v)) : 1.0;
    }

    public static function competitorCutoff(): float
    {
        $v = Settings::get('typesafe_competitor_cutoff');
        return is_numeric($v) ? max(self::COMPETITOR_MIN, min(self::COMPETITOR_MAX, (float) $v)) : 0.5;
    }

    /**
     * Change either threshold. Rejects values outside the safe bounds instead
     * of silently clamping, so the caller (Rocco, or the Apply button) can say
     * exactly what was refused.
     *
     * @return array<string,mixed>
     */
    public static function setThresholds(?float $score, ?float $competitor): array
    {
        if ($score === null && $competitor === null) {
            return ['error' => 'Give a score threshold, a competitor cutoff, or both.'];
        }
        if ($score !== null && ($score < self::SCORE_MIN || $score > self::SCORE_MAX)) {
            return ['error' => sprintf('Score threshold must be between %.2f and %.2f.', self::SCORE_MIN, self::SCORE_MAX)];
        }
        if ($competitor !== null && ($competitor < self::COMPETITOR_MIN || $competitor > self::COMPETITOR_MAX)) {
            return ['error' => sprintf('Competitor cutoff must be between %.2f and %.2f.', self::COMPETITOR_MIN, self::COMPETITOR_MAX)];
        }
        $previous = ['score_threshold' => self::scoreThreshold(), 'competitor_cutoff' => self::competitorCutoff()];
        if ($score !== null) {
            Settings::set('typesafe_score_threshold', rtrim(rtrim(number_format($score, 2, '.', ''), '0'), '.'));
        }
        if ($competitor !== null) {
            Settings::set('typesafe_competitor_cutoff', rtrim(rtrim(number_format($competitor, 2, '.', ''), '0'), '.'));
        }
        return [
            'changed' => true, 'previous' => $previous,
            'now' => ['score_threshold' => self::scoreThreshold(), 'competitor_cutoff' => self::competitorCutoff()],
        ];
    }

    /**
     * What one call costs, in USD, as entered by the owner in Settings. Null
     * when unset: prices are never guessed, so cost figures stay blank until
     * both are filled in.
     *
     * @return array{gate:?float,full_call:?float}
     */
    public static function costs(): array
    {
        $read = static function (string $key): ?float {
            $v = Settings::get($key);
            return is_numeric($v) && (float) $v >= 0 ? (float) $v : null;
        };
        return ['gate' => $read('typesafe_cost_per_call_usd'), 'full_call' => $read('beacon_full_call_cost_usd')];
    }

    /**
     * Record one gate outcome next to what the full model decided, for the
     * report. In shadow mode every row is a clean sample (the full model ran
     * regardless). In enforce mode rows are marked so they are excluded from
     * threshold sweeps (only gate-passed candidates reach the model then) but
     * still count towards spend and calls skipped.
     */
    public static function logOutcome(string $kind, ?array $gate, bool $modelQualified, int $modelConfidence): void
    {
        if ($gate === null) {
            return;
        }
        self::insertLog($kind, $gate, $modelQualified, $modelConfidence, false);
        if (self::mode() !== 'shadow') {
            return;
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

    private static function insertLog(string $kind, array $gate, bool $modelQualified, int $modelConfidence, bool $skipped): void
    {
        try {
            Database::get()->prepare(
                'INSERT INTO typesafe_gate_log (kind, score, competitor, gate_passed, model_qualified, model_confidence, enforced)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $kind, $gate['buying_intent_score'], $gate['competitor_probability'],
                $gate['passes_gate'] ? 1 : 0, $modelQualified ? 1 : 0, $modelConfidence,
                self::mode() === 'enforce' || $skipped ? 1 : 0,
            ]);
        } catch (\Throwable $e) {
            // Table or column missing until migrate.php runs; never break Beacon over an audit row.
        }
    }

    /**
     * Shadow and enforce results for the admin page, Rocco and the CLI script:
     * per kind, a threshold sweep of calls saved vs leads the full model
     * qualified that the gate would have rejected, real cost figures when the
     * owner has entered prices, and a plain verdict.
     *
     * @return array<string,mixed>
     */
    public static function report(): array
    {
        $pdo = Database::get();
        $competitorCut = self::competitorCutoff();
        $currentThreshold = self::scoreThreshold();
        $minSample = 200;
        $kinds = [];
        $base = [
            'mode' => self::mode(), 'has_key' => (bool) Settings::get('typesafe_api_key'),
            'score_threshold' => $currentThreshold, 'competitor_cutoff' => $competitorCut,
            'min_sample' => $minSample,
        ];

        try {
            $calls = (int) $pdo->query('SELECT COUNT(*) FROM typesafe_gate_log')->fetchColumn();
            $sample = (int) $pdo->query('SELECT COUNT(*) FROM typesafe_gate_log WHERE enforced = 0')->fetchColumn();
            $skipped = (int) $pdo->query('SELECT COUNT(*) FROM typesafe_gate_log WHERE enforced = 1 AND gate_passed = 0')->fetchColumn();
            $first = $pdo->query('SELECT MIN(created_at) FROM typesafe_gate_log')->fetchColumn() ?: null;
        } catch (\Throwable $e) {
            return $base + [
                'table_missing' => true, 'total' => 0, 'sample' => 0, 'first_logged_at' => null, 'kinds' => [],
                'cost' => null, 'verdict' => 'needs_migration',
                'verdict_text' => 'The log table is not up to date. Run php database/migrate.php on the server.',
            ];
        }

        $thresholds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5];
        if (!in_array($currentThreshold, $thresholds, true)) {
            $thresholds[] = $currentThreshold;
            sort($thresholds);
        }

        $wouldSkip = 0;
        foreach (['post', 'engagement'] as $kind) {
            $stmt = $pdo->prepare('SELECT score, competitor, model_qualified FROM typesafe_gate_log WHERE kind = ? AND enforced = 0');
            $stmt->execute([$kind]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            $n = count($rows);
            if ($n === 0) {
                continue;
            }
            $qualified = (int) array_sum(array_column($rows, 'model_qualified'));
            $sweep = [];
            foreach ($thresholds as $threshold) {
                $rejected = 0;
                $missed = 0;
                foreach ($rows as $r) {
                    if ((float) $r['score'] < $threshold || (float) $r['competitor'] >= $competitorCut) {
                        $rejected++;
                        $missed += (int) $r['model_qualified'];
                    }
                }
                $isCurrent = abs($threshold - $currentThreshold) < 0.001;
                if ($isCurrent) {
                    $wouldSkip += $rejected;
                }
                $sweep[] = [
                    'threshold' => $threshold, 'rejected' => $rejected,
                    'saved_pct' => round($rejected / $n * 100), 'missed' => $missed,
                    'current' => $isCurrent,
                ];
            }
            // Same idea for the competitor check: hold the score threshold where it is and vary the cutoff.
            $cutoffs = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
            if (!in_array($competitorCut, $cutoffs, true)) {
                $cutoffs[] = $competitorCut;
                sort($cutoffs);
            }
            $competitorSweep = [];
            foreach ($cutoffs as $cutoff) {
                $rejected = 0;
                $missed = 0;
                foreach ($rows as $r) {
                    if ((float) $r['score'] < $currentThreshold || (float) $r['competitor'] >= $cutoff) {
                        $rejected++;
                        $missed += (int) $r['model_qualified'];
                    }
                }
                $competitorSweep[] = [
                    'cutoff' => $cutoff, 'rejected' => $rejected,
                    'saved_pct' => round($rejected / $n * 100), 'missed' => $missed,
                    'current' => abs($cutoff - $competitorCut) < 0.001,
                ];
            }
            $kinds[$kind] = [
                'candidates' => $n, 'qualified' => $qualified,
                'sweep' => $sweep, 'competitor_sweep' => $competitorSweep,
            ];
        }

        $price = self::costs();
        $cost = [
            'gate_per_call' => $price['gate'], 'full_per_call' => $price['full_call'],
            'calls' => $calls, 'skipped' => $skipped, 'would_skip' => $wouldSkip,
            'gate_spend' => $price['gate'] !== null ? round($calls * $price['gate'], 4) : null,
            'actual_saved' => $price['full_call'] !== null ? round($skipped * $price['full_call'], 4) : null,
            'actual_net' => null,
            'projected_saved' => $price['full_call'] !== null ? round($wouldSkip * $price['full_call'], 4) : null,
            'projected_net' => null,
        ];
        if ($price['gate'] !== null && $price['full_call'] !== null) {
            $cost['actual_net'] = round($cost['actual_saved'] - $cost['gate_spend'], 4);
            $cost['projected_net'] = round($cost['projected_saved'] - $sample * $price['gate'], 4);
        }

        [$verdict, $text] = self::verdict_for($sample, $kinds, $currentThreshold, $minSample, $cost['projected_net']);
        return $base + [
            'table_missing' => false, 'total' => $calls, 'sample' => $sample, 'first_logged_at' => $first,
            'kinds' => $kinds, 'cost' => $cost, 'verdict' => $verdict, 'verdict_text' => $text,
        ];
    }

    /** @return array{0:string,1:string} */
    private static function verdict_for(int $sample, array $kinds, float $currentThreshold, int $minSample, ?float $projectedNet): array
    {
        if ($sample < $minSample) {
            return ['collecting', sprintf(
                'Still collecting data: %d of about %d candidates so far. Too early to judge.', $sample, $minSample
            )];
        }
        $missed = 0;
        $qualified = 0;
        $rejectedAtCurrent = 0;
        foreach ($kinds as $k) {
            foreach ($k['sweep'] as $row) {
                if ($row['current']) {
                    $missed += $row['missed'];
                    $rejectedAtCurrent += $row['rejected'];
                }
            }
            $qualified += $k['qualified'];
        }
        $savedPct = $sample > 0 ? round($rejectedAtCurrent / $sample * 100) : 0;
        if ($missed > 0) {
            return ['not_yet', "Not safe yet: it would have wrongly rejected {$missed} of {$qualified} real leads. Keep it in shadow mode, or raise the strictness tuning."];
        }
        if ($projectedNet !== null && $projectedNet <= 0) {
            return ['not_worth_it', sprintf(
                'Safe, but not worth it: it misses no leads, yet on your entered prices the gate would cost about $%.2f more than the AI calls it skips.',
                abs($projectedNet)
            )];
        }
        $netNote = $projectedNet !== null ? sprintf(' On your entered prices that nets about $%.2f saved over this sample.', $projectedNet) : '';
        if ($savedPct >= 30) {
            return ['safe', "Safe to enforce: it would have skipped {$savedPct}% of the expensive AI calls and missed none of the {$qualified} leads the full AI qualified.{$netNote}"];
        }
        return ['low_value', "It misses nothing, but would only skip {$savedPct}% of calls, so the saving is small.{$netNote}"];
    }

    /** True when the gate should actually skip the generative call. */
    public static function shouldReject(?array $gate): bool
    {
        return $gate !== null && !$gate['passes_gate'] && self::mode() === 'enforce';
    }

    /**
     * Result Beacon returns for a gate rejection, so both paths reject
     * identically. Also records the skipped call so spend and savings are real.
     *
     * @return array{qualified:bool,confidence_score:int,reasoning:string,drafted_reply:string}
     */
    public static function rejection(array $gate, string $kind): array
    {
        self::insertLog($kind, $gate, false, 0, true);
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
            'passes_gate' => (float) $score >= self::scoreThreshold() && (float) $competitor < self::competitorCutoff(),
            'buying_intent_score' => (float) $score,
            'competitor_probability' => (float) $competitor,
        ];
    }
}
