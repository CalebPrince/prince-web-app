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
 * pattern-guess never becomes an outreach target and start bouncing.
 */
class EmailEnrichment
{
    /** Hunter confidence below this is treated as too weak to email. */
    private const MIN_CONFIDENCE = 50;

    /** True when a key is configured — lets callers skip the work entirely. */
    public static function isConfigured(): bool
    {
        return !empty(Settings::get('hunter_api_key'));
    }

    /**
     * The best real email Hunter has for $domainOrUrl, or null. Returns
     * ['email' => string, 'confidence' => int] so callers can log/surface how
     * strong the match was.
     *
     * @return array{email:string,confidence:int}|null
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

        $best = null;
        foreach ($emails as $e) {
            $value = strtolower(trim((string) ($e['value'] ?? '')));
            $confidence = (int) ($e['confidence'] ?? 0);
            if (!filter_var($value, FILTER_VALIDATE_EMAIL) || $confidence < self::MIN_CONFIDENCE) {
                continue;
            }
            if ($best === null || $confidence > $best['confidence']) {
                $best = ['email' => $value, 'confidence' => $confidence];
            }
        }

        return $best;
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
