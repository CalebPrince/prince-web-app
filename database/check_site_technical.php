<?php

declare(strict_types=1);

// Refreshes the Technical/Health tier of the admin Sites page: domain expiry
// (RDAP, no key needed), PageSpeed scores (Google PSI API, needs
// 'pagespeed_api_key' under Settings), and last deployment date (GitHub, via
// GithubClient — reused from Scout's repo-inspection tool). Run once a day
// on a cPanel cron; unlike check_uptime.php this data barely changes between
// runs, so there's no value in polling it more often. One bad project never
// aborts the run — each check is independently best-effort.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\GithubClient;
use App\Support\Settings;

const HTTP_TIMEOUT_SECONDS = 15;

function curlGet(string $url, array $headers = []): ?string
{
    if (!function_exists('curl_init')) {
        return null;
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => HTTP_TIMEOUT_SECONDS,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_FOLLOWLOCATION => true,
        // Some registries' RDAP endpoints (e.g. Verisign's, behind their own
        // WAF) 403 a request with no User-Agent at all.
        CURLOPT_USERAGENT => 'princecaleb.dev-site-monitor/1.0',
    ]);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    return ($response !== false && $status >= 200 && $status < 300) ? (string) $response : null;
}

/** @return array{expires_at: ?string, registrar: ?string} */
function domainInfo(string $domain): array
{
    $body = curlGet('https://rdap.org/domain/' . rawurlencode($domain), ['Accept: application/rdap+json']);
    $data = $body !== null ? json_decode($body, true) : null;
    if (!is_array($data)) {
        return ['expires_at' => null, 'registrar' => null];
    }

    $expiresAt = null;
    foreach ($data['events'] ?? [] as $event) {
        if (($event['eventAction'] ?? '') === 'expiration' && !empty($event['eventDate'])) {
            $expiresAt = gmdate('Y-m-d H:i:s', strtotime((string) $event['eventDate']));
            break;
        }
    }

    $registrar = null;
    foreach ($data['entities'] ?? [] as $entity) {
        if (!in_array('registrar', $entity['roles'] ?? [], true)) {
            continue;
        }
        foreach ($entity['vcardArray'][1] ?? [] as $field) {
            if (($field[0] ?? '') === 'fn') {
                $registrar = (string) ($field[3] ?? '');
                break 2;
            }
        }
    }

    return ['expires_at' => $expiresAt, 'registrar' => $registrar];
}

/** @return array{score: ?int, lcp_ms: ?int, cls: ?float} */
function pageSpeedInfo(string $url, string $strategy, string $apiKey): array
{
    $endpoint = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
        . '?url=' . rawurlencode($url)
        . '&strategy=' . rawurlencode($strategy)
        . '&category=performance'
        . '&key=' . rawurlencode($apiKey);
    $body = curlGet($endpoint);
    $data = $body !== null ? json_decode($body, true) : null;
    if (!is_array($data)) {
        return ['score' => null, 'lcp_ms' => null, 'cls' => null];
    }

    $score = $data['lighthouseResult']['categories']['performance']['score'] ?? null;
    $audits = $data['lighthouseResult']['audits'] ?? [];
    return [
        'score' => $score !== null ? (int) round($score * 100) : null,
        'lcp_ms' => isset($audits['largest-contentful-paint']['numericValue'])
            ? (int) round((float) $audits['largest-contentful-paint']['numericValue']) : null,
        'cls' => isset($audits['cumulative-layout-shift']['numericValue'])
            ? round((float) $audits['cumulative-layout-shift']['numericValue'], 3) : null,
    ];
}

$pdo = Database::get();
$pagespeedKey = Settings::get('pagespeed_api_key');
$projects = $pdo->query(
    "SELECT id, live_url, repo_url, perf_desktop_score, perf_mobile_score
     FROM projects WHERE live_url IS NOT NULL AND live_url != ''"
)->fetchAll();

$checked = 0;
foreach ($projects as $project) {
    $domain = parse_url($project['live_url'], PHP_URL_HOST);
    $domain = $domain !== null && $domain !== false ? preg_replace('/^www\./', '', $domain) : null;

    $domainData = $domain ? domainInfo($domain) : ['expires_at' => null, 'registrar' => null];

    $desktop = ['score' => null, 'lcp_ms' => null, 'cls' => null];
    $mobile = ['score' => null, 'lcp_ms' => null, 'cls' => null];
    if ($pagespeedKey) {
        $desktop = pageSpeedInfo($project['live_url'], 'desktop', $pagespeedKey);
        $mobile = pageSpeedInfo($project['live_url'], 'mobile', $pagespeedKey);
    }

    $lastDeployedAt = $project['repo_url'] ? GithubClient::pushedAt($project['repo_url']) : null;

    $pdo->prepare(
        "UPDATE projects SET
            domain_expires_at = ?, domain_registrar = ?,
            perf_desktop_score = ?, perf_mobile_score = ?, perf_lcp_ms = ?, perf_cls = ?,
            last_deployed_at = ?, technical_checked_at = datetime('now')
         WHERE id = ?"
    )->execute([
        $domainData['expires_at'],
        $domainData['registrar'],
        // Only overwrite perf columns when a fresh reading came back — an
        // API hiccup (or no key configured) shouldn't blank out yesterday's
        // still-relevant score.
        $desktop['score'] ?? $project['perf_desktop_score'],
        $mobile['score'] ?? $project['perf_mobile_score'],
        $desktop['lcp_ms'] ?? $mobile['lcp_ms'],
        $desktop['cls'] ?? $mobile['cls'],
        $lastDeployedAt,
        $project['id'],
    ]);

    $checked++;
}

echo "$checked project(s) checked.\n";
