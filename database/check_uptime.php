<?php

declare(strict_types=1);

// Pings every active uptime monitor and records the result. Run on a cron
// every ~5 minutes. A monitor is "up" on any 2xx/3xx response; a network
// failure, timeout, or 4xx/5xx counts as down (a homepage serving 404s is
// broken even if the server is technically alive). A down verdict is
// re-checked once within the same run before it's trusted, so a single
// transient blip doesn't wake anyone up.
//
// This script's own job stops at recording the fact. It used to also send an
// immediate raw "X is DOWN" email itself — Chloe (ChloeInvestigator::runCycle,
// called at the end of this script) now owns telling Caleb anything, so the
// same outage doesn't produce both a dumb instant email and a smarter,
// investigated one moments later. alert_sent is no longer written here; Chloe
// tracks her own escalation state on chloe_incidents instead.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\ChloeInvestigator;
use App\Support\Database;
use App\Support\UptimeProbe;

const KEEP_CHECKS_DAYS = 90;

$pdo = Database::get();
$monitors = $pdo->query('SELECT * FROM uptime_monitors WHERE is_active = 1')->fetchAll();

$checked = 0;
foreach ($monitors as $monitor) {
    $result = UptimeProbe::probe($monitor['url']);
    if ($result['status'] === 'down') {
        sleep(2);
        $result = UptimeProbe::probe($monitor['url']); // confirm before believing a blip
    }

    $pdo->prepare(
        'INSERT INTO uptime_checks (monitor_id, status, http_status, response_time_ms) VALUES (?, ?, ?, ?)'
    )->execute([$monitor['id'], $result['status'], $result['http_status'] ?: null, $result['response_time_ms']]);

    $statusChanged = $monitor['last_status'] !== $result['status'];
    $pdo->prepare(
        "UPDATE uptime_monitors SET last_status = ?, last_checked_at = datetime('now')"
            . ($statusChanged ? ", last_status_changed_at = datetime('now')" : '')
            . ' WHERE id = ?'
    )->execute([$result['status'], $monitor['id']]);

    if ($monitor['project_id'] && $result['ssl_expires_at'] !== null) {
        $pdo->prepare('UPDATE projects SET ssl_expires_at = ? WHERE id = ?')
            ->execute([$result['ssl_expires_at'], $monitor['project_id']]);
    }

    $checked++;
}

$pdo->exec("DELETE FROM uptime_checks WHERE checked_at < datetime('now', '-" . KEEP_CHECKS_DAYS . " days')");

$chloe = ChloeInvestigator::runCycle($pdo);

echo "$checked monitor(s) checked. Chloe: {$chloe['opened']} incident(s) opened, "
    . "{$chloe['resolved']} resolved, {$chloe['escalated']} escalated.\n";
