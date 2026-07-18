<?php

declare(strict_types=1);

/**
 * GET /api/v1/arch/download.php?slug={slug}
 *
 * Streams a generated site as a .zip so the client can download and self-host it.
 * The slug is validated against the generated_sites table (never trusted from the
 * query string directly) so this can only ever zip a real, Arch-built site
 * directory — no path traversal into the rest of public/.
 */

require dirname(__DIR__, 4) . '/src/autoload.php';

use App\Agents\Arch;
use App\Support\Database;
use App\Support\Response;

$slug = (string) ($_GET['slug'] ?? '');
if ($slug === '' || !preg_match('/^[a-z0-9-]{1,60}$/', $slug)) {
    Response::error('Invalid site reference.', 422);
}

$pdo = Database::get();
$stmt = $pdo->prepare('SELECT business_name FROM generated_sites WHERE slug = ?');
$stmt->execute([$slug]);
$row = $stmt->fetch();
if ($row === false) {
    Response::error('Site not found.', 404);
}

$siteDir = Arch::sitesRoot() . '/' . $slug;
if (!is_dir($siteDir)) {
    Response::error('Site files are no longer available.', 404);
}

if (!class_exists('ZipArchive')) {
    Response::error('Downloads are not available on this server.', 501);
}

$tmp = tempnam(sys_get_temp_dir(), 'arch-site-') . '.zip';
$zip = new ZipArchive();
if ($zip->open($tmp, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    Response::error('Could not prepare the download.', 500);
}

$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($siteDir, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::SELF_FIRST
);
$base = rtrim($siteDir, '/') . '/';
foreach ($iterator as $file) {
    /** @var SplFileInfo $file */
    $path = $file->getPathname();
    $local = $slug . '/' . substr($path, strlen($base));
    if ($file->isDir()) {
        $zip->addEmptyDir($local);
    } else {
        $zip->addFile($path, $local);
    }
}
$zip->close();

$filename = $slug . '.zip';
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . (string) filesize($tmp));
readfile($tmp);
@unlink($tmp);
exit;
