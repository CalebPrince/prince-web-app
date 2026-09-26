<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Jev as the gatekeeper for messages agents send to customers on their own:
 * Nurturer's follow-up emails, the drip emails and the drip WhatsApp messages.
 * Before each send Jev reads what has already happened with that person (what
 * we sent, whether they replied, what they said) and answers two questions: has
 * the recipient signalled they are not interested, and is this message
 * appropriate to send now. Fixed rules turn that into one of:
 *
 *   send   as before
 *   skip   not now. It is asked again later, and after agent_customer_max_defer_days
 *          (default 3) of continuous skipping the step is abandoned
 *   stop   the recipient has clearly lost interest: the enrollment is stopped so
 *          no further automated message goes to them
 *
 * Only what an agent sends by itself is gated. Anything a human wrote and
 * approved (cold outreach pitches) and transactional messages (invoices,
 * booking reminders) are deliberately outside it. Modes and fail-open behaviour:
 * see AgentJudgment. Shadow records what would have happened and always sends.
 */
final class CustomerMessages
{
    public const STOP_AT = 0.85;
    public const APPROPRIATE_AT = 0.50;
    private const DEFAULT_MAX_DEFER_DAYS = 3;
    private const RECHECK_HOURS = 12;

    /**
     * @param array{agent:string,channel:string,kind:string,ref:string,enrollment_id?:int,name?:string,industry?:string,last_action?:string,subject?:string,message?:string} $c
     * @return array{action:string,reason:string,mode:string}
     */
    public static function check(array $c): array
    {
        $mode = AgentJudgment::mode('customer');
        $out = ['action' => 'send', 'reason' => '', 'mode' => $mode];
        if ($mode === 'off' || !AgentJudgment::available()) {
            return $out;
        }
        try {
            $pdo = Database::get();
            $live = $mode === 'live';

            if ($live) {
                // A step already abandoned stays abandoned, and a recent "skip" is not re-asked every run.
                $prior = self::priorLive($pdo, $c['ref']);
                if ($prior['abandoned']) {
                    return ['action' => 'skip', 'reason' => 'abandoned earlier: kept getting judged inappropriate', 'mode' => $mode];
                }
                if ($prior['recent_skip']) {
                    return ['action' => 'skip', 'reason' => 'judged not appropriate recently, asked again later', 'mode' => $mode];
                }
            }

            $history = isset($c['enrollment_id']) ? self::history($pdo, (int) $c['enrollment_id']) : ['sent' => [], 'replies' => [], 'days_enrolled' => null];
            $read = self::read($c, $history);
            if ($read === null) {
                return $out + ['reason' => 'Jev unavailable'];
            }

            [$action, $why] = self::decide($read);
            if ($action === 'skip' && $live) {
                $first = self::firstLiveSkip($pdo, $c['ref']);
                $maxDays = max(1, (int) (Settings::get('agent_customer_max_defer_days') ?: self::DEFAULT_MAX_DEFER_DAYS));
                if ($first !== null && $first < time() - $maxDays * 86400) {
                    AgentJudgment::record('customer_message', $c['agent'], $c['kind'], $c['ref'], $mode, $read, 'abandon', $why, "abandoned after {$maxDays} days of being judged inappropriate");
                    return ['action' => 'skip', 'reason' => "abandoned after {$maxDays} days: {$why}", 'mode' => $mode];
                }
            }

            AgentJudgment::record(
                'customer_message', $c['agent'], $c['kind'], $c['ref'], $mode, $read, $action, $why,
                $live ? ($action === 'send' ? 'sent' : ($action === 'stop' ? 'enrollment stopped' : 'not sent this time')) : 'shadow: would ' . $action
            );
            if ($live) {
                $out['action'] = $action;
            }
            $out['reason'] = $why;
            return $out;
        } catch (\Throwable $e) {
            error_log('CustomerMessages: ' . $e->getMessage());
            return ['action' => 'send', 'reason' => 'error, sent as usual', 'mode' => $mode];
        }
    }

    /**
     * Pure decision from Jev's two readings.
     *
     * @param array{disinterested:float,appropriate:float} $r
     * @return array{0:string,1:string}
     */
    public static function decide(array $r): array
    {
        if ($r['disinterested'] >= self::STOP_AT) {
            return ['stop', sprintf('the recipient looks uninterested or annoyed (%.0f%%)', $r['disinterested'] * 100)];
        }
        if ($r['appropriate'] < self::APPROPRIATE_AT) {
            return ['skip', sprintf('not a good time for this message (%.0f%% appropriate)', $r['appropriate'] * 100)];
        }
        return ['send', 'appropriate'];
    }

    /** Stop every further automated message to this person. */
    public static function stopEnrollment(\PDO $pdo, int $enrollmentId): void
    {
        $pdo->prepare("UPDATE drip_enrollments SET status = 'stopped' WHERE id = ? AND status = 'active'")->execute([$enrollmentId]);
    }

    /**
     * What has already happened with this lead, for Jev to read.
     *
     * @return array{sent:array<int,array<string,mixed>>,replies:array<int,array<string,mixed>>,days_enrolled:?int}
     */
    public static function history(\PDO $pdo, int $enrollmentId): array
    {
        $sent = [];
        $q = $pdo->prepare(
            "SELECT 'drip' AS kind, s.subject AS subject, ds.sent_at AS at
               FROM drip_sends ds JOIN drip_steps s ON s.id = ds.step_id WHERE ds.enrollment_id = ?
             UNION ALL
             SELECT 'nurturer', ns.subject_line, ns.sent_at FROM nurturer_sends ns WHERE ns.enrollment_id = ?
             ORDER BY at DESC LIMIT 6"
        );
        $q->execute([$enrollmentId, $enrollmentId]);
        foreach ($q->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $sent[] = ['type' => $r['kind'], 'subject' => mb_substr((string) $r['subject'], 0, 120), 'days_ago' => self::daysAgo((string) $r['at'])];
        }

        $replies = [];
        try {
            $q = $pdo->prepare("SELECT classification, body, received_at FROM nurturer_replies WHERE enrollment_id = ? ORDER BY id DESC LIMIT 3");
            $q->execute([$enrollmentId]);
            foreach ($q->fetchAll(\PDO::FETCH_ASSOC) as $r) {
                $replies[] = [
                    'days_ago' => self::daysAgo((string) $r['received_at']),
                    'classified_as' => (string) $r['classification'],
                    'excerpt' => mb_substr(trim(preg_replace('/\s+/', ' ', (string) $r['body']) ?? ''), 0, 240),
                ];
            }
        } catch (\Throwable $e) {
            error_log('CustomerMessages: could not read reply history: ' . $e->getMessage());
        }

        $e = $pdo->prepare('SELECT enrolled_at FROM drip_enrollments WHERE id = ?');
        $e->execute([$enrollmentId]);
        $enrolled = $e->fetchColumn();
        return ['sent' => $sent, 'replies' => $replies, 'days_enrolled' => $enrolled ? (int) floor(self::daysAgo((string) $enrolled)) : null];
    }

    private static function daysAgo(string $utc): float
    {
        return round((time() - strtotime($utc . ' UTC')) / 86400, 1);
    }

    /**
     * @return array{disinterested:float,appropriate:float}|null
     */
    private static function read(array $c, array $history): ?array
    {
        $answers = TypeSafeClient::ask([
            'context' => 'A solo web, mobile and AI studio owner has automated follow-up messages to business leads. Judge whether the next one should go out now.',
            'channel' => $c['channel'],
            'lead' => ['name' => $c['name'] ?? '', 'industry' => $c['industry'] ?? '', 'what_they_did' => $c['last_action'] ?? ''],
            'days_since_they_joined' => $history['days_enrolled'],
            'messages_already_sent_to_them' => $history['sent'],
            'replies_from_them' => $history['replies'],
            'message_about_to_be_sent' => ['subject' => mb_substr((string) ($c['subject'] ?? ''), 0, 200), 'text' => mb_substr((string) ($c['message'] ?? ''), 0, 500)],
        ], [
            'disinterested' => AgentJudgment::yesNo(
                'Has this person signalled, directly or indirectly, that they are not interested, are annoyed, or want to be left alone?',
                'Yes: a reply or behaviour shows disinterest, irritation or a wish to be left alone.',
                'No: no such signal. Silence alone is not a signal.'
            ),
            'appropriate' => AgentJudgment::yesNo(
                'Given what has already happened, is sending this message now reasonable and welcome rather than pushy?',
                'Yes: no negative signal, enough time has passed, and the message fits where they are.',
                'No: it would talk over a reply of theirs, repeat what they already got, ignore what they said, or come too soon.'
            ),
        ], 5, 'CustomerMessages');
        if ($answers === null) {
            return null;
        }
        $dis = TypeSafeClient::noul($answers, 'disinterested');
        $app = TypeSafeClient::noul($answers, 'appropriate');
        if ($dis === null || $app === null) {
            error_log('CustomerMessages: incomplete answers: ' . substr((string) json_encode($answers), 0, 300));
            return null;
        }
        return ['disinterested' => round($dis, 3), 'appropriate' => round($app, 3)];
    }

    /** @return array{abandoned:bool,recent_skip:bool} from live decisions only (shadow rows never change behaviour) */
    private static function priorLive(\PDO $pdo, string $ref): array
    {
        $st = $pdo->prepare(
            "SELECT decision, created_at FROM agent_decisions WHERE area = 'customer_message' AND ref = ? AND mode = 'live' ORDER BY id DESC LIMIT 20"
        );
        $st->execute([$ref]);
        $abandoned = false;
        $recent = false;
        foreach ($st->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            if ($r['decision'] === 'abandon') {
                $abandoned = true;
            }
            if ($r['decision'] === 'skip' && strtotime((string) $r['created_at'] . ' UTC') > time() - self::RECHECK_HOURS * 3600) {
                $recent = true;
            }
        }
        return ['abandoned' => $abandoned, 'recent_skip' => $recent];
    }

    private static function firstLiveSkip(\PDO $pdo, string $ref): ?int
    {
        $st = $pdo->prepare("SELECT MIN(created_at) FROM agent_decisions WHERE area = 'customer_message' AND ref = ? AND mode = 'live' AND decision = 'skip'");
        $st->execute([$ref]);
        $v = $st->fetchColumn();
        return $v ? (int) strtotime((string) $v . ' UTC') : null;
    }
}
