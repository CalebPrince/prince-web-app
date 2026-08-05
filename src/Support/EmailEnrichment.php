<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Optional email enrichment via Hunter.io — a legitimate B2B source that
 * returns emails it has actually found and scored for a domain (never
 * guessed). It's the fallback when a lead's own homepage publishes no
 * address (MarketingLeadController::extractContactEmail found nothing), so
 * a lead Google Places only gave us a phone number for can still become
 * emailable — honestly.
 *
 * Entirely opt-in: with no hunter_api_key in Settings this does nothing and
 * the engine behaves exactly as before. Honest-only: Hunter's own
 * confidence score gates the result (MIN_CONFIDENCE), so a low-confidence
 * pattern-guess never becomes an outreach target and start bouncing. The
 * best-confidence candidate is then run through Hunter's Email Verifier
 * (deliverability check) before being trusted — a stronger signal than the
 * domain-search confidence score alone, since a confidently-found address
 * can still be a dead mailbox.
 */
class EmailEnrichment
{
    /** Hunter confidence below this is treated as too weak to email. */
    private const MIN_CONFIDENCE = 50;

    /** Hunter statuses that mean "do not use this address". */
    private const VERIFIER_REJECT_STATUSES = ['invalid', 'disposable'];

    /** True when a key is configured — lets callers skip the work entirely. */
    public static function isConfigured(): bool
    {
        return !empty(Settings::get('hunter_api_key'));
    }

    /**
     * The best real, verified email Hunter has for $domainOrUrl, or null.
     * Returns ['email' => string, 'confidence' => int, 'verification' =>
     * string|null] so callers can log/surface both signals — verification is
     * null only when the Verifier call itself failed (rate limit, timeout,
     * Hunter outage), in which case the confidence-gated candidate is still
     * trusted rather than throwing away a lead over an unrelated API hiccup.
     *
     * @return array{email:string,confidence:int,verification:?string}|null
     */
    public static function findEmail(string $domainOrUrl): ?array
    {
        $key = Settings::get('hunter_api_key');
        if (empty($key) || !function_exists('curl_init')) {
            return null;
        }
        $domain = self::normalizeDomain($domainOrUrl);
        if ($domain === '') {
            return null;
        }

        $url = 'https://api.hunter.io/v2/domain-search?' . http_build_query([
            'domain' => $domain,
            'api_key' => $key,
            'limit' => 10,
        ]);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 12,
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'EmailEnrichment: Hunter domain-search failed: status=%s curl_error=%s body=%s',
                $status,
                $curlError !== '' ? $curlError : 'none',
                is_string($response) ? substr($response, 0, 300) : 'n/a'
            ));
            return null;
        }

        $data = json_decode($response, true);
        $emails = $data['data']['emails'] ?? [];
        if (!is_array($emails) || !$emails) {
            return null;
        }

        $candidates = [];
        foreach ($emails as $e) {
            $value = strtolower(trim((string) ($e['value'] ?? '')));
            $confidence = (int) ($e['confidence'] ?? 0);
            if (!filter_var($value, FILTER_VALIDATE_EMAIL) || $confidence < self::MIN_CONFIDENCE) {
                continue;
            }
            $candidates[] = ['email' => $value, 'confidence' => $confidence];
        }
        if (!$candidates) {
            return null;
        }
        usort($candidates, static fn(array $a, array $b): int => $b['confidence'] <=> $a['confidence']);

        // Walk candidates best-confidence-first; skip any the Verifier
        // explicitly flags as bad, and take the first one that isn't.
        foreach ($candidates as $candidate) {
            $verifierStatus = self::verifyEmail($candidate['email'], $key);
            if ($verifierStatus !== null && in_array($verifierStatus, self::VERIFIER_REJECT_STATUSES, true)) {
                continue;
            }
            return $candidate + ['verification' => $verifierStatus];
        }

        // Every candidate was verified invalid/disposable.
        return null;
    }

    /**
     * Hunter's email-verifier `status` for $email, or null if the call
     * itself failed (network error, rate limit, Hunter-side timeout) — the
     * caller treats null as "unknown, trust the confidence score" rather
     * than a rejection, so a Verifier hiccup never blocks a lead that
     * domain-search already found with good confidence.
     */
    private static function verifyEmail(string $email, string $key): ?string
    {
        $url = 'https://api.hunter.io/v2/email-verifier?' . http_build_query([
            'email' => $email,
            'api_key' => $key,
        ]);
        // Hunter holds the connection open up to 20s while it runs the SMTP
        // check itself; give it a little more room than that before giving up.
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 25,
        ]);
        $response = curl_exec($ch);
        $httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        // 202 means Hunter couldn't finish the SMTP check in its own 20s
        // window — the docs say polling again only ever counts once, so one
        // retry after a short pause is free.
        if ($httpStatus === 202) {
            sleep(3);
            $ch = curl_init($url);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25]);
            $response = curl_exec($ch);
            $httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);
        }

        if ($response === false || $httpStatus !== 200) {
            error_log(sprintf(
                'EmailEnrichment: Hunter email-verifier failed for %s: status=%s curl_error=%s',
                $email,
                $httpStatus,
                $curlError !== '' ? $curlError : 'none'
            ));
            return null;
        }

        $data = json_decode($response, true);
        $verifierStatus = $data['data']['status'] ?? null;
        return is_string($verifierStatus) ? $verifierStatus : null;
    }

    private static function normalizeDomain(string $input): string
    {
        $input = trim($input);
        if ($input === '') {
            return '';
        }
        if (!str_contains($input, '://')) {
            $input = 'https://' . $input;
        }
        $host = strtolower((string) parse_url($input, PHP_URL_HOST));
        return preg_replace('/^www\./', '', $host);
    }
}
