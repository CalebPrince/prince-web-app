<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\RateLimitMiddleware;
use App\Support\Response;

/**
 * Receives client-side (browser) JS errors from every page — public site
 * and admin alike — and writes them through the same error_log() every
 * other part of this app already uses, so a frontend bug shows up in
 * Admin -> Error Logs exactly like a PHP one does, instead of being
 * invisible outside whoever happened to have devtools open.
 *
 * Deliberately unauthenticated — errors happen for anonymous visitors too,
 * not just logged-in admins — so it's rate-limited per IP to bound log
 * growth from a page looping on one broken error, or outright abuse.
 */
class ClientErrorController
{
    /** POST /api/v1/client-error — body: {message, source?, line?, col?, stack?} */
    public static function log(): void
    {
        RateLimitMiddleware::enforce('client_error', 30);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $message = trim((string) ($data['message'] ?? ''));
        if ($message === '') {
            Response::json(['status' => 'ignored']);
        }

        $source = trim((string) ($data['source'] ?? ''));
        $line = $data['line'] ?? null;
        $col = $data['col'] ?? null;
        $stack = trim((string) ($data['stack'] ?? ''));
        // Single line only — the Error Logs parser groups everything after
        // a "[timestamp]" line into that one entry until the next
        // timestamped line, so a raw multi-line stack trace would otherwise
        // bleed into whatever gets logged right after it.
        $stack = str_replace(["\r\n", "\r", "\n"], ' | ', $stack);

        error_log(sprintf(
            'Client-side JS error: %s | at %s:%s:%s | stack: %s | UA: %s',
            mb_substr($message, 0, 500),
            $source !== '' ? mb_substr($source, 0, 300) : 'unknown',
            $line !== null ? (string) $line : '?',
            $col !== null ? (string) $col : '?',
            $stack !== '' ? mb_substr($stack, 0, 800) : 'n/a',
            mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown'), 0, 200)
        ));

        Response::json(['status' => 'logged']);
    }
}
