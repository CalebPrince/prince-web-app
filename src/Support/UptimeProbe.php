<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Single-URL HTTP probe, extracted out of database/check_uptime.php so
 * ChloeInvestigator can take a fresh, real-time read on a site during an
 * investigation instead of only trusting the last cron-cadence check.
 */
class UptimeProbe
{
    private const TIMEOUT_SECONDS = 15;

    /** @return array{status: 'up'|'down', http_status: int, response_time_ms: int, ssl_expires_at: ?string} */
    public static function probe(string $url): array
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => self::TIMEOUT_SECONDS,
                'ignore_errors' => true,
                'user_agent' => 'princecaleb.dev uptime monitor',
                'follow_location' => 1,
                'max_redirects' => 5,
            ],
            // capture_peer_cert piggybacks the site's own TLS expiry off this
            // same request — free (Technical tab), no separate check needed.
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'capture_peer_cert' => true],
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

        $sslExpiresAt = null;
        $options = stream_context_get_options($context);
        $cert = $options['ssl']['peer_certificate'] ?? null;
        if ($cert !== null) {
            $certInfo = openssl_x509_parse($cert);
            if ($certInfo !== false && !empty($certInfo['validTo_time_t'])) {
                $sslExpiresAt = gmdate('Y-m-d H:i:s', (int) $certInfo['validTo_time_t']);
            }
        }

        return [
            'status' => $isUp ? 'up' : 'down',
            'http_status' => $httpStatus,
            'response_time_ms' => $elapsedMs,
            'ssl_expires_at' => $sslExpiresAt,
        ];
    }

    /**
     * Whether the URL's host currently resolves via DNS (A or AAAA). Lets an
     * investigation tell "DNS is broken" apart from "DNS is fine but the app
     * itself is erroring" — check_uptime.php's plain HTTP probe can't
     * distinguish those on its own.
     */
    public static function dnsResolves(string $url): bool
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (!$host) {
            return false;
        }
        return @checkdnsrr($host, 'A') || @checkdnsrr($host, 'AAAA');
    }
}
