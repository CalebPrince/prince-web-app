<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Thin server-side client for TypeSafe's System One API (the Jev model).
 * Shared by Beacon's gate (TypeSafeGate) and Lisa's judgments (LisaJudgment)
 * so there is one place that knows the endpoint, auth, timeout and failure
 * behaviour. Contract per https://docs.typesafe.ai/api.md:
 *   POST /v1/systemone {model, state, questions} -> {answers: {id: {type, ...}}}
 *   noul   -> {noul: 0..1}
 *   choice -> {choice, probabilities, confidence}
 *   score  -> {score, probabilities, confidence}
 *
 * Every failure (no key, timeout, HTTP error, bad shape) returns null and is
 * logged, never thrown: callers fail open to whatever they did before Jev.
 */
final class TypeSafeClient
{
    private const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

    /**
     * Test seam: when set, called instead of the network as fn(state, questions): ?array.
     * Never set in production code.
     *
     * @var callable|null
     */
    public static $fake = null;

    public static function hasKey(): bool
    {
        if (self::$fake !== null) {
            return true;
        }
        return trim((string) Settings::get('typesafe_api_key')) !== '';
    }

    /**
     * @param array<string,mixed>|string $state everything the questions may need to see
     * @param array<string,array<string,mixed>> $questions question id => question definition
     * @return array<string,array<string,mixed>>|null the `answers` map, or null on any failure
     */
    public static function ask(array|string $state, array $questions, int $timeoutSeconds = 5, string $caller = 'TypeSafe'): ?array
    {
        if (self::$fake !== null) {
            return (self::$fake)($state, $questions);
        }
        $apiKey = trim((string) Settings::get('typesafe_api_key'));
        if ($apiKey === '' || !function_exists('curl_init')) {
            return null;
        }

        $ch = curl_init(self::ENDPOINT);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'model' => 'jev-latest',
                'state' => is_string($state) ? $state : json_encode($state),
                'questions' => $questions,
            ]),
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                '%s: call failed: status=%s body=%s',
                $caller,
                $status,
                is_string($response) ? substr($response, 0, 500) : 'n/a'
            ));
            return null;
        }

        $decoded = json_decode($response, true);
        if (!is_array($decoded['answers'] ?? null)) {
            error_log($caller . ': unexpected response shape: ' . substr($response, 0, 500));
            return null;
        }
        return $decoded['answers'];
    }

    /** A noul answer as a probability, or null when missing. */
    public static function noul(?array $answers, string $id): ?float
    {
        $v = $answers[$id]['noul'] ?? null;
        return is_numeric($v) ? (float) $v : null;
    }

    /** A score answer's position, or null when missing. */
    public static function score(?array $answers, string $id): ?float
    {
        $v = $answers[$id]['score'] ?? null;
        return is_numeric($v) ? (float) $v : null;
    }

    /** @return array{choice:string,confidence:float}|null */
    public static function choice(?array $answers, string $id): ?array
    {
        $c = $answers[$id]['choice'] ?? null;
        if (!is_string($c) || $c === '') {
            return null;
        }
        return ['choice' => $c, 'confidence' => (float) ($answers[$id]['confidence'] ?? 0)];
    }
}
