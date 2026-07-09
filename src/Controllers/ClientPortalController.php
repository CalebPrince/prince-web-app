<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\ClientAuthMiddleware;
use App\Support\Database;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Settings;

class ClientPortalController
{
    private const MAX_BYTES = 10 * 1024 * 1024; // 10MB
    private const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif', 'webp'];

    /** GET /api/v1/client/dashboard */
    public static function dashboard(): void
    {
        $client = ClientAuthMiddleware::requireAuth();
        $pdo = Database::get();

        $stmt = $pdo->prepare(
            'SELECT * FROM proposals WHERE client_id = ? OR (client_id IS NULL AND client_email = ?) ORDER BY created_at DESC'
        );
        $stmt->execute([$client['id'], $client['email']]);
        $proposals = $stmt->fetchAll();

        foreach ($proposals as &$proposal) {
            $mStmt = $pdo->prepare(
                "SELECT pm.*, pl.token AS payment_token, pl.status AS payment_status
                 FROM proposal_milestones pm
                 LEFT JOIN payment_links pl ON pl.id = pm.payment_link_id
                 WHERE pm.proposal_id = ?
                 ORDER BY pm.sort_order, pm.id"
            );
            $mStmt->execute([$proposal['id']]);
            $milestones = $mStmt->fetchAll();
            foreach ($milestones as &$milestone) {
                $milestone['payment_url'] = $milestone['payment_token'] ? '/pay.html?token=' . $milestone['payment_token'] : null;
            }
            unset($milestone);
            $proposal['milestones'] = $milestones;
        }
        unset($proposal);

        // Uptime widget: only monitors explicitly assigned to this client.
        $mStmt = $pdo->prepare(
            'SELECT id, name, url, last_status, last_checked_at FROM uptime_monitors
             WHERE client_id = ? AND is_active = 1 ORDER BY created_at ASC'
        );
        $mStmt->execute([$client['id']]);
        $monitors = $mStmt->fetchAll();
        foreach ($monitors as &$monitor) {
            $stats = UptimeController::stats($pdo, (int) $monitor['id']);
            $monitor['uptime_30d'] = $stats['uptime_30d'];
            $monitor['avg_response_ms'] = $stats['avg_response_ms'];
            unset($monitor['id']);
        }
        unset($monitor);

        Response::json(['proposals' => $proposals, 'monitors' => $monitors]);
    }

    /** GET /api/v1/client/files */
    public static function listFiles(): void
    {
        $client = ClientAuthMiddleware::requireAuth();
        $stmt = Database::get()->prepare('SELECT * FROM client_files WHERE client_id = ? ORDER BY created_at DESC');
        $stmt->execute([$client['id']]);
        Response::json($stmt->fetchAll());
    }

    /** POST /api/v1/client/files — multipart form field "file" */
    public static function uploadFile(): void
    {
        $client = ClientAuthMiddleware::requireAuth();

        if (empty($_FILES['file']) || $_FILES['file']['error'] === UPLOAD_ERR_NO_FILE) {
            Response::error('No file was uploaded.', 422);
        }

        $file = $_FILES['file'];
        if ($file['error'] !== UPLOAD_ERR_OK) {
            Response::error('Upload failed — the file may be too large.', 422);
        }
        if ($file['size'] > self::MAX_BYTES) {
            Response::error('Files must be under 10MB.', 422);
        }

        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, self::ALLOWED_EXT, true)) {
            Response::error('Allowed file types: PDF, DOC, DOCX, JPG, PNG, GIF, WEBP.', 422);
        }
        if (!self::hasValidSignature($file['tmp_name'], $ext)) {
            Response::error('That file is not valid for its type.', 422);
        }

        $destDir = dirname(__DIR__, 2) . '/public/uploads/client-files/' . $client['id'];
        if (!is_dir($destDir)) {
            mkdir($destDir, 0755, true);
        }

        $filename = bin2hex(random_bytes(10)) . '.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], "{$destDir}/{$filename}")) {
            Response::error('Could not save the uploaded file.', 500);
        }

        $path = '/uploads/client-files/' . $client['id'] . '/' . $filename;
        $pdo = Database::get();
        $pdo->prepare(
            'INSERT INTO client_files (client_id, uploaded_by, file_path, original_name, size_bytes)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$client['id'], 'client', $path, $file['name'], $file['size']]);

        Response::json(['id' => (int) $pdo->lastInsertId(), 'path' => $path], 201);
    }

    /** GET /api/v1/client/messages */
    public static function listMessages(): void
    {
        $client = ClientAuthMiddleware::requireAuth();
        $pdo = Database::get();

        $pdo->prepare('UPDATE client_messages SET read_by_client = 1 WHERE client_id = ? AND sender_type = ?')
            ->execute([$client['id'], 'admin']);

        $stmt = $pdo->prepare('SELECT * FROM client_messages WHERE client_id = ? ORDER BY created_at ASC');
        $stmt->execute([$client['id']]);
        Response::json($stmt->fetchAll());
    }

    /** POST /api/v1/client/messages — body: {body} */
    public static function sendMessage(): void
    {
        $client = ClientAuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $body = trim((string) ($data['body'] ?? ''));
        if ($body === '') {
            Response::error('Message cannot be empty.', 422);
        }

        $pdo = Database::get();
        $pdo->prepare(
            'INSERT INTO client_messages (client_id, sender_type, body, read_by_client) VALUES (?, ?, ?, 1)'
        )->execute([$client['id'], 'client', $body]);

        $notifyEmail = Settings::get('notification_email') ?: Settings::get('social_email');
        if ($notifyEmail) {
            Mailer::send(
                $notifyEmail,
                'New client portal message from ' . $client['name'],
                "{$client['name']} ({$client['email']}) sent a message in the client portal:\n\n{$body}",
                $client['email']
            );
        }

        Response::json(['status' => 'sent'], 201);
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
