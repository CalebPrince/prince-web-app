<?php

declare(strict_types=1);

namespace App\Support;

use PDO;

/**
 * Chloe — Technical Operations & Monitoring. Her mission: continuously
 * understand the operational health of every system Caleb manages,
 * investigate anomalies, and escalate only what actually requires his
 * attention.
 *
 * The whole point of her is the gap between a raw monitor and a supervisor:
 * check_uptime.php used to email "X is DOWN" the instant a probe failed
 * twice. That's an alert, not an investigation. Chloe instead asks the
 * follow-up questions a person would ask before waking Caleb up — does DNS
 * even resolve, what's the actual HTTP status, are other sites down too
 * (shared infra vs. one app), did a deploy just land — and only escalates
 * once the evidence is both confident and has held for a few minutes, so a
 * single blip never reaches WhatsApp.
 *
 * Three design choices worth knowing:
 *
 * 1. Every fact in a narrative comes from evidence gathered in this class —
 *    a live DNS check, the last two recorded uptime_checks rows, a count of
 *    other monitors currently down, projects.last_deployed_at. Nothing is
 *    invented, and (deliberately, unlike Chief's briefs) nothing is handed to
 *    an AI model to phrase either: this runs inline in the uptime cron, and
 *    a monitoring agent that depends on an AI provider being up and fast is
 *    a worse bet than one that always speaks in the same plain, confident
 *    voice. The composed narrative already reads like the example Caleb
 *    asked for.
 *
 * 2. Escalation is gated on two things at once — confidence AND how long
 *    the problem has actually persisted (self::shouldEscalate) — mirroring
 *    Beacon's confidence-gate pattern (BeaconController::AUTO_ACCEPT_THRESHOLD)
 *    but for time-to-notify rather than auto-accept. A new incident is never
 *    escalated on the very first pass; it needs a second confirmed check and
 *    a few minutes elapsed, which is what makes "confirmed from two checks"
 *    literally true rather than a nicety in the copy.
 *
 * 3. Automation failures (agent_tasks stuck in 'failed') become incidents
 *    too, but are surfaced for review rather than auto-escalated — a single
 *    failed background task is real but rarely urgent enough for a WhatsApp
 *    ping, the same caution Beacon applies to a low-confidence lead.
 *
 * 4. "Unusual activity" reuses ErrorLogController's own log parsing
 *    (recentSeverityCounts) rather than a new history table — the baseline
 *    is just the hour of fatal/error entries right before the recent window,
 *    in the same log files Admin -> Error Logs already reads. A spike is
 *    opened but, like a fresh uptime incident, never escalated on the very
 *    first pass — only once it's still elevated on the next review.
 */
class ChloeInvestigator
{
    public const AGENT_NAME = 'Chloe';

    private const MIN_CONFIDENCE_TO_ESCALATE = 70;
    private const MIN_MINUTES_DOWN_TO_ESCALATE = 3;

    /** A spike needs at least this many fatal/error entries in the recent window to count at all — otherwise a quiet log going from 1 error to 2 would "triple" its rate for no real reason. */
    private const MIN_ANOMALY_COUNT = 5;
    /** ...and the recent per-minute rate must be at least this many times the baseline per-minute rate. */
    private const ANOMALY_RATIO = 3.0;

    public static function displayName(): string
    {
        return Settings::get('chloe_assistant_name') ?: self::AGENT_NAME;
    }

    // --------------------------------------------------------------- cycle

    /**
     * Called once per uptime-check cron run: reviews incidents already open,
     * opens new ones for monitors that just went down, checks for automation
     * failures, and checks the error logs for a genuine spike. Safe to call
     * as often as check_uptime.php runs.
     *
     * @return array{opened:int,resolved:int,escalated:int}
     */
    public static function runCycle(PDO $pdo): array
    {
        $review = self::reviewOpenUptimeIncidents($pdo);
        $fresh = self::detectNewUptimeIncidents($pdo);
        $automation = self::detectAutomationFailures($pdo);
        $anomaly = self::detectAnomalies($pdo);

        return [
            'opened' => $fresh['opened'] + $automation['opened'] + $anomaly['opened'],
            'resolved' => $review['resolved'] + $anomaly['resolved'],
            'escalated' => $review['escalated'] + $fresh['escalated'] + $anomaly['escalated'],
        ];
    }

    /** @return array{resolved:int,escalated:int} */
    private static function reviewOpenUptimeIncidents(PDO $pdo): array
    {
        $resolved = 0;
        $escalated = 0;

        $open = $pdo->query(
            "SELECT ci.*, m.last_status, m.name AS monitor_name
             FROM chloe_incidents ci
             JOIN uptime_monitors m ON m.id = ci.source_id AND ci.source_type = 'uptime_monitor'
             WHERE ci.status IN ('investigating', 'confirmed', 'escalated')"
        )->fetchAll(PDO::FETCH_ASSOC);

        foreach ($open as $incident) {
            if ($incident['last_status'] === 'up') {
                self::resolveIncident($pdo, $incident);
                $resolved++;
                continue;
            }

            $stmt = $pdo->prepare('SELECT * FROM uptime_monitors WHERE id = ?');
            $stmt->execute([$incident['source_id']]);
            $monitor = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$monitor) {
                continue;
            }

            $finding = self::investigateMonitor($pdo, $monitor);
            $newStatus = $incident['status'];
            if ($newStatus === 'investigating' && $finding['confidence'] >= self::minConfidence()) {
                $newStatus = 'confirmed';
            }

            $pdo->prepare(
                "UPDATE chloe_incidents SET category = ?, title = ?, narrative = ?, evidence_json = ?,
                    confidence = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
            )->execute([
                $finding['category'], $finding['title'], $finding['narrative'],
                json_encode($finding['evidence']), $finding['confidence'], $newStatus, $incident['id'],
            ]);

            if ($incident['status'] !== 'escalated' && self::shouldEscalate($finding)) {
                self::escalate($pdo, (int) $incident['id']);
                $escalated++;
            }
        }

        return ['resolved' => $resolved, 'escalated' => $escalated];
    }

    /** @return array{opened:int,escalated:int} */
    private static function detectNewUptimeIncidents(PDO $pdo): array
    {
        $opened = 0;
        $escalated = 0;

        $down = $pdo->query(
            "SELECT m.* FROM uptime_monitors m
             WHERE m.is_active = 1 AND m.last_status = 'down'
             AND NOT EXISTS (
                SELECT 1 FROM chloe_incidents ci
                WHERE ci.source_type = 'uptime_monitor' AND ci.source_id = m.id
                  AND ci.status IN ('investigating', 'confirmed', 'escalated')
             )"
        )->fetchAll(PDO::FETCH_ASSOC);

        foreach ($down as $monitor) {
            $finding = self::investigateMonitor($pdo, $monitor);
            $id = self::openIncident($pdo, $monitor, $finding);
            $opened++;

            if (self::shouldEscalate($finding)) {
                self::escalate($pdo, $id);
                $escalated++;
            }
        }

        return ['opened' => $opened, 'escalated' => $escalated];
    }

    /**
     * A failed, exhausted agent_tasks row becomes its own incident, once —
     * surfaced for review, never auto-escalated (see class doc, point 3).
     *
     * @return array{opened:int}
     */
    private static function detectAutomationFailures(PDO $pdo): array
    {
        $opened = 0;

        $failed = $pdo->query(
            "SELECT * FROM agent_tasks
             WHERE status = 'failed' AND datetime(updated_at) >= datetime('now', '-2 days')
             ORDER BY updated_at DESC LIMIT 30"
        )->fetchAll(PDO::FETCH_ASSOC);

        $existsStmt = $pdo->prepare(
            "SELECT COUNT(*) FROM chloe_incidents WHERE source_type = 'agent_task' AND source_id = ?"
        );

        foreach ($failed as $task) {
            $existsStmt->execute([$task['id']]);
            if ((int) $existsStmt->fetchColumn() > 0) {
                continue;
            }

            $kindLabel = str_replace('_', ' ', (string) $task['kind']);
            $title = 'Automation failed: ' . $kindLabel . ' (' . $task['agent_key'] . ')';
            $narrative = 'Caleb, a scheduled ' . $task['agent_key'] . ' task (' . $kindLabel . ') failed after '
                . (int) $task['attempts'] . ' attempt(s) and has stopped retrying. Last error: '
                . mb_substr((string) ($task['last_error'] ?: 'no error message recorded'), 0, 300)
                . '. It is sitting in the Agent Queue for review.';

            $evidence = [
                'agent_task_id' => (int) $task['id'],
                'kind' => $task['kind'],
                'agent_key' => $task['agent_key'],
                'attempts' => (int) $task['attempts'],
                'max_attempts' => (int) $task['max_attempts'],
                'last_error' => $task['last_error'],
                'entity_type' => $task['entity_type'],
                'entity_id' => $task['entity_id'],
            ];

            $pdo->prepare(
                "INSERT INTO chloe_incidents
                    (category, source_type, source_id, project_id, title, narrative, evidence_json, confidence, status, started_at)
                 VALUES ('automation', 'agent_task', ?, NULL, ?, ?, ?, 55, 'confirmed', datetime('now'))"
            )->execute([$task['id'], $title, $narrative, json_encode($evidence)]);

            $opened++;
        }

        return ['opened' => $opened];
    }

    /**
     * A genuine spike in fatal/error log entries becomes one incident —
     * "unusual activity" (see class doc, point 4). Singleton by design: the
     * error logs are one shared stream, not per-site, so there is at most
     * one open anomaly incident at a time (source_id is always 0). Opened
     * un-escalated on first detection, same as a fresh uptime incident;
     * escalates only if still elevated on a later review pass, and resolves
     * itself once the rate returns to normal.
     *
     * @return array{opened:int,resolved:int,escalated:int}
     */
    private static function detectAnomalies(PDO $pdo): array
    {
        $counts = \App\Controllers\ErrorLogController::recentSeverityCounts();
        $recentRate = $counts['recent_count'] / max(1, $counts['recent_minutes']);
        $baselineRate = $counts['baseline_count'] / max(1, $counts['baseline_minutes']);
        $isSpiking = $counts['recent_count'] >= self::MIN_ANOMALY_COUNT
            && $recentRate >= $baselineRate * self::ANOMALY_RATIO;

        $existing = $pdo->query(
            "SELECT * FROM chloe_incidents WHERE source_type = 'anomaly' AND source_id = 0
             AND status IN ('investigating', 'confirmed', 'escalated') LIMIT 1"
        )->fetch(PDO::FETCH_ASSOC);

        if (!$isSpiking) {
            if (!$existing) {
                return ['opened' => 0, 'resolved' => 0, 'escalated' => 0];
            }
            $pdo->prepare(
                "UPDATE chloe_incidents SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now')
                 WHERE id = ?"
            )->execute([$existing['id']]);
            if (!empty($existing['escalated_at'])) {
                $message = 'Error-log activity has returned to its normal rate.';
                $to = Settings::get('notification_email') ?: Settings::get('social_email');
                if ($to) {
                    Mailer::send($to, '✅ ' . self::displayName() . ': error rate back to normal', $message);
                }
                if (WhatsAppNotifier::isOwnerConfigured()) {
                    WhatsAppNotifier::sendOwnerAlert('✅ ' . $message, [
                        'name' => self::displayName(), 'reason' => 'Error rate back to normal',
                        'summary' => $message, 'message' => $message,
                    ]);
                }
            }
            return ['opened' => 0, 'resolved' => 1, 'escalated' => 0];
        }

        $confidence = 60;
        if ($counts['recent_count'] >= 15) {
            $confidence += 15;
        }
        if ($counts['baseline_count'] === 0) {
            $confidence += 10; // brand-new failures, not just a busier version of a steady trickle
        }
        $confidence = min(90, $confidence);

        $title = 'Unusual error-log activity';
        $narrative = 'Caleb, the error logs show ' . $counts['recent_count'] . ' error/fatal entries in the last '
            . $counts['recent_minutes'] . ' minutes, against ' . $counts['baseline_count'] . ' in the '
            . $counts['baseline_minutes'] . ' minutes before that. That is a real jump above the normal '
            . 'background rate. I recommend checking Admin -> Error Logs for what is actually failing.';
        $evidence = $counts + ['recent_rate' => round($recentRate, 3), 'baseline_rate' => round($baselineRate, 3)];

        if (!$existing) {
            $pdo->prepare(
                "INSERT INTO chloe_incidents
                    (category, source_type, source_id, project_id, title, narrative, evidence_json, confidence, status, started_at)
                 VALUES ('anomaly', 'anomaly', 0, NULL, ?, ?, ?, ?, 'investigating', datetime('now'))"
            )->execute([$title, $narrative, json_encode($evidence), $confidence]);
            return ['opened' => 1, 'resolved' => 0, 'escalated' => 0];
        }

        $newStatus = $existing['status'] === 'investigating' && $confidence >= self::minConfidence()
            ? 'confirmed' : $existing['status'];
        $pdo->prepare(
            "UPDATE chloe_incidents SET title = ?, narrative = ?, evidence_json = ?, confidence = ?, status = ?,
                updated_at = datetime('now') WHERE id = ?"
        )->execute([$title, $narrative, json_encode($evidence), $confidence, $newStatus, $existing['id']]);

        // Never escalate on the pass that first opened it (existing already
        // covers that, since this branch only runs when an incident from an
        // earlier pass exists) — mirrors uptime's "not on the very first check".
        if ($existing['status'] !== 'escalated' && $confidence >= self::minConfidence()) {
            self::escalate($pdo, (int) $existing['id']);
            return ['opened' => 0, 'resolved' => 0, 'escalated' => 1];
        }

        return ['opened' => 0, 'resolved' => 0, 'escalated' => 0];
    }

    // ------------------------------------------------------------ evidence

    /**
     * Gathers real evidence for one monitor and turns it into a category,
     * confidence score, and plain-language narrative. If the monitor hasn't
     * been probed in the last two minutes (an on-demand "investigate now"
     * from chat, rather than a just-probed cron pass), takes a fresh reading
     * first so the evidence is never stale.
     *
     * @return array{category:string,confidence:int,title:string,narrative:string,evidence:array<string,mixed>}
     */
    public static function investigateMonitor(PDO $pdo, array $monitor, bool $forceFreshProbe = false): array
    {
        $staleSeconds = empty($monitor['last_checked_at'])
            ? PHP_INT_MAX
            : time() - (int) strtotime((string) $monitor['last_checked_at'] . ' UTC');

        if ($forceFreshProbe || $staleSeconds > 120) {
            $result = UptimeProbe::probe($monitor['url']);
            $pdo->prepare(
                'INSERT INTO uptime_checks (monitor_id, status, http_status, response_time_ms) VALUES (?, ?, ?, ?)'
            )->execute([$monitor['id'], $result['status'], $result['http_status'] ?: null, $result['response_time_ms']]);

            $statusChanged = $monitor['last_status'] !== $result['status'];
            $pdo->prepare(
                "UPDATE uptime_monitors SET last_status = ?, last_checked_at = datetime('now')"
                    . ($statusChanged ? ", last_status_changed_at = datetime('now')" : '') . ' WHERE id = ?'
            )->execute([$result['status'], $monitor['id']]);

            $monitor['last_status'] = $result['status'];
            if ($statusChanged) {
                $monitor['last_status_changed_at'] = gmdate('Y-m-d H:i:s');
            }
        }

        $recentStmt = $pdo->prepare(
            'SELECT status, http_status, checked_at FROM uptime_checks WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 2'
        );
        $recentStmt->execute([$monitor['id']]);
        $recentChecks = $recentStmt->fetchAll(PDO::FETCH_ASSOC);
        $checksConfirmed = count($recentChecks) >= 2
            && $recentChecks[0]['status'] === 'down' && $recentChecks[1]['status'] === 'down';
        $latestHttpStatus = (int) ($recentChecks[0]['http_status'] ?? 0);

        $dnsResolves = UptimeProbe::dnsResolves($monitor['url']);

        $activeMonitors = $pdo->query(
            'SELECT id, last_status FROM uptime_monitors WHERE is_active = 1'
        )->fetchAll(PDO::FETCH_ASSOC);
        $others = array_filter($activeMonitors, static fn($m) => (int) $m['id'] !== (int) $monitor['id']);
        $othersDown = array_filter($others, static fn($m) => $m['last_status'] === 'down');

        $project = null;
        if (!empty($monitor['project_id'])) {
            $stmt = $pdo->prepare('SELECT id, title, last_deployed_at FROM projects WHERE id = ?');
            $stmt->execute([(int) $monitor['project_id']]);
            $project = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        $minutesSinceDeploy = null;
        if ($project && !empty($project['last_deployed_at'])) {
            $deployedTs = strtotime((string) $project['last_deployed_at']);
            if ($deployedTs !== false) {
                $minutesSinceDeploy = max(0.0, (time() - $deployedTs) / 60);
            }
        }

        $minutesDown = null;
        if (!empty($monitor['last_status_changed_at'])) {
            $changedTs = strtotime((string) $monitor['last_status_changed_at'] . ' UTC');
            if ($changedTs !== false) {
                $minutesDown = max(0.0, (time() - $changedTs) / 60);
            }
        }

        $evidence = [
            'checks_confirmed' => $checksConfirmed,
            'recent_checks' => $recentChecks,
            'dns_resolves' => $dnsResolves,
            'http_status' => $latestHttpStatus,
            'other_active_monitors' => count($others),
            'other_down_count' => count($othersDown),
            'last_deployed_at' => $project['last_deployed_at'] ?? null,
            'minutes_since_deploy' => $minutesSinceDeploy,
            'minutes_down' => $minutesDown,
        ];

        $classification = self::classify($evidence);
        $siteName = $monitor['name'] ?: ($project['title'] ?? (string) $monitor['url']);

        return [
            'category' => $classification['category'],
            'confidence' => $classification['confidence'],
            'title' => $siteName . ' unreachable — ' . self::categoryLabel($classification['category']),
            'narrative' => self::composeNarrative($siteName, $monitor['last_status'], $evidence, $classification),
            'evidence' => $evidence,
        ];
    }

    /** @param array<string,mixed> $evidence @return array{category:string,confidence:int,recommendation:string} */
    private static function classify(array $evidence): array
    {
        if (!$evidence['dns_resolves']) {
            return [
                'category' => 'dns',
                'confidence' => 90,
                'recommendation' => "I recommend checking the domain's DNS records and registrar — this looks like "
                    . 'a DNS problem, not the application.',
            ];
        }

        $sharedOutage = $evidence['other_active_monitors'] > 0
            && $evidence['other_down_count'] >= max(2, (int) ceil($evidence['other_active_monitors'] * 0.4));
        if ($sharedOutage) {
            return [
                'category' => 'infra',
                'confidence' => 80,
                'recommendation' => 'Multiple monitored sites are down at the same time — this looks like a shared '
                    . 'hosting or network issue rather than one site\'s own deployment.',
            ];
        }

        $httpStatus = (int) $evidence['http_status'];
        $recentDeploy = $evidence['minutes_since_deploy'] !== null && $evidence['minutes_since_deploy'] <= 120;

        if ($httpStatus === 0) {
            return [
                'category' => 'uptime',
                'confidence' => 72,
                'recommendation' => 'DNS resolves but the server itself is not responding at all (connection '
                    . 'refused or timed out) — check that the server or process is actually running.',
            ];
        }

        if ($httpStatus >= 500) {
            return [
                'category' => $recentDeploy ? 'deploy' : 'uptime',
                'confidence' => $recentDeploy ? 88 : 70,
                'recommendation' => $recentDeploy
                    ? 'I recommend checking the latest deployment — it landed shortly before this started.'
                    : 'The application is returning a server error. I recommend checking the application logs for '
                        . 'what changed recently.',
            ];
        }

        if ($httpStatus >= 400) {
            return [
                'category' => 'uptime',
                'confidence' => 55,
                'recommendation' => 'The site is responding, but with a client error — worth checking routing or '
                    . 'configuration rather than assuming the server itself is down.',
            ];
        }

        return [
            'category' => 'uptime',
            'confidence' => 40,
            'recommendation' => 'The failure mode is not clear-cut from the evidence gathered so far — worth a '
                . 'manual look.',
        ];
    }

    /** @param array<string,mixed> $evidence @param array{category:string,confidence:int,recommendation:string} $classification */
    private static function composeNarrative(string $siteName, ?string $lastStatus, array $evidence, array $classification): string
    {
        $lines = [];

        if ($lastStatus === 'up') {
            $lines[] = "Caleb, {$siteName} is responding normally right now.";
        } else {
            $lines[] = "Caleb, {$siteName} has been unreachable for " . self::formatMinutes($evidence['minutes_down']) . '.';
            $lines[] = $evidence['checks_confirmed']
                ? 'I confirmed it from two separate checks.'
                : 'That is from a single check so far — I will confirm on the next pass before saying more.';

            if (!$evidence['dns_resolves']) {
                $lines[] = 'DNS is not resolving for this domain right now.';
            } else {
                $httpStatus = (int) $evidence['http_status'];
                $lines[] = $httpStatus === 0
                    ? 'DNS is resolving correctly, but the server is not responding at all.'
                    : "DNS is resolving correctly, but the application endpoint is returning {$httpStatus}.";
                $lines[] = $classification['category'] === 'infra'
                    ? 'This looks network/infrastructure-side rather than DNS.'
                    : 'The problem appears application-side rather than DNS.';
            }

            $lines[] = $evidence['other_down_count'] > 0
                ? (int) $evidence['other_down_count'] . ' other monitored site(s) are also down right now — this '
                    . 'may be a shared issue rather than one specific to this site.'
                : 'No other monitored client sites are affected.';

            if ($evidence['minutes_since_deploy'] !== null) {
                $lines[] = 'The last deployment to this project was about '
                    . self::formatMinutes($evidence['minutes_since_deploy']) . ' ago.';
            }

            $lines[] = $classification['recommendation'];
        }

        return implode(' ', $lines);
    }

    private static function formatMinutes(?float $minutes): string
    {
        if ($minutes === null) {
            return 'an unknown amount of time';
        }
        $rounded = (int) round($minutes);
        if ($rounded < 1) {
            return 'under a minute';
        }
        return $rounded . ' minute' . ($rounded === 1 ? '' : 's');
    }

    private static function categoryLabel(string $category): string
    {
        return match ($category) {
            'dns' => 'DNS issue',
            'infra' => 'shared infrastructure issue',
            'deploy' => 'likely deployment-related',
            'automation' => 'automation failure',
            'anomaly' => 'unusual activity',
            default => 'application error',
        };
    }

    // --------------------------------------------------------- persistence

    private static function openIncident(PDO $pdo, array $monitor, array $finding): int
    {
        $pdo->prepare(
            "INSERT INTO chloe_incidents
                (category, source_type, source_id, project_id, title, narrative, evidence_json, confidence, status, started_at)
             VALUES (?, 'uptime_monitor', ?, ?, ?, ?, ?, ?, 'investigating', datetime('now'))"
        )->execute([
            $finding['category'], $monitor['id'], $monitor['project_id'] ?: null,
            $finding['title'], $finding['narrative'], json_encode($finding['evidence']), $finding['confidence'],
        ]);
        return (int) $pdo->lastInsertId();
    }

    private static function resolveIncident(PDO $pdo, array $incident): void
    {
        $pdo->prepare(
            "UPDATE chloe_incidents SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now')
             WHERE id = ?"
        )->execute([$incident['id']]);

        if (empty($incident['escalated_at'])) {
            return; // never escalated — no recovery notice needed
        }

        $siteName = $incident['monitor_name'] ?? 'The site';
        $message = "{$siteName} has recovered and is responding normally again.";

        $to = Settings::get('notification_email') ?: Settings::get('social_email');
        if ($to) {
            Mailer::send($to, '✅ ' . self::displayName() . ': ' . $siteName . ' recovered', $message);
        }
        if (WhatsAppNotifier::isOwnerConfigured()) {
            WhatsAppNotifier::sendOwnerAlert('✅ ' . $message, [
                'name' => self::displayName(),
                'reason' => $siteName . ' recovered',
                'summary' => $message,
                'message' => $message,
            ]);
        }
    }

    /**
     * Delivers one incident by email and owner WhatsApp — mirrors
     * Chief::emailBrief's per-channel timestamps so a re-run never
     * double-sends. Marks the incident escalated regardless of channel
     * delivery outcome; the timestamps record what actually went out.
     */
    public static function escalate(PDO $pdo, int $incidentId): void
    {
        $stmt = $pdo->prepare('SELECT * FROM chloe_incidents WHERE id = ?');
        $stmt->execute([$incidentId]);
        $incident = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$incident) {
            return;
        }

        $to = Settings::get('notification_email') ?: Settings::get('social_email');
        $emailDone = !$to || !empty($incident['emailed_at']);
        if (!$emailDone) {
            $emailDone = Mailer::send($to, self::displayName() . ': ' . $incident['title'], $incident['narrative']);
        }
        if ($emailDone && $to && empty($incident['emailed_at'])) {
            $pdo->prepare("UPDATE chloe_incidents SET emailed_at = datetime('now') WHERE id = ?")->execute([$incidentId]);
        }

        $waConfigured = WhatsAppNotifier::isOwnerConfigured();
        $waDone = !$waConfigured || !empty($incident['whatsapp_sent_at']);
        if (!$waDone) {
            $waDone = WhatsAppNotifier::sendOwnerAlert($incident['narrative'], [
                'name' => self::displayName(),
                'reason' => $incident['title'],
                'summary' => mb_substr((string) $incident['narrative'], 0, 900),
                'message' => mb_substr((string) $incident['narrative'], 0, 900),
            ]);
        }
        if ($waDone && $waConfigured && empty($incident['whatsapp_sent_at'])) {
            $pdo->prepare("UPDATE chloe_incidents SET whatsapp_sent_at = datetime('now') WHERE id = ?")->execute([$incidentId]);
        }

        $pdo->prepare(
            "UPDATE chloe_incidents SET status = 'escalated', escalated_at = COALESCE(escalated_at, datetime('now')),
                updated_at = datetime('now') WHERE id = ?"
        )->execute([$incidentId]);
    }

    private static function shouldEscalate(array $finding): bool
    {
        if ($finding['confidence'] < self::minConfidence()) {
            return false;
        }
        if (empty($finding['evidence']['checks_confirmed'])) {
            return false;
        }
        $minutesDown = $finding['evidence']['minutes_down'];
        if ($minutesDown !== null && $minutesDown < self::minMinutesDown()) {
            return false;
        }
        return true;
    }

    private static function minConfidence(): int
    {
        $configured = Settings::get('chloe_min_confidence_to_escalate');
        return $configured !== null && $configured !== '' ? (int) $configured : self::MIN_CONFIDENCE_TO_ESCALATE;
    }

    private static function minMinutesDown(): float
    {
        $configured = Settings::get('chloe_min_minutes_before_escalate');
        return $configured !== null && $configured !== '' ? (float) $configured : self::MIN_MINUTES_DOWN_TO_ESCALATE;
    }

    // --------------------------------------------------------- retrieval

    /** Real, current counts — for chat and the admin incidents page. Never estimated. */
    public static function snapshot(PDO $pdo): array
    {
        $monitorCounts = $pdo->query(
            "SELECT COUNT(*) AS total,
                    COALESCE(SUM(CASE WHEN last_status = 'up' THEN 1 ELSE 0 END), 0) AS up,
                    COALESCE(SUM(CASE WHEN last_status = 'down' THEN 1 ELSE 0 END), 0) AS down
             FROM uptime_monitors WHERE is_active = 1"
        )->fetch(PDO::FETCH_ASSOC) ?: ['total' => 0, 'up' => 0, 'down' => 0];

        $openByCategory = $pdo->query(
            "SELECT category, COUNT(*) AS n FROM chloe_incidents
             WHERE status IN ('investigating', 'confirmed', 'escalated') GROUP BY category"
        )->fetchAll(PDO::FETCH_KEY_PAIR);

        $recent = $pdo->query(
            'SELECT id, category, title, status, confidence, started_at, escalated_at, resolved_at
             FROM chloe_incidents ORDER BY started_at DESC LIMIT 10'
        )->fetchAll(PDO::FETCH_ASSOC);

        return [
            'monitors' => array_map('intval', $monitorCounts),
            'open_incidents_by_category' => $openByCategory,
            'recent_incidents' => $recent,
            'generated_at' => date('Y-m-d H:i:s'),
        ];
    }

    /** @return array<int,array<string,mixed>> */
    public static function listIncidents(PDO $pdo, ?string $status = null, int $limit = 50): array
    {
        $limit = max(1, min(200, $limit));
        if ($status !== null && $status !== '') {
            $stmt = $pdo->prepare("SELECT * FROM chloe_incidents WHERE status = ? ORDER BY started_at DESC LIMIT {$limit}");
            $stmt->execute([$status]);
        } else {
            $stmt = $pdo->query("SELECT * FROM chloe_incidents ORDER BY started_at DESC LIMIT {$limit}");
        }
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /** @return array<string,mixed>|null */
    public static function getIncident(PDO $pdo, int $id): ?array
    {
        $stmt = $pdo->prepare('SELECT * FROM chloe_incidents WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        $row['evidence'] = json_decode((string) $row['evidence_json'], true) ?: [];
        return $row;
    }

    public static function dismissIncident(PDO $pdo, int $id): bool
    {
        $stmt = $pdo->prepare(
            "UPDATE chloe_incidents SET status = 'dismissed', resolved_at = datetime('now'), updated_at = datetime('now')
             WHERE id = ? AND status != 'dismissed'"
        );
        $stmt->execute([$id]);
        return $stmt->rowCount() > 0;
    }

    /** Fuzzy match a monitor by name, URL, or linked project title — for chat's "check X now". */
    public static function findMonitorByQuery(PDO $pdo, string $query): ?array
    {
        $q = '%' . trim($query) . '%';
        $stmt = $pdo->prepare(
            "SELECT m.* FROM uptime_monitors m
             LEFT JOIN projects p ON p.id = m.project_id
             WHERE m.name LIKE ? OR m.url LIKE ? OR p.title LIKE ?
             ORDER BY m.id LIMIT 1"
        );
        $stmt->execute([$q, $q, $q]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** @return array<string,mixed> */
    public static function investigateNowByQuery(PDO $pdo, string $query): array
    {
        $monitor = self::findMonitorByQuery($pdo, $query);
        if ($monitor === null) {
            return ['error' => 'No monitored site matches "' . $query . '" — check Admin -> Sites for the exact name.'];
        }
        return self::investigateMonitor($pdo, $monitor, true);
    }
}
