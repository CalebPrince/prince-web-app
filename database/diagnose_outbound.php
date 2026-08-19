<?php

declare(strict_types=1);

// Diagnoses why outbound HTTPS from this host times out with 0 bytes received.
//
// Both api.deepseek.com and generativelanguage.googleapis.com hang for the full
// timeout, which is what a dropped connection looks like — not a rejected key or
// a TLS problem, both of which fail fast with an error. The usual causes are a
// firewall blocking outbound 443, or a host advertising IPv6 it cannot actually
// route, where curl tries the AAAA record first and waits for a reply that never
// comes. This tells the two apart.
//
// Run it on the server:  php database/diagnose_outbound.php

const TARGETS = [
    'Gemini'   => 'https://generativelanguage.googleapis.com/',
    'DeepSeek' => 'https://api.deepseek.com/',
    'Groq'     => 'https://api.groq.com/',
    'Example'  => 'https://example.com/',
];

const TIMEOUT = 12;

function attempt(string $url, ?int $ipResolve): array
{
    $ch = curl_init($url);
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_NOBODY => true,
        CURLOPT_TIMEOUT => TIMEOUT,
        CURLOPT_CONNECTTIMEOUT => TIMEOUT,
        CURLOPT_FOLLOWLOCATION => false,
    ];
    if ($ipResolve !== null) {
        $options[CURLOPT_IPRESOLVE] = $ipResolve;
    }
    curl_setopt_array($ch, $options);

    $started = microtime(true);
    curl_exec($ch);
    $elapsed = microtime(true) - $started;

    $result = [
        'status' => curl_getinfo($ch, CURLINFO_HTTP_CODE),
        'ip' => curl_getinfo($ch, CURLINFO_PRIMARY_IP) ?: '-',
        'error' => curl_error($ch),
        'elapsed' => $elapsed,
    ];
    return $result;
}

echo "PHP " . PHP_VERSION . " | curl " . (curl_version()['version'] ?? '?') . "\n";

foreach (['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY'] as $var) {
    $value = getenv($var);
    if ($value !== false && $value !== '') {
        echo "proxy env: {$var}={$value}\n";
    }
}
echo str_repeat('-', 78) . "\n";
printf("%-10s %-9s %-8s %-17s %6s  %s\n", 'HOST', 'MODE', 'STATUS', 'PEER IP', 'SECS', 'ERROR');

foreach (TARGETS as $name => $url) {
    $host = (string) parse_url($url, PHP_URL_HOST);

    $v4 = gethostbynamel($host) ?: [];
    $aaaa = @dns_get_record($host, DNS_AAAA) ?: [];
    printf(
        "%-10s dns       A=%-6d AAAA=%-11d\n",
        $name,
        count($v4),
        count($aaaa)
    );

    foreach (['default' => null, 'ipv4' => CURL_IPRESOLVE_V4] as $mode => $resolve) {
        $r = attempt($url, $resolve);
        printf(
            "%-10s %-9s %-8s %-17s %6.1f  %s\n",
            $name,
            $mode,
            $r['status'] ?: '-',
            $r['ip'],
            $r['elapsed'],
            $r['error'] !== '' ? $r['error'] : 'none'
        );
    }
}

echo str_repeat('-', 78) . "\n";
echo "Reading this:\n";
echo "  * ipv4 works where default times out -> broken IPv6 routing; force IPv4.\n";
echo "  * every host times out in both modes  -> outbound 443 is firewalled.\n";
echo "  * only the AI hosts fail             -> those hosts are blocked specifically.\n";
echo "  * AAAA=0 and it still hangs          -> not IPv6; firewall or DNS.\n";
