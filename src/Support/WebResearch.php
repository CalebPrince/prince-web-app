<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Small best-effort web search (Serper, the same key Allie uses) for
 * grounding a piece of writing in what people are currently saying. Never
 * throws: returns an empty list when no key is set, cURL is missing, or the
 * search fails, so callers simply write without research.
 */
final class WebResearch
{
    /**
     * @return array<int,array{title:string,link:string,snippet:string,date:?string}>
     */
    public static function search(string $query, int $limit = 6, int $timeout = 8): array
    {
        $query = trim($query);
        $apiKey = trim((string) Settings::get('serper_api_key'));
        if ($query === '' || $apiKey === '' || !function_exists('curl_init')) {
            return [];
        }

        // The past month first, so takes are current; widen to a year only
        // when a niche topic has nothing that recent.
        foreach (['qdr:m', 'qdr:y'] as $window) {
            $items = self::request($query, $apiKey, $window, $timeout);
            if ($items !== []) {
                return array_slice($items, 0, $limit);
            }
        }
        return [];
    }

    /** @return array<int,array{title:string,link:string,snippet:string,date:?string}> */
    private static function request(string $query, string $apiKey, string $window, int $timeout): array
    {
        $ch = curl_init('https://google.serper.dev/search');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-API-KEY: ' . $apiKey],
            CURLOPT_POSTFIELDS => json_encode(['q' => $query, 'tbs' => $window]),
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => min(5, $timeout),
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($response === false || $status !== 200) {
            error_log('WebResearch: Serper search failed with status ' . $status);
            return [];
        }

        $out = [];
        foreach ((json_decode((string) $response, true)['organic'] ?? []) as $item) {
            $title = trim((string) ($item['title'] ?? ''));
            $link = trim((string) ($item['link'] ?? ''));
            if ($title === '' || $link === '') {
                continue;
            }
            $out[] = [
                'title' => $title,
                'link' => $link,
                'snippet' => trim((string) ($item['snippet'] ?? '')),
                'date' => !empty($item['date']) ? (string) $item['date'] : null,
            ];
        }
        return $out;
    }
}
