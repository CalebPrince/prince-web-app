<?php

declare(strict_types=1);

namespace App\Support;

use App\Controllers\MarketingLeadController;

/**
 * Daily, real-data prospect discovery for Marketing Leads.
 *
 * Serper Places is the source of truth; AI never invents businesses. Results
 * are deduplicated against existing URLs, phone numbers, and business names
 * before insertion. The existing OutreachController owns everything after
 * insertion: audit, email enrichment, pitch/call-script drafting and sending.
 */
final class LeadDiscovery
{
    private const MAX_SEARCHES_PER_RUN = 10;
    private const MAX_PAGE = 10;

    /**
     * Country name (as it appears in a Serper Places address string, always
     * English) -> currency. Deliberately keyed off the real per-lead address
     * rather than the search query text — a query can be phrased any way,
     * but the address Places returns is ground truth for where the business
     * actually is. Anything not in this table falls back to the global
     * pricing_currency setting, so adding a new discovery country without
     * a matching entry here degrades gracefully to the old single-currency
     * behavior instead of breaking.
     */
    private const COUNTRY_CURRENCY = [
        'ghana' => 'GHS',
        'nigeria' => 'NGN',
        'kenya' => 'KES',
        'south africa' => 'ZAR',
        'united states' => 'USD',
        'usa' => 'USD',
        'united kingdom' => 'GBP',
        'uk' => 'GBP',
        'canada' => 'CAD',
        'australia' => 'AUD',
        'germany' => 'EUR',
        'france' => 'EUR',
        'spain' => 'EUR',
        'italy' => 'EUR',
        'netherlands' => 'EUR',
        'ireland' => 'EUR',
        'portugal' => 'EUR',
        'belgium' => 'EUR',
        'egypt' => 'EGP',
        'morocco' => 'MAD',
        'tanzania' => 'TZS',
        'uganda' => 'UGX',
        'rwanda' => 'RWF',
        "cote d'ivoire" => 'XOF',
        'ivory coast' => 'XOF',
        'senegal' => 'XOF',
        'india' => 'INR',
        'united arab emirates' => 'AED',
        'uae' => 'AED',
        'saudi arabia' => 'SAR',
        'zambia' => 'ZMW',
        'ethiopia' => 'ETB',
    ];

    /** @return array{enabled:bool,ran:bool,added:int,searched:int,skipped:int,status:string} */
    public static function run(bool $force = false): array
    {
        if (Settings::get('lead_discovery_enabled') !== '1') {
            return self::result(false, false, 0, 0, 0, 'Automatic discovery is off.');
        }

        $lastRun = (string) Settings::get('lead_discovery_last_run');
        if (!$force && substr($lastRun, 0, 10) === gmdate('Y-m-d')) {
            return self::result(true, false, 0, 0, 0, 'Already ran today.');
        }

        $apiKey = trim((string) Settings::get('serper_api_key'));
        if ($apiKey === '') {
            return self::record(self::result(true, false, 0, 0, 0, 'Serper API key is missing.'), false);
        }

        $queries = self::queries();
        if (!$queries) {
            return self::record(self::result(true, false, 0, 0, 0, 'No discovery niches are configured.'), false);
        }

        $target = max(1, min(50, (int) (Settings::get('lead_discovery_daily_target') ?: 50)));
        $pages = json_decode((string) Settings::get('lead_discovery_pages'), true);
        $pages = is_array($pages) ? $pages : [];
        // Cursor into $queries so each run picks up where the last one left
        // off instead of always restarting at index 0 — otherwise, with more
        // than MAX_SEARCHES_PER_RUN queries saved, everything past the first
        // MAX_SEARCHES_PER_RUN would never run. Re-normalized by count() so
        // editing the query list can't leave a stale offset out of range.
        $offset = ((int) Settings::get('lead_discovery_query_offset')) % count($queries);
        $pdo = Database::get();
        $known = self::knownKeys($pdo);
        $fallbackCurrency = strtoupper((string) (Settings::get('pricing_currency') ?: 'GHS'));
        $insert = $pdo->prepare(
            'INSERT INTO marketing_leads
                (business_name, website_url, contact_phone, notes, estimated_value, currency)
             VALUES (?, ?, ?, ?, 0, ?)'
        );

        $added = 0;
        $searched = 0;
        $skipped = 0;
        $failures = 0;

        while ($added < $target && $searched < self::MAX_SEARCHES_PER_RUN) {
            $query = $queries[($offset + $searched) % count($queries)];
            $queryKey = sha1(mb_strtolower($query));
            $page = max(1, min(self::MAX_PAGE, (int) ($pages[$queryKey] ?? 1)));
            $results = MarketingLeadController::searchBusinesses($apiKey, $query, $page);
            $searched++;

            if ($results === null) {
                $failures++;
                continue;
            }

            foreach ($results as $lead) {
                if ($added >= $target) {
                    break;
                }
                $name = trim((string) ($lead['business_name'] ?? ''));
                $url = trim((string) ($lead['website_url'] ?? ''));
                $phone = trim((string) ($lead['phone'] ?? ''));
                if ($name === '' || ($url === '' && $phone === '')) {
                    $skipped++;
                    continue;
                }

                $urlKey = self::urlKey($url);
                $phoneKey = self::phoneKey($phone);
                $nameKey = self::nameKey($name);
                if (($urlKey !== '' && isset($known['urls'][$urlKey]))
                    || ($phoneKey !== '' && isset($known['phones'][$phoneKey]))
                    || isset($known['names'][$nameKey])) {
                    $skipped++;
                    continue;
                }

                $insert->execute([
                    mb_substr($name, 0, 255),
                    $url !== '' ? $url : null,
                    $phone !== '' ? mb_substr($phone, 0, 50) : null,
                    'Automatically discovered via Serper Places: ' . $query,
                    self::currencyForAddress($lead['address'] ?? null, $fallbackCurrency),
                ]);
                if ($urlKey !== '') $known['urls'][$urlKey] = true;
                if ($phoneKey !== '') $known['phones'][$phoneKey] = true;
                $known['names'][$nameKey] = true;
                $added++;
            }

            $pages[$queryKey] = $page >= self::MAX_PAGE ? 1 : $page + 1;
        }

        Settings::set('lead_discovery_pages', json_encode($pages, JSON_UNESCAPED_SLASHES));
        Settings::set('lead_discovery_query_offset', (string) (($offset + $searched) % count($queries)));
        $status = $failures === $searched
            ? 'All discovery searches failed; the next cron run will retry.'
            : "Added {$added} new lead(s) from {$searched} search(es); skipped {$skipped} duplicate or unusable result(s).";
        return self::record(self::result(true, true, $added, $searched, $skipped, $status), $failures !== $searched);
    }

    /** The saved niche/location searches, in rotation order — read-only view for reporting (e.g. per-query yield). */
    public static function configuredQueries(): array
    {
        return self::queries();
    }

    /** @return string[] */
    private static function queries(): array
    {
        $lines = preg_split('/\R/', (string) Settings::get('lead_discovery_queries')) ?: [];
        $lines = array_values(array_unique(array_filter(array_map('trim', $lines))));
        return array_slice($lines, 0, 20);
    }

    /** @return array{urls:array<string,bool>,phones:array<string,bool>,names:array<string,bool>} */
    private static function knownKeys(\PDO $pdo): array
    {
        $known = ['urls' => [], 'phones' => [], 'names' => []];
        foreach ($pdo->query('SELECT business_name, website_url, contact_phone FROM marketing_leads')->fetchAll() as $row) {
            $url = self::urlKey((string) ($row['website_url'] ?? ''));
            $phone = self::phoneKey((string) ($row['contact_phone'] ?? ''));
            $name = self::nameKey((string) ($row['business_name'] ?? ''));
            if ($url !== '') $known['urls'][$url] = true;
            if ($phone !== '') $known['phones'][$phone] = true;
            if ($name !== '') $known['names'][$name] = true;
        }
        return $known;
    }

    /** Word-boundary match so e.g. "uk" can't false-positive inside an unrelated word. */
    private static function currencyForAddress(?string $address, string $fallback): string
    {
        $address = trim((string) $address);
        if ($address === '') {
            return $fallback;
        }
        $haystack = mb_strtolower($address);
        foreach (self::COUNTRY_CURRENCY as $country => $currency) {
            if (preg_match('/\b' . preg_quote($country, '/') . '\b/u', $haystack)) {
                return $currency;
            }
        }
        return $fallback;
    }

    private static function urlKey(string $url): string
    {
        if ($url === '') return '';
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $host = preg_replace('/^www\./', '', $host) ?? $host;
        $path = rtrim(strtolower((string) parse_url($url, PHP_URL_PATH)), '/');
        return $host === '' ? '' : $host . $path;
    }

    private static function phoneKey(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        return strlen($digits) >= 7 ? $digits : '';
    }

    private static function nameKey(string $name): string
    {
        return mb_strtolower(trim((string) preg_replace('/\s+/', ' ', $name)));
    }

    /** @param array{enabled:bool,ran:bool,added:int,searched:int,skipped:int,status:string} $result */
    private static function record(array $result, bool $completed): array
    {
        Settings::set('lead_discovery_last_status', $result['status']);
        if ($completed) {
            Settings::set('lead_discovery_last_run', gmdate('Y-m-d H:i:s'));
        }
        return $result;
    }

    /** @return array{enabled:bool,ran:bool,added:int,searched:int,skipped:int,status:string} */
    private static function result(bool $enabled, bool $ran, int $added, int $searched, int $skipped, string $status): array
    {
        return compact('enabled', 'ran', 'added', 'searched', 'skipped', 'status');
    }
}
