<?php

declare(strict_types=1);

namespace App\Support;

/** Bridges native prince-web-app agent chats to the Model-Agnostic Layer. */
final class SharedAgentMemory
{
    /** @param array<int,array{role:string,text:string}> $provided */
    public static function restore(array $provided): array
    {
        $agentKey = self::agentKey();
        $memoryKey = self::memoryKey();
        if (!$agentKey || !$memoryKey) return $provided;

        $result = self::request('GET', '/v1/agents/shared-memory/' . rawurlencode($agentKey) . '?memory_key=' . rawurlencode($memoryKey));
        $turns = $result['turns'] ?? null;
        if (!is_array($turns)) return $provided;

        $current = $provided[count($provided) - 1] ?? null;
        $restored = array_values(array_filter($turns, static fn($turn) => is_array($turn) && isset($turn['role'], $turn['text'])));
        if (is_array($current) && ($current['role'] ?? null) === 'user') $restored[] = $current;
        return $restored ?: $provided;
    }

    /** @param array<int,array{role:string,text:string}> $transcript */
    public static function append(array $transcript, ?string $reply): void
    {
        $agentKey = self::agentKey();
        $memoryKey = self::memoryKey();
        if (!$agentKey || !$memoryKey || !$reply) return;
        $user = $transcript[count($transcript) - 1] ?? null;
        if (!is_array($user) || ($user['role'] ?? null) !== 'user') return;
        self::request('POST', '/v1/agents/shared-memory/' . rawurlencode($agentKey), [
            'memory_key' => $memoryKey,
            'turns' => [
                ['role' => 'user', 'text' => (string) $user['text']],
                ['role' => 'agent', 'text' => $reply],
            ],
        ]);
    }

    private static function agentKey(): ?string
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
        if (!preg_match('#/api/v1/admin/agents/([^/]+)/chat$#', $path, $matches)) return null;
        return $matches[1] === 'sage' ? null : $matches[1];
    }

    private static function memoryKey(): ?string
    {
        return trim((string) (Settings::get('model_agnostic_memory_key') ?? '')) ?: null;
    }

    private static function request(string $method, string $path, ?array $body = null): ?array
    {
        $token = trim((string) (Settings::get('model_agnostic_memory_token') ?? ''));
        if ($token === '') return null;
        $url = rtrim((string) (Settings::get('model_agnostic_memory_url') ?? ''), '/') . $path;
        if ($url === $path) return null;

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Shared-Memory-Token: ' . $token],
        ]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        $raw = curl_exec($ch);
        curl_close($ch);
        if (!is_string($raw) || $raw === '') return null;
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }
}