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
            foreach (self::entriesFromFile($source['path'], $limit) as $entry) {
                $entry['source_id'] = $id;
                $entry['source_label'] = $source['label'];
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
                ];
                continue;
            }

            if ($current === null) {
                $current = [
                    'timestamp' => null,
                    'severity' => self::severity($line),
                    'message' => $line,
                ];
            } else {
                $current['message'] .= "\n" . $line;
            }
        }
        if ($current !== null) {
            $entries[] = $current;
        }

        return array_slice(array_reverse($entries), 0, $limit);
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
