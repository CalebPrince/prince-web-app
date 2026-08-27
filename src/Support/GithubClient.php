<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Public, unauthenticated GitHub API access — no token, so subject to GitHub's
 * unauthenticated rate limit (60 requests/hour/IP). Shared by ScoutController
 * (repo inspection in chat) and database/check_site_technical.php (last
 * deployment date for the Sites Technical tab).
 */
class GithubClient
{
    /** @return array<string,mixed>|array<int,mixed> */
    public static function request(string $url): array
    {
        if (!function_exists('curl_init')) {
            return ['_error' => 'GitHub inspection is unavailable on this server.'];
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Accept: application/vnd.github+json',
                'X-GitHub-Api-Version: 2022-11-28',
                'User-Agent: princecaleb-dev',
            ],
            CURLOPT_TIMEOUT => 15,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'GithubClient: request failed: status=%s curl_error=%s body=%s',
                $status,
                $curlError !== '' ? $curlError : 'none',
                is_string($response) ? substr($response, 0, 500) : 'n/a'
            ));
            if ($status === 404) {
                return ['_error' => 'That GitHub repository was not found or is not public.'];
            }
            if ($status === 403 || $status === 429) {
                return ['_error' => 'GitHub temporarily refused the lookup, possibly because its public API rate limit was reached.'];
            }
            return ['_error' => 'GitHub could not be reached right now.'];
        }

        $decoded = json_decode((string) $response, true);
        return is_array($decoded) ? $decoded : ['_error' => 'GitHub returned an unreadable response.'];
    }

    /**
     * Extracts owner/repository from a github.com URL, strictly — prevents
     * arbitrary URL fetching and SSRF via the API base it builds from it.
     */
    public static function parseRepoUrl(string $url): ?array
    {
        if (!preg_match(
            '~^https?://(?:www\.)?github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#].*)?$~i',
            trim($url),
            $matches
        )) {
            return null;
        }
        return ['owner' => $matches[1], 'repository' => $matches[2]];
    }

    /** Last push date (ISO 8601, UTC) for a public github.com repo, or null. */
    public static function pushedAt(string $repoUrl): ?string
    {
        $parsed = self::parseRepoUrl($repoUrl);
        if ($parsed === null) {
            return null;
        }

        $metadata = self::request(
            'https://api.github.com/repos/' . rawurlencode($parsed['owner']) . '/' . rawurlencode($parsed['repository'])
        );
        if (isset($metadata['_error']) || empty($metadata['pushed_at'])) {
            return null;
        }
        return (string) $metadata['pushed_at'];
    }
}
