<?php

declare(strict_types=1);

// Pings every active uptime monitor and records the result. Run on a cron
// every ~5 minutes. A monitor is "up" on any 2xx/3xx response; a network
// failure, timeout, or 4xx/5xx counts as down (a homepage serving 404s is
// broken even if the server is technically alive). A down verdict is
// re-checked once within the same run before it's trusted, so a single
// transient blip doesn't wake anyone up. Status-change alert emails go to
// the same notification address the rest of the app uses, and alert_sent
// resets on recovery so the next real outage alerts again.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\Mailer;
use App\Support\Settings;

const TIMEOUT_SECONDS = 15;
const KEEP_CHECKS_DAYS = 90;

/** @return array{status: 'up'|'down', http_status: int, response_time_ms: int} */
function probe(string $url): array
{
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => TIMEOUT_SECONDS,
            'ignore_errors' => true,
            'user_agent' => 'princecaleb.dev uptime monitor',
            'follow_location' => 1,
            'max_redirects' => 5,
        ],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);

    $start = microtime(true);
    $body = @file_get_contents($url, false, $context);
    $elapsedMs = (int) round((microtime(true) - $start) * 1000);

    $httpStatus = 0;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d+)#', $header, $m)) {
            $httpStatus = (int) $m[1]; // last status line wins after redirects
        }
    }

    $isUp = $body !== false && $httpStatus >= 200 && $httpStatus < 400;

    return ['status' => $isUp ? 'up' : 'down', 'http_status' => $httpStatus, 'response_time_ms' => $elapsedMs];
}

$pdo = Database::get();
$monitors = $pdo->query('SELECT * FROM uptime_monitors WHERE is_active = 1')->fetchAll();
$notifyEmail = Settings::get('notification_email') ?: Settings::get('social_email');

$checked = 0;
$alerts = 0;
foreach ($monitors as $monitor) {
    $result = probe($monitor['url']);
    if ($result['status'] === 'down') {
        sleep(2);
        $result = probe($monitor['url']); // confirm before believing a blip
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

    if ($result['status'] === 'down' && !$monitor['alert_sent'] && $notifyEmail) {
        $ok = Mailer::send(
            $notifyEmail,
            "\u{1F534} {$monitor['name']} is DOWN",
            "{$monitor['name']} ({$monitor['url']}) is not responding.\n\n"
                . 'HTTP status: ' . ($result['http_status'] ?: 'no response') . "\n"
                . "Checked at: " . gmdate('Y-m-d H:i:s') . " UTC\n\n"
                . "You'll get another email when it recovers."
        );
        if ($ok) {
            $pdo->prepare('UPDATE uptime_monitors SET alert_sent = 1 WHERE id = ?')->execute([$monitor['id']]);
            $alerts++;
        }
    } elseif ($result['status'] === 'up' && $monitor['alert_sent']) {
        if ($notifyEmail) {
            Mailer::send(
                $notifyEmail,
                "\u{2705} {$monitor['name']} is back up",
                "{$monitor['name']} ({$monitor['url']}) is responding again "
                    . "({$result['http_status']}, {$result['response_time_ms']}ms).\n\n"
                    . 'Recovered at: ' . gmdate('Y-m-d H:i:s') . ' UTC'
            );
        }
        $pdo->prepare('UPDATE uptime_monitors SET alert_sent = 0 WHERE id = ?')->execute([$monitor['id']]);
    }

    $checked++;
}

$pdo->exec("DELETE FROM uptime_checks WHERE checked_at < datetime('now', '-" . KEEP_CHECKS_DAYS . " days')");

echo "$checked monitor(s) checked, $alerts alert(s) sent.\n";
