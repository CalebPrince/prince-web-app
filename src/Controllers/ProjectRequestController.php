<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\RateLimitMiddleware;
use App\Support\Database;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Validator;

/**
 * Public, detailed project intake form. Separate from the simple contact
 * form (InquiryController) because it accepts multipart file attachments
 * and a richer set of fields, but writes into the same inquiries table
 * (type = 'project_request') so admin listing/export/notifications work
 * against one unified source.
 */
class ProjectRequestController
{
    private const MAX_FILES = 5;
    private const MAX_BYTES = 10 * 1024 * 1024; // 10MB per file
    private const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif', 'webp'];

    /** POST /api/v1/project-requests — multipart form, public, honeypot + rate-limited */
    public static function create(): void
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        $config = appConfig();
        RateLimitMiddleware::enforce('project_request', $config['contact_rate_limit']);

        $data = $_POST;

        // Honeypot: silently pretend success so bots don't learn their submission was rejected.
        if (!empty($data['website'])) {
            Response::json(['status' => 'received'], 201);
        }

        $errors = Validator::validateProjectRequest($data);
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        try {
            $attachmentPaths = self::storeAttachments();
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
            return;
        }

        $features = array_key_exists('features', $data) && is_array($data['features'])
            ? implode(', ', array_map('trim', $data['features']))
            : trim((string) ($data['features'] ?? ''));

        $pdo = Database::get();
        $stmt = $pdo->prepare(
            "INSERT INTO inquiries
                (name, email, message, ip_address, user_agent, type, project_type, budget, timeline, features, attachments)
             VALUES (?, ?, ?, ?, ?, 'project_request', ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            trim($data['name']),
            trim($data['email']),
            trim($data['message']),
            $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            $_SERVER['HTTP_USER_AGENT'] ?? null,
            trim($data['project_type']),
            trim($data['budget']),
            trim($data['timeline']),
            $features !== '' ? $features : null,
            $attachmentPaths ? json_encode($attachmentPaths) : null,
        ]);
        $inquiryId = (int) $pdo->lastInsertId();

        $pdo->prepare('INSERT INTO webhook_queue (inquiry_id) VALUES (?)')->execute([$inquiryId]);

        // Best-effort courtesy confirmation to the client — the admin notification
        // above is the reliable, retried path; this one just needs to not crash
        // the request if the mail transport hiccups.
        Mailer::send(
            trim($data['email']),
            "We've received your project request",
            sprintf(
                "Hi %s,\n\nThanks for the details — I'll review your project request (%s, %s budget, %s timeline) "
                . "and get back to you within a couple of business days with next steps.\n\n"
                . "If anything changes in the meantime, just reply to this email.\n\n— Prince Caleb",
                trim($data['name']),
                trim($data['project_type']),
                trim($data['budget']),
                trim($data['timeline'])
            )
        );

        Response::json(['status' => 'received'], 201);
    }

    /** @return array<int,string> stored /uploads/project-requests/... paths */
    private static function storeAttachments(): array
    {
        if (empty($_FILES['attachments'])) {
            return [];
        }

        $files = $_FILES['attachments'];
        $count = is_array($files['name']) ? count($files['name']) : 0;
        if ($count > self::MAX_FILES) {
            throw new \RuntimeException('You can attach at most ' . self::MAX_FILES . ' files.');
        }

        $destDir = dirname(__DIR__, 2) . '/public/uploads/project-requests';
        if (!is_dir($destDir)) {
            mkdir($destDir, 0755, true);
        }

        $paths = [];
        for ($i = 0; $i < $count; $i++) {
            if ($files['error'][$i] === UPLOAD_ERR_NO_FILE) {
                continue;
            }
            if ($files['error'][$i] !== UPLOAD_ERR_OK) {
                throw new \RuntimeException('One of the attachments failed to upload — it may be too large.');
            }
            if ($files['size'][$i] > self::MAX_BYTES) {
                throw new \RuntimeException('Attachments must be under 10MB each.');
            }

            $ext = strtolower(pathinfo($files['name'][$i], PATHINFO_EXTENSION));
            if (!in_array($ext, self::ALLOWED_EXT, true)) {
                throw new \RuntimeException('Allowed attachment types: PDF, DOC, DOCX, JPG, PNG, GIF, WEBP.');
            }
            if (!self::hasValidSignature($files['tmp_name'][$i], $ext)) {
                throw new \RuntimeException('One of the attachments is not a valid file of its type.');
            }

            $filename = bin2hex(random_bytes(10)) . '.' . $ext;
            if (!move_uploaded_file($files['tmp_name'][$i], "{$destDir}/{$filename}")) {
                throw new \RuntimeException('Could not save an attachment.');
            }
            $paths[] = '/uploads/project-requests/' . $filename;
        }

        return $paths;
    }

    private static function hasValidSignature(string $tmpPath, string $ext): bool
    {
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true)) {
            return @getimagesize($tmpPath) !== false;
        }

        $head = file_get_contents($tmpPath, false, null, 0, 8);
        if ($head === false) {
            return false;
        }
        if ($ext === 'pdf') {
            return str_starts_with($head, '%PDF-');
        }
        if ($ext === 'doc') {
            return str_starts_with($head, "\xD0\xCF\x11\xE0");
        }
        if ($ext === 'docx') {
            return str_starts_with($head, "PK\x03\x04");
        }

        return false;
    }
}
