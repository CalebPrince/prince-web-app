<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\AiAgentEngine;
use App\Support\Response;
use App\Support\Settings;

class CodingAgentController
{
    private const PROVIDERS = [
        'gemini' => ['label' => 'Google Gemini', 'key' => 'gemini_api_key', 'model' => 'gemini_model'],
        'anthropic' => ['label' => 'Anthropic', 'key' => 'anthropic_api_key', 'model' => 'anthropic_model'],
        'openai' => ['label' => 'OpenAI', 'key' => 'openai_api_key', 'model' => 'openai_model'],
        'openrouter' => ['label' => 'OpenRouter', 'key' => 'openrouter_api_key', 'model' => 'openrouter_model'],
        'groq' => ['label' => 'Groq', 'key' => 'groq_api_key', 'model' => 'groq_model'],
    ];
    private const MAX_FILE_BYTES = 250000;
    private const MAX_CHANGES = 20;

    public static function providers(): void
    {
        AuthMiddleware::requireAuth();
        $items = [];
        foreach (self::PROVIDERS as $id => $config) {
            if (trim((string) Settings::get($config['key'])) === '') continue;
            $items[] = [
                'id' => $id,
                'label' => $config['label'],
                'model' => (string) (Settings::get($config['model']) ?: 'Default model'),
            ];
        }
        Response::json(['providers' => $items]);
    }

    public static function chat(): void
    {
        AuthMiddleware::requireAuth();
        set_time_limit(180);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $provider = strtolower(trim((string) ($data['provider'] ?? '')));
        $workspace = ($data['workspace'] ?? 'local') === 'github' ? 'github' : 'local';
        $message = trim((string) ($data['message'] ?? ''));
        $customInstructions = mb_substr(trim((string) ($data['custom_instructions'] ?? '')), 0, 2000);
        $temperature = max(0.0, min(2.0, (float) ($data['temperature'] ?? 0.7)));
        $topP = max(0.0, min(1.0, (float) ($data['top_p'] ?? 0.95)));
        $maxTokens = max(256, min(8192, (int) ($data['max_tokens'] ?? 4096)));
        $transcript = is_array($data['transcript'] ?? null) ? array_slice($data['transcript'], -24) : [];
        if (!isset(self::PROVIDERS[$provider]) || trim((string) Settings::get(self::PROVIDERS[$provider]['key'])) === '') {
            Response::error('Choose a connected coding provider.', 422);
        }
        if ($message === '' || mb_strlen($message) > 6000) {
            Response::error('Enter a request under 6,000 characters.', 422);
        }
        $transcript[] = ['role' => 'user', 'text' => $message];

        $changes = [];
        $executor = function (string $name, array $args) use (&$changes, $workspace): array {
            return self::runTool($name, $args, $changes, $workspace);
        };
        $result = AiAgentEngine::runWithProvider(
            $provider,
            self::systemPrompt() . ($customInstructions !== '' ? "\n\nAdmin instructions for this chat:\n" . $customInstructions : ''),
            self::tools(),
            $executor,
            $transcript,
            8,
            ['temperature' => $temperature, 'top_p' => $topP, 'max_tokens' => $maxTokens]
        );
        if (!is_string($result['reply'] ?? null) || trim($result['reply']) === '') {
            Response::error('The selected provider did not return a usable response. Check its key, model, and credits.', 502);
        }
        Response::json(['reply' => $result['reply'], 'provider' => $provider, 'changes' => array_values($changes)]);
    }

    public static function apply(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $changes = is_array($data['changes'] ?? null) ? array_slice($data['changes'], 0, self::MAX_CHANGES) : [];
        if ($changes === []) Response::error('There are no changes to apply.', 422);

        $validated = [];
        foreach ($changes as $change) {
            if (($change['workspace'] ?? 'local') === 'github') {
                $validated[] = ['github', $change];
                continue;
            }
            $path = self::safePath((string) ($change['path'] ?? ''), true);
            $content = (string) ($change['content'] ?? '');
            if (strlen($content) > self::MAX_FILE_BYTES) Response::error('A proposed file is too large.', 422);
            $current = is_file($path) ? (string) file_get_contents($path) : '';
            $expected = (string) ($change['original_hash'] ?? '');
            if ($expected !== hash('sha256', $current)) {
                Response::error('A file changed after the proposal was created. Ask the agent to inspect it again.', 409);
            }
            $validated[] = ['local', $path, $content, self::relative($path)];
        }

        $applied = [];
        foreach ($validated as $entry) {
            if ($entry[0] === 'github') {
                $change = $entry[1];
                $payload = [
                    'message' => 'Update ' . (string) $change['path'] . ' via Code Agent',
                    'content' => base64_encode((string) $change['content']),
                    'branch' => self::githubBranch(),
                ];
                if (!empty($change['original_hash'])) $payload['sha'] = (string) $change['original_hash'];
                $result = self::githubRequest('PUT', (string) $change['path'], $payload);
                if (isset($result['_error'])) Response::error((string) $result['_error'], 502);
                $applied[] = 'GitHub: ' . (string) $change['path'];
                continue;
            }
            [, $path, $content, $relative] = $entry;
            $directory = dirname($path);
            if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
                Response::error('Could not create the destination directory.', 500);
            }
            $temp = tempnam($directory, '.code-agent-');
            if ($temp === false || file_put_contents($temp, $content, LOCK_EX) === false || !rename($temp, $path)) {
                if (is_string($temp) && is_file($temp)) @unlink($temp);
                Response::error('Could not apply ' . $relative . '.', 500);
            }
            $applied[] = $relative;
        }
        Response::json(['applied' => $applied]);
    }

    private static function systemPrompt(): string
    {
        return 'You are the private coding agent for the princecaleb.dev repository. Work like a careful senior engineer. '
            . 'Inspect relevant files before recommending edits. You may list and search the repository, read safe text files, and propose complete replacement contents. '
            . 'Never claim a change is applied: propose_file only stages it for the admin to review. Keep the final reply concise and state what you inspected and staged. '
            . 'Write the visible reply as plain text. Do not use Markdown, asterisks, hash headings, backticks, decorative symbols, or emoji. Use ordinary sentences and line breaks; use punctuation only where it improves clarity. '
            . 'Do not request or expose secrets. Do not access .env, config/config.php, storage, uploads, database files, git internals, or dependency folders. '
            . 'Preserve existing conventions and unrelated user work. For edits, always read the file first, then call propose_file with the entire final file content.';
    }

    private static function tools(): array
    {
        return [
            ['name' => 'list_files', 'description' => 'List safe repository files under an optional relative directory.', 'parameters' => ['type' => 'object', 'properties' => ['directory' => ['type' => 'string']], 'required' => []]],
            ['name' => 'search_files', 'description' => 'Search safe source files for a literal text query.', 'parameters' => ['type' => 'object', 'properties' => ['query' => ['type' => 'string']], 'required' => ['query']]],
            ['name' => 'read_file', 'description' => 'Read a safe UTF-8 source file. Do this before proposing an edit.', 'parameters' => ['type' => 'object', 'properties' => ['path' => ['type' => 'string']], 'required' => ['path']]],
            ['name' => 'propose_file', 'description' => 'Stage a complete file replacement or new file for admin review. Does not write it.', 'parameters' => ['type' => 'object', 'properties' => ['path' => ['type' => 'string'], 'content' => ['type' => 'string'], 'summary' => ['type' => 'string']], 'required' => ['path', 'content', 'summary']]],
            ['name' => 'list_github_files', 'description' => 'List files in the connected GitHub repository and branch.', 'parameters' => ['type' => 'object', 'properties' => ['directory' => ['type' => 'string']], 'required' => []]],
            ['name' => 'read_github_file', 'description' => 'Read a text file from the connected GitHub repository.', 'parameters' => ['type' => 'object', 'properties' => ['path' => ['type' => 'string']], 'required' => ['path']]],
            ['name' => 'propose_github_file', 'description' => 'Stage a complete GitHub file replacement for admin approval.', 'parameters' => ['type' => 'object', 'properties' => ['path' => ['type' => 'string'], 'content' => ['type' => 'string'], 'summary' => ['type' => 'string'], 'sha' => ['type' => 'string']], 'required' => ['path', 'content', 'summary', 'sha']]],
        ];
    }

    private static function runTool(string $name, array $args, array &$changes, string $workspace): array
    {
        if ($workspace === 'github' && !str_contains($name, 'github')) return ['error' => 'This chat is using the GitHub workspace. Use the GitHub file tools.'];
        if ($name === 'list_files') {
            $dir = self::safePath((string) ($args['directory'] ?? ''), false);
            if (!is_dir($dir)) return ['error' => 'Directory not found.'];
            $out = [];
            $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
            foreach ($iterator as $file) {
                if (!$file->isFile() || !self::allowed($file->getPathname())) continue;
                $out[] = self::relative($file->getPathname());
                if (count($out) >= 200) break;
            }
            return ['files' => $out];
        }
        if ($name === 'search_files') {
            $query = trim((string) ($args['query'] ?? ''));
            if ($query === '' || mb_strlen($query) > 120) return ['error' => 'Use a short search query.'];
            $matches = [];
            $root = self::root();
            $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
            foreach ($iterator as $file) {
                $path = $file->getPathname();
                if (!$file->isFile() || !self::allowed($path) || $file->getSize() > self::MAX_FILE_BYTES) continue;
                $lines = @file($path, FILE_IGNORE_NEW_LINES);
                if (!is_array($lines)) continue;
                foreach ($lines as $i => $line) {
                    if (stripos($line, $query) !== false) $matches[] = ['path' => self::relative($path), 'line' => $i + 1, 'text' => mb_substr(trim($line), 0, 240)];
                    if (count($matches) >= 80) break 2;
                }
            }
            return ['matches' => $matches];
        }
        if ($name === 'read_file') {
            $path = self::safePath((string) ($args['path'] ?? ''), false);
            if (!is_file($path) || !self::allowed($path)) return ['error' => 'File is not available.'];
            if (filesize($path) > self::MAX_FILE_BYTES) return ['error' => 'File is too large to read here.'];
            $content = (string) file_get_contents($path);
            return ['path' => self::relative($path), 'content' => $content, 'sha256' => hash('sha256', $content)];
        }
        if ($name === 'propose_file') {
            if (count($changes) >= self::MAX_CHANGES) return ['error' => 'Change limit reached.'];
            $path = self::safePath((string) ($args['path'] ?? ''), true);
            if (!self::allowed($path)) return ['error' => 'That file type or location is not editable.'];
            $content = (string) ($args['content'] ?? '');
            if (strlen($content) > self::MAX_FILE_BYTES) return ['error' => 'Proposed content is too large.'];
            $current = is_file($path) ? (string) file_get_contents($path) : '';
            $relative = self::relative($path);
            $changes[$relative] = ['path' => $relative, 'content' => $content, 'summary' => mb_substr(trim((string) ($args['summary'] ?? 'Update file')), 0, 240), 'original_hash' => hash('sha256', $current), 'is_new' => !is_file($path)];
            return ['staged' => $relative];
        }
        if ($name === 'list_github_files') {
            $directory = trim(str_replace('\\', '/', (string) ($args['directory'] ?? '')), '/');
            $result = self::githubRequest('GET', $directory);
            if (isset($result['_error'])) return $result;
            $files = [];
            foreach ($result as $item) {
                if (!is_array($item) || !isset($item['path'], $item['type'])) continue;
                $files[] = ['path' => $item['path'], 'type' => $item['type'], 'sha' => $item['sha'] ?? null];
            }
            return ['files' => $files];
        }
        if ($name === 'read_github_file') {
            $path = trim(str_replace('\\', '/', (string) ($args['path'] ?? '')), '/');
            if (!self::githubPathAllowed($path)) return ['error' => 'That GitHub path is not available.'];
            $result = self::githubRequest('GET', $path);
            if (isset($result['_error'])) return $result;
            $content = base64_decode(str_replace("\n", '', (string) ($result['content'] ?? '')), true);
            return is_string($content) ? ['path' => $path, 'content' => $content, 'sha' => $result['sha'] ?? ''] : ['error' => 'GitHub returned unreadable content.'];
        }
        if ($name === 'propose_github_file') {
            $path = trim(str_replace('\\', '/', (string) ($args['path'] ?? '')), '/');
            if (!self::githubPathAllowed($path)) return ['error' => 'That GitHub path is not editable.'];
            $content = (string) ($args['content'] ?? '');
            if (strlen($content) > self::MAX_FILE_BYTES) return ['error' => 'Proposed content is too large.'];
            $changes[$path] = ['workspace' => 'github', 'path' => $path, 'content' => $content, 'summary' => mb_substr(trim((string) ($args['summary'] ?? 'Update file')), 0, 240), 'original_hash' => (string) ($args['sha'] ?? ''), 'is_new' => ((string) ($args['sha'] ?? '')) === ''];
            return ['staged' => $path];
        }
        return ['error' => 'Unknown tool.'];
    }

    private static function githubBranch(): string { return trim((string) Settings::get('coding_github_branch')) ?: 'main'; }

    private static function githubPathAllowed(string $path): bool
    {
        return $path !== '' && !str_contains($path, '..') && self::allowed(self::root() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $path));
    }

    private static function githubRequest(string $method, string $path, ?array $body = null): array
    {
        $repo = trim((string) Settings::get('coding_github_repo'));
        $token = trim((string) Settings::get('coding_github_token'));
        if (!preg_match('/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/', $repo) || $token === '') return ['_error' => 'Configure the GitHub repository and token in Code Agent Settings.'];
        if (!function_exists('curl_init')) return ['_error' => 'GitHub access is unavailable on this server.'];
        $url = 'https://api.github.com/repos/' . $repo . '/contents/' . implode('/', array_map('rawurlencode', array_filter(explode('/', $path))));
        if ($method === 'GET') $url .= '?ref=' . rawurlencode(self::githubBranch());
        $ch = curl_init($url);
        $options = [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => ['Accept: application/vnd.github+json', 'Authorization: Bearer ' . $token, 'X-GitHub-Api-Version: 2022-11-28', 'User-Agent: princecaleb-code-agent'], CURLOPT_TIMEOUT => 25];
        if ($body !== null) { $options[CURLOPT_POSTFIELDS] = json_encode($body); $options[CURLOPT_HTTPHEADER][] = 'Content-Type: application/json'; }
        curl_setopt_array($ch, $options);
        $response = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
        $decoded = json_decode((string) $response, true);
        if ($response === false || $status < 200 || $status >= 300 || !is_array($decoded)) return ['_error' => is_array($decoded) && isset($decoded['message']) ? 'GitHub: ' . $decoded['message'] : 'GitHub request failed.'];
        return $decoded;
    }

    private static function root(): string { return dirname(__DIR__, 2); }

    private static function safePath(string $relative, bool $allowNew): string
    {
        $relative = str_replace('\\', '/', trim($relative, " /\t\n\r\0\x0B"));
        if ($relative === '' && !$allowNew) return self::root();
        if ($relative === '' || str_contains($relative, '..') || str_contains($relative, "\0") || preg_match('/^[A-Za-z]:/', $relative)) {
            Response::error('Invalid repository path.', 422);
        }
        $candidate = self::root() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
        $existing = realpath($candidate);
        $resolved = $existing !== false ? $existing : realpath(dirname($candidate)) . DIRECTORY_SEPARATOR . basename($candidate);
        $root = realpath(self::root());
        if (!is_string($resolved) || !is_string($root) || ($resolved !== $root && !str_starts_with($resolved, $root . DIRECTORY_SEPARATOR))) {
            Response::error('Path is outside the repository.', 422);
        }
        return $resolved;
    }

    private static function relative(string $path): string
    {
        return str_replace('\\', '/', ltrim(substr($path, strlen((string) realpath(self::root()))), '\\/'));
    }

    private static function allowed(string $path): bool
    {
        $relative = strtolower(self::relative($path));
        foreach (['/.git/', 'node_modules/', 'vendor/', 'storage/', 'public/uploads/', 'database/database', '.env', 'config/config.php'] as $blocked) {
            if (str_contains('/' . $relative, $blocked)) return false;
        }
        return (bool) preg_match('/\.(php|tsx?|jsx?|css|scss|html?|json|md|sql|ya?ml|xml|svg|txt)$/i', $relative);
    }
}
