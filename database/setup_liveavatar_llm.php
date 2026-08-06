<?php

declare(strict_types=1);

/**
 * One-time provisioning for video Lisa's custom-LLM bridge (see the "Wire video
 * Lisa to the real chat brain" plan). Registers this app's own
 * /api/v1/liveavatar/chat/completions endpoint with LiveAvatar as a custom LLM
 * configuration, so LiveAvatar streams the conversation through
 * LiveChatController::generateReply() (same brain/tools as the web widget and
 * WhatsApp) instead of its own internal model.
 *
 * Run once via: php scripts/setup_liveavatar_llm.php [base_url]
 * Re-run only to rotate the bridge secret or point at a different base_url —
 * each run creates a fresh secret + llm-configuration and overwrites the saved
 * liveavatar_llm_configuration_id.
 */

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Settings;

$baseUrl = $argv[1] ?? 'https://princecaleb.dev/api/v1/liveavatar';

$apiKey = Settings::get('liveavatar_api_key');
if (!$apiKey) {
    fwrite(STDERR, "No liveavatar_api_key configured — set it in Admin -> Settings first.\n");
    exit(1);
}

$bridgeSecret = Settings::get('liveavatar_llm_bridge_secret');
if (!$bridgeSecret) {
    $bridgeSecret = bin2hex(random_bytes(32));
    Settings::set('liveavatar_llm_bridge_secret', $bridgeSecret);
    echo "Generated a new liveavatar_llm_bridge_secret and saved it.\n";
} else {
    echo "Reusing existing liveavatar_llm_bridge_secret.\n";
}

function liveavatarRequest(string $path, string $apiKey, array $payload): array
{
    $ch = curl_init('https://api.liveavatar.com' . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['X-API-KEY: ' . $apiKey, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => 25,
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        fwrite(STDERR, "Request to {$path} failed: {$error}\n");
        exit(1);
    }
    $decoded = json_decode($body, true);
    if ($status < 200 || $status >= 300 || !is_array($decoded)) {
        fwrite(STDERR, "LiveAvatar {$path} returned HTTP {$status}: {$body}\n");
        exit(1);
    }
    return $decoded;
}

echo "Registering bridge secret with LiveAvatar...\n";
$secretResult = liveavatarRequest('/v1/secrets', $apiKey, [
    // LiveAvatar's secret_type enum is provider-shaped (OPENAI_API_KEY,
    // ELEVENLABS_API_KEY, GEMINI_API_KEY, FISH_API_KEY, CARTESIA_API_KEY) —
    // there's no generic "custom LLM" value. Since base_url below points at
    // our own OpenAI-*shaped* /chat/completions bridge (not real OpenAI),
    // OPENAI_API_KEY is the correct type regardless of what's actually
    // running behind it.
    'secret_type' => 'OPENAI_API_KEY',
    'secret_value' => $bridgeSecret,
    'secret_name' => 'princecaleb.dev chat.completions bridge',
]);
$secretId = (string) ($secretResult['data']['id'] ?? $secretResult['data']['secret_id'] ?? '');
if ($secretId === '') {
    fwrite(STDERR, "LiveAvatar did not return a secret ID: " . json_encode($secretResult) . "\n");
    exit(1);
}
echo "  secret_id: {$secretId}\n";

echo "Creating LLM configuration pointing at {$baseUrl} ...\n";
$configResult = liveavatarRequest('/v1/llm-configurations', $apiKey, [
    'display_name' => 'Prince Caleb chat backend',
    'model_name' => 'lisa',
    'secret_id' => $secretId,
    'base_url' => $baseUrl,
]);
$configId = (string) ($configResult['data']['id'] ?? '');
if ($configId === '') {
    fwrite(STDERR, "LiveAvatar did not return a configuration ID: " . json_encode($configResult) . "\n");
    exit(1);
}
Settings::set('liveavatar_llm_configuration_id', $configId);

echo "  llm_configuration_id: {$configId}\n";
echo "Saved. New video Lisa sessions will now route through {$baseUrl}/chat/completions.\n";
