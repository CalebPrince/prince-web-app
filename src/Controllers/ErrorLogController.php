<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Response;

class ErrorLogController
{
    /** GET /api/v1/admin/error-logs */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();

        $sources = self::sources();
        $sourceId = (string) ($_GET['source'] ?? '');
        $severity = strtolower(trim((string) ($_GET['severity'] ?? '')));
        $query = strtolower(trim((string) ($_GET['q'] ?? '')));
        $limit = min(1000, max(50, (int) ($_GET['limit'] ?? 300)));

        $selected = $sourceId !== '' && isset($sources[$sourceId])
            ? [$sourceId => $sources[$sourceId]]
            : array_filter($sources, fn($source) => $source['readable']);

        $entries = [];
        foreach ($selected as $id => $source) {
            if (!$source['readable']) {
                continue;
            }
            foreach (self::withEntryIds($id, self::entriesFromFile($source['path'], $limit)) as $entry) {
                $entry['source_id'] = $id;
                $entry['source_label'] = $source['label'];
                unset($entry['raw']);
                if ($severity !== '' && $entry['severity'] !== $severity) {
                    continue;
                }
                if ($query !== '' && !str_contains(strtolower($entry['message']), $query)) {
                    continue;
                }
                $entries[] = $entry;
            }
        }

        usort($entries, fn($a, $b) => strcmp($b['timestamp'] ?? '', $a['timestamp'] ?? ''));
        $entries = array_slice($entries, 0, $limit);

        Response::json([
            'sources' => array_values($sources),
            'entries' => $entries,
            'limit' => $limit,
        ]);
    }

    /** POST /api/v1/admin/error-logs/delete-entry */
    public static function deleteEntry(): void
    {
        AuthMiddleware::requireAuth();

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $sourceId = (string) ($data['source_id'] ?? '');
        $entryId = (string) ($data['entry_id'] ?? '');
        $source = self::sourceForId($sourceId);

        if ($source === null) {
            Response::error('Unknown log source.', 422);
        }
        if (!$source['readable'] || !$source['writable']) {
            Response::error('That log file is not readable and writable by the web server.', 422);
        }
        if ($entryId === '') {
            Response::error('Missing log entry ID.', 422);
        }

        $entriesNewestFirst = self::withEntryIds($sourceId, array_reverse(self::entriesFromFullFile($source['path'])));
        $keptNewestFirst = [];
        $deleted = false;

        foreach ($entriesNewestFirst as $entry) {
            if (!$deleted && ($entry['entry_id'] ?? '') === $entryId) {
                $deleted = true;
                continue;
            }
            $keptNewestFirst[] = $entry;
        }

        if (!$deleted) {
            Response::error('That log entry was not found. Refresh and try again.', 404);
        }
        if (!self::writeEntries($source['path'], array_reverse($keptNewestFirst))) {
            Response::error('Could not update the log file. Check file permissions.', 500);
        }

        Response::json(['deleted' => true]);
    }

    /** POST /api/v1/admin/error-logs/clear */
    public static function clear(): void
    {
        AuthMiddleware::requireAuth();

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $sourceId = (string) ($data['source_id'] ?? '');
        $sources = self::sources();
        $selected = [];

        if ($sourceId !== '') {
            if (!isset($sources[$sourceId])) {
                Response::error('Unknown log source.', 422);
            }
            $selected[$sourceId] = $sources[$sourceId];
        } else {
            $selected = $sources;
        }

        $cleared = [];
        foreach ($selected as $id => $source) {
            if (!$source['readable'] || !$source['writable']) {
                continue;
            }
            if (file_put_contents($source['path'], '', LOCK_EX) === false) {
                Response::error('Could not clear ' . $source['label'] . '. Check file permissions.', 500);
            }
            $cleared[] = $id;
        }

        if ($cleared === []) {
            Response::error('No writable log files were found to clear.', 422);
        }

        Response::json(['cleared' => $cleared]);
    }

    /** @return array<string,mixed>|null */
    private static function sourceForId(string $sourceId): ?array
    {
        $sources = self::sources();
        return $sources[$sourceId] ?? null;
    }

    /** @return array<string,array<string,mixed>> */
    private static function sources(): array
    {
        $appRoot = dirname(__DIR__, 2);
        $publicRoot = $_SERVER['DOCUMENT_ROOT'] ?? ($appRoot . '/public');
        $candidates = [
            'app_error_log' => ['Application error_log', $appRoot . '/error_log'],
            'public_error_log' => ['Public error_log', $publicRoot . '/error_log'],
            'public_html_error_log' => ['public_html error_log', $appRoot . '/public_html/error_log'],
            'storage_app_log' => ['Storage app.log', $appRoot . '/storage/logs/app.log'],
            'storage_error_log' => ['Storage error.log', $appRoot . '/storage/logs/error.log'],
        ];

        $iniLog = ini_get('error_log');
        if (is_string($iniLog) && $iniLog !== '') {
            $candidates['php_error_log'] = ['PHP configured error_log', $iniLog];
        }

        foreach (glob($appRoot . '/storage/logs/*.log') ?: [] as $path) {
            $id = 'storage_' . preg_replace('/[^a-z0-9]+/', '_', strtolower(basename($path)));
            $candidates[$id] = ['Storage ' . basename($path), $path];
        }

        $out = [];
        foreach ($candidates as $id => [$label, $path]) {
            $resolved = self::safePath($path, $appRoot, $publicRoot);
            $exists = $resolved !== null && is_file($resolved);
            $out[$id] = [
                'id' => $id,
                'label' => $label,
                'path' => $resolved ?? $path,
                'exists' => $exists,
                'readable' => $exists && is_readable($resolved),
                'writable' => $exists && is_writable($resolved),
                'size' => $exists ? filesize($resolved) : null,
                'modified_at' => $exists ? date('c', filemtime($resolved)) : null,
            ];
        }

        return $out;
    }

    private static function safePath(string $path, string $appRoot, string $publicRoot): ?string
    {
        if ($path === '') {
            return null;
        }
        if (!preg_match('/(^|[\/\\\\])(?:error_log|[^\/\\\\]+\.log)$/i', $path)) {
            return null;
        }

        $absolute = str_starts_with($path, '/') || preg_match('/^[A-Za-z]:[\/\\\\]/', $path)
            ? $path
            : $appRoot . '/' . $path;

        $dir = realpath(dirname($absolute));
        if ($dir === false) {
            return null;
        }
        $candidate = $dir . DIRECTORY_SEPARATOR . basename($absolute);

        $allowedRoots = array_filter([
            realpath($appRoot),
            realpath($publicRoot),
            realpath($appRoot . '/public_html'),
            realpath($appRoot . '/storage'),
        ]);
        foreach ($allowedRoots as $root) {
            if ($candidate === $root || str_starts_with($candidate, rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)) {
                return $candidate;
            }
        }

        return null;
    }

    /** @return array<int,array<string,string>> */
    private static function entriesFromFile(string $path, int $limit): array
    {
        $lines = self::tailLines($path, min(5000, $limit * 8));
        return array_slice(array_reverse(self::parseEntries($lines)), 0, $limit);
    }

    /** @return array<int,array<string,string|null>> */
    private static function entriesFromFullFile(string $path): array
    {
        $contents = file_get_contents($path);
        if ($contents === false || $contents === '') {
            return [];
        }

        return self::parseEntries(preg_split('/\r\n|\r|\n/', rtrim($contents, "\r\n")) ?: []);
    }

    /** @param array<int,string> $lines @return array<int,array<string,string|null>> */
    private static function parseEntries(array $lines): array
    {
        $entries = [];
        $current = null;

        foreach ($lines as $line) {
            if (preg_match('/^\[(\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2} [A-Z]+)\]\s*(.*)$/', $line, $m)) {
                if ($current !== null) {
                    $entries[] = $current;
                }
                $current = [
                    'timestamp' => self::normalizeTimestamp($m[1]),
                    'severity' => self::severity($m[2]),
                    'message' => $m[2],
                    'raw' => $line,
                ];
                continue;
            }

            if ($current === null) {
                $current = [
                    'timestamp' => null,
                    'severity' => self::severity($line),
                    'message' => $line,
                    'raw' => $line,
                ];
            } else {
                $current['message'] .= "\n" . $line;
                $current['raw'] .= "\n" . $line;
            }
        }
        if ($current !== null) {
            $entries[] = $current;
        }

        return $entries;
    }

    /** @param array<int,array<string,string|null>> $entries @return array<int,array<string,string|null>> */
    private static function withEntryIds(string $sourceId, array $entries): array
    {
        $seen = [];
        foreach ($entries as &$entry) {
            $key = (string) ($entry['raw'] ?? $entry['message'] ?? '');
            $hash = sha1($key);
            $seen[$hash] = ($seen[$hash] ?? 0) + 1;
            $entry['entry_id'] = sha1($sourceId . "\n" . $hash . "\n" . $seen[$hash]);
        }
        unset($entry);

        return $entries;
    }

    /** @param array<int,array<string,string|null>> $entries */
    private static function writeEntries(string $path, array $entries): bool
    {
        $content = implode(PHP_EOL, array_map(
            fn($entry) => rtrim((string) ($entry['raw'] ?? $entry['message'] ?? ''), "\r\n"),
            $entries
        ));
        if ($content !== '') {
            $content .= PHP_EOL;
        }

        return file_put_contents($path, $content, LOCK_EX) !== false;
    }

    /** @return array<int,string> */
    private static function tailLines(string $path, int $lines): array
    {
        $fh = fopen($path, 'rb');
        if (!$fh) {
            return [];
        }

        $buffer = '';
        $chunkSize = 8192;
        fseek($fh, 0, SEEK_END);
        $pos = ftell($fh);
        while ($pos > 0 && substr_count($buffer, "\n") <= $lines) {
            $read = min($chunkSize, $pos);
            $pos -= $read;
            fseek($fh, $pos);
            $buffer = fread($fh, $read) . $buffer;
        }
        fclose($fh);

        $all = preg_split('/\r\n|\r|\n/', trim($buffer)) ?: [];
        return array_slice($all, -$lines);
    }

    private static function normalizeTimestamp(string $value): ?string
    {
        $dt = \DateTime::createFromFormat('d-M-Y H:i:s T', $value);
        return $dt ? $dt->format('c') : null;
    }

    private static function severity(string $message): string
    {
        $lower = strtolower($message);
        if (str_contains($lower, 'fatal error') || str_contains($lower, 'uncaught')) {
            return 'fatal';
        }
        if (str_contains($lower, 'warning')) {
            return 'warning';
        }
        if (str_contains($lower, 'notice') || str_contains($lower, 'deprecated')) {
            return 'notice';
        }
        if (str_contains($lower, 'failed') || str_contains($lower, 'error')) {
            return 'error';
        }
        return 'info';
    }
}
