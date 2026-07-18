<?php

declare(strict_types=1);

/**
 * Deploy-time database migration hook.
 *
 * The GitHub Actions deploy is FTP-only — it copies files to the cPanel host
 * but has no shell there to run `php database/migrate.php` after a schema
 * change. This endpoint lets the workflow trigger that migration over HTTPS
 * once the file sync has finished (see .github/workflows/deploy.yml).
 *
 * Locked down: POST only, and guarded by a shared secret (DEPLOY_MIGRATE_TOKEN,
 * matched in constant time) that must be set both as a GitHub secret and in the
 * server's .env. If the server-side token is unset it fails closed with 503, so
 * this can never run for an unconfigured deploy or a random visitor. The
 * migration it runs is idempotent (CREATE TABLE IF NOT EXISTS + guarded ALTER
 * TABLEs), so re-triggering it is always safe.
 */

require dirname(__DIR__) . '/config/config.php';
$config = appConfig();

header('Content-Type: application/json');
header('X-Robots-Tag: noindex, nofollow');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed.']);
    exit;
}

$expected = (string) ($config['deploy_migrate_token'] ?? '');
if ($expected === '') {
    // No server-side token configured — auto-migration is disabled. The
    // workflow treats this 503 as "skip", not a hard failure.
    http_response_code(503);
    echo json_encode(['error' => 'Auto-migration is not enabled on this server.']);
    exit;
}

$provided = $_SERVER['HTTP_X_DEPLOY_TOKEN'] ?? ($_POST['token'] ?? '');
if (!is_string($provided) || !hash_equals($expected, $provided)) {
    http_response_code(403);
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

// migrate.php echoes its progress and runs to completion; capture that so the
// workflow log shows what happened, and turn any failure into a clean 500.
try {
    ob_start();
    require dirname(__DIR__) . '/database/migrate.php';
    $output = trim((string) ob_get_clean());
    echo json_encode(['ok' => true, 'output' => $output]);
} catch (\Throwable $e) {
    if (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
