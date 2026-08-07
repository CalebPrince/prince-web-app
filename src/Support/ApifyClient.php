<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Thin wrapper around Apify's run-sync-get-dataset-items endpoint — runs a
 * named actor with a given input and returns its dataset items directly, no
 * separate poll-for-completion step. Deliberately generic: which actor(s) to
 * call (a LinkedIn profile-posts scraper, a post-reactions/comments scraper,
 * or anything else on the Apify store) is entirely admin-configured (see the
 * beacon_apify_actor_* settings), because different actors from different
 * authors use different input/output field names and this class has no way
 * to know which one Caleb ends up picking. Callers are responsible for
 * extracting whatever fields they need from the returned shape — see
 * run_beacon_apify_discovery.php's flexible field lookups.
 */
final class ApifyClient
{
    private const RUN_TIMEOUT_SECONDS = 120;

    /**
     * Runs $actorId synchronously with $input and returns its dataset items,
     * or null on a hard failure (bad key, rejected actor, timeout, non-2xx).
     * $error is set to a short diagnostic on failure — never guess why an
     * integration failed silently, same principle as searchWeb() in
     * run_beacon_discovery.php.
     *
     * @param array<string,mixed> $input
     * @return array<int,array<string,mixed>>|null
     */
    public static function runActor(string $actorId, array $input, ?string &$error = null): ?array
    {
        $apiKey = trim((string) Settings::get('apify_api_key'));
        if ($apiKey === '') {
            $error = 'apify_api_key is not configured.';
            return null;
        }
        $actorId = trim($actorId);
        if ($actorId === '') {
            $error = 'No actor ID configured.';
            return null;
        }

        // Apify actor IDs are usually written "author/name" in their console
        // and docs, but the REST path needs "author~name".
        $encodedActorId = str_replace('/', '~', $actorId);
        $url = 'https://api.apify.com/v2/acts/' . rawurlencode($encodedActorId)
            . '/run-sync-get-dataset-items?token=' . rawurlencode($apiKey)
            . '&timeout=' . self::RUN_TIMEOUT_SECONDS;

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($input, JSON_UNESCAPED_SLASHES),
            // A few seconds above Apify's own ?timeout= so a run that finishes
            // right at the wire still gets its response back instead of the
            // HTTP client cutting it off first.
            CURLOPT_TIMEOUT => self::RUN_TIMEOUT_SECONDS + 15,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status < 200 || $status >= 300) {
            $error = sprintf(
                'actor=%s status=%s curl_error=%s body=%s',
                $actorId,
                $status,
                $curlError !== '' ? $curlError : 'none',
                is_string($response) ? substr($response, 0, 300) : 'n/a'
            );
            error_log('ApifyClient::runActor failed: ' . $error);
            return null;
        }

        $decoded = json_decode((string) $response, true);
        if (!is_array($decoded)) {
            $error = "actor={$actorId}: response was not a JSON array of dataset items.";
            error_log('ApifyClient::runActor failed: ' . $error);
            return null;
        }

        return $decoded;
    }

    /**
     * Substitutes {{TOKEN}} placeholders in an admin-configured JSON
     * template string with real values, then decodes the result into the
     * actual actor input array — how beacon_apify_actor_*_input turns into a
     * real request body without this class needing to know any specific
     * actor's field names. Each value is JSON-string-escaped before
     * substitution (so a URL with quotes or backslashes can't break the
     * surrounding JSON), then the escaping quotes are stripped so the
     * template controls whether the token lands inside quotes (a string) or
     * bare (a number). Returns null if the template isn't valid JSON after
     * substitution, so a typo in the admin UI fails loud instead of quietly
     * sending garbage to Apify.
     *
     * @param array<string,string> $values TOKEN => raw value, not yet JSON-escaped
     * @return array<string,mixed>|null
     */
    public static function fillTemplate(string $template, array $values): ?array
    {
        $filled = $template;
        foreach ($values as $token => $value) {
            $jsonEscaped = json_encode($value, JSON_UNESCAPED_SLASHES);
            $bareEscaped = $jsonEscaped !== false ? substr($jsonEscaped, 1, -1) : '';
            $filled = str_replace('{{' . $token . '}}', $bareEscaped, $filled);
        }
        $decoded = json_decode($filled, true);
        return is_array($decoded) ? $decoded : null;
    }
}
