<?php

declare(strict_types=1);

namespace App\Support;

/**
 * The tech and AI news outlets Allie can search on purpose (her
 * search_news_sites tool), editable under Admin -> Settings -> Site ->
 * "Allie news sources". It is an ADDITIONAL lens, never a boundary: her open
 * search_web, page browsing, GitHub inspection and her real-Allie research
 * (the actual Allie K. Miller's posts, interviews and talks) are unchanged,
 * and a strong idea from outside these outlets counts just as much.
 *
 * Blank setting = the built-in list below. Entries are normalised to bare
 * domains, so pasting "https://www.techcrunch.com/category/ai/" is fine.
 */
final class AllieNewsSources
{
    public const MAX_SOURCES = 20;

    /** Used when the setting is blank. Keep in step with the placeholder in SettingsClient.tsx. */
    public const DEFAULTS = [
        'techcrunch.com',
        'theverge.com',
        'wired.com',
        'arstechnica.com',
        'venturebeat.com',
        'technologyreview.com',
        'news.ycombinator.com',
        'producthunt.com',
        'theinformation.com',
        'techcabal.com',
        'techpoint.africa',
        'restofworld.org',
    ];

    /** The domains Allie searches right now: the saved list, or the defaults when it is blank. */
    public static function domains(): array
    {
        $parsed = self::parse((string) Settings::get('allie_news_sources'));
        return $parsed['domains'] !== [] ? $parsed['domains'] : self::DEFAULTS;
    }

    /**
     * Turn pasted text into clean, unique, valid bare domains.
     *
     * @return array{domains:array<int,string>,invalid:array<int,string>}
     */
    public static function parse(string $raw): array
    {
        $domains = [];
        $invalid = [];
        foreach (preg_split('/[\s,;]+/', trim($raw)) ?: [] as $item) {
            $item = trim($item);
            if ($item === '') {
                continue;
            }
            $host = strtolower($item);
            $host = preg_replace('#^[a-z][a-z0-9+.-]*://#', '', $host) ?? $host; // scheme
            $host = preg_replace('#[/?\#].*$#', '', $host) ?? $host;            // path, query, fragment
            $host = preg_replace('#:\d+$#', '', $host) ?? $host;                // port
            $host = preg_replace('#^www\.#', '', $host) ?? $host;
            $host = trim($host, '.');
            if (!preg_match('/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/', $host)) {
                $invalid[] = $item;
                continue;
            }
            $domains[$host] = $host;
        }
        return ['domains' => array_values($domains), 'invalid' => $invalid];
    }

    /**
     * The query restricted to these outlets: "<query> (site:a.com OR site:b.com)".
     * Google reads the site: operators, so results come only from the listed domains.
     */
    public static function restrictQuery(string $query, array $domains): string
    {
        $query = trim($query);
        if ($domains === []) {
            return $query;
        }
        return $query . ' (' . implode(' OR ', array_map(static fn (string $d) => 'site:' . $d, $domains)) . ')';
    }
}
