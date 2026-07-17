<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Database;
use App\Support\EmailTemplate;
use App\Support\Mailer;
use App\Support\Response;

/** Admin-side CRUD for client portal accounts, files, and messages. */
class ClientController
{
    private const MAX_BYTES = 10 * 1024 * 1024; // 10MB
    private const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif', 'webp'];

    /** GET /api/v1/admin/clients */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $rows = Database::get()->query(
            "SELECT c.*,
                    (SELECT COUNT(*) FROM proposals p WHERE p.client_id = c.id) AS proposal_count,
                    (SELECT MAX(created_at) FROM proposals p WHERE p.client_id = c.id) AS last_proposal_at
             FROM clients c
             ORDER BY c.created_at DESC"
        )->fetchAll();

        foreach ($rows as &$row) {
            $row['has_password'] = $row['password_hash'] !== null;
            unset($row['password_hash'], $row['invite_token'], $row['reset_token']);
        }
        unset($row);

        Response::json($rows);
    }

    /** GET /api/v1/admin/clients/{id} */
    public static function show(array $params): void
    {
        AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $pdo = Database::get();

        $stmt = $pdo->prepare('SELECT * FROM clients WHERE id = ?');
        $stmt->execute([$id]);
        $client = $stmt->fetch();
        if (!$client) {
            Response::error('Client not found.', 404);
        }
        $client['has_password'] = $client['password_hash'] !== null;
        unset($client['password_hash'], $client['invite_token'], $client['reset_token']);

        $stmt = $pdo->prepare('SELECT * FROM proposals WHERE client_id = ? ORDER BY created_at DESC');
        $stmt->execute([$id]);
        $client['proposals'] = $stmt->fetchAll();

        $stmt = $pdo->prepare('SELECT * FROM client_files WHERE client_id = ? ORDER BY created_at DESC');
        $stmt->execute([$id]);
        $client['files'] = $stmt->fetchAll();

        $stmt = $pdo->prepare('UPDATE client_messages SET read_by_admin = 1 WHERE client_id = ? AND sender_type = ?');
        $stmt->execute([$id, 'client']);
        $stmt = $pdo->prepare('SELECT * FROM client_messages WHERE client_id = ? ORDER BY created_at ASC');
        $stmt->execute([$id]);
        $client['messages'] = $stmt->fetchAll();

        Response::json($client);
    }

    /** POST /api/v1/admin/clients/invite — body: {name, email, phone?, proposal_id?} */
    public static function invite(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $name = trim((string) ($data['name'] ?? ''));
        $email = trim((string) ($data['email'] ?? ''));
        $phone = trim((string) ($data['phone'] ?? ''));

        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('A valid client name and email are required.', 422);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM clients WHERE email = ?');
        $stmt->execute([$email]);
        $client = $stmt->fetch();

        $inviteToken = bin2hex(random_bytes(16));

        if ($client) {
            $pdo->prepare(
                "UPDATE clients SET invite_token = ?, invite_expires_at = datetime('now', '+7 days'),
                 phone = COALESCE(NULLIF(?, ''), phone) WHERE id = ?"
            )->execute([$inviteToken, $phone, $client['id']]);
            $clientId = (int) $client['id'];
        } else {
            $pdo->prepare(
                "INSERT INTO clients (email, name, phone, invite_token, invite_expires_at)
                 VALUES (?, ?, ?, ?, datetime('now', '+7 days'))"
            )->execute([$email, $name, $phone !== '' ? $phone : null, $inviteToken]);
            $clientId = (int) $pdo->lastInsertId();
        }

        $pdo->prepare('UPDATE proposals SET client_id = ? WHERE client_email = ? AND client_id IS NULL')
            ->execute([$clientId, $email]);
        $pdo->prepare('UPDATE payment_links SET client_id = ? WHERE client_email = ? AND client_id IS NULL')
            ->execute([$clientId, $email]);

        $url = self::absoluteUrl('/client/setup.html?token=' . $inviteToken);
        $message = EmailTemplate::render('client_invite', [
            'client_name' => $name,
            'client_email' => $email,
            'portal_url' => $url,
        ], EmailTemplate::defaults()['client_invite']);
        $sent = Mailer::sendHtml($email, $message['subject'], $message['html'], $message['text']);

        if (false) $sent = Mailer::send(
            $email,
            "You're invited to your client portal",
            "Hi {$name},\n\nYou can now track your project status, milestones, files, and messages in one place:\n\n{$url}\n\n"
                . "This link expires in 7 days.\n\nPrince Caleb"
        );

        Response::json(['client_id' => $clientId, 'url' => $url, 'email_sent' => $sent], 201);
    }

    /** PATCH /api/v1/admin/clients/{id} — body: {name?, phone?, is_active?} */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $fields = [];
        $values = [];
        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);
            if ($name === '') {
                Response::error('Name cannot be empty.', 422);
            }
            $fields[] = 'name = ?';
            $values[] = $name;
        }
        if (array_key_exists('phone', $data)) {
            $phone = trim((string) $data['phone']);
            $fields[] = 'phone = ?';
            $values[] = $phone !== '' ? $phone : null;
        }
        if (array_key_exists('is_active', $data)) {
            $fields[] = 'is_active = ?';
            $values[] = !empty($data['is_active']) ? 1 : 0;
        }
        if (!$fields) {
            Response::error('Nothing to update.', 422);
        }

        $values[] = $id;
        $pdo = Database::get();
        $stmt = $pdo->prepare('UPDATE clients SET ' . implode(', ', $fields) . ' WHERE id = ?');
        $stmt->execute($values);
        if ($stmt->rowCount() === 0) {
            Response::error('Client not found.', 404);
        }

        Response::json(['status' => 'updated']);
    }

    /**
     * DELETE /api/v1/admin/clients/{id} — also removes the portal account's
     * files and messages (ON DELETE CASCADE), and detaches (not deletes) any
     * proposals/payment links that referenced this client (ON DELETE SET
     * NULL) — those stay on file, just no longer linked to a portal account.
     */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) ($params['id'] ?? 0);

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT name FROM clients WHERE id = ?');
        $stmt->execute([$id]);
        $name = $stmt->fetchColumn();
        if ($name === false) {
            Response::error('Client not found.', 404);
        }

        $pdo->prepare('DELETE FROM clients WHERE id = ?')->execute([$id]);
        ActivityLog::log($user, 'deleted', 'client', $id, $name ?: null);
        Response::json(['status' => 'deleted']);
    }

    /** POST /api/v1/admin/clients/{id}/files — multipart form field "file" */
    public static function uploadFile(array $params): void
    {
        AuthMiddleware::requireAuth();
        $clientId = (int) ($params['id'] ?? 0);
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM clients WHERE id = ?');
        $stmt->execute([$clientId]);
        if (!$stmt->fetch()) {
            Response::error('Client not found.', 404);
        }

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

        // DOCUMENT_ROOT, not '../../public' — production deploys public/'s
        // contents into public_html/, so a literal "public/" folder next to
        // src/ sits outside the web root and would 404 forever.
        $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? (dirname(__DIR__, 2) . '/public');
        $destDir = $docRoot . '/uploads/client-files/' . $clientId;
        if (!is_dir($destDir)) {
            mkdir($destDir, 0755, true);
        }

        $filename = bin2hex(random_bytes(10)) . '.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], "{$destDir}/{$filename}")) {
            Response::error('Could not save the uploaded file.', 500);
        }

        $path = '/uploads/client-files/' . $clientId . '/' . $filename;
        $pdo->prepare(
            'INSERT INTO client_files (client_id, uploaded_by, file_path, original_name, size_bytes)
             VALUES (?, ?, ?, ?, ?)'
        )->execute([$clientId, 'admin', $path, $file['name'], $file['size']]);

        Response::json(['id' => (int) $pdo->lastInsertId(), 'path' => $path], 201);
    }

    /** DELETE /api/v1/admin/clients/{id}/files/{fileId} */
    public static function deleteFile(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $clientId = (int) ($params['id'] ?? 0);
        $fileId = (int) ($params['fileId'] ?? 0);

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT file_path, original_name FROM client_files WHERE id = ? AND client_id = ?');
        $stmt->execute([$fileId, $clientId]);
        $file = $stmt->fetch();
        if (!$file) {
            Response::error('File not found.', 404);
        }

        $docRoot = $_SERVER['DOCUMENT_ROOT'] ?? (dirname(__DIR__, 2) . '/public');
        $absolutePath = $docRoot . $file['file_path'];
        if (is_file($absolutePath)) {
            unlink($absolutePath);
        }

        $pdo->prepare('DELETE FROM client_files WHERE id = ?')->execute([$fileId]);
        ActivityLog::log($user, 'deleted', 'client_file', $fileId, $file['original_name'] ?: null);
        Response::json(['status' => 'deleted']);
    }

    /** GET /api/v1/admin/clients/{id}/messages */
    public static function listMessages(array $params): void
    {
        AuthMiddleware::requireAuth();
        $clientId = (int) ($params['id'] ?? 0);
        $pdo = Database::get();

        $pdo->prepare('UPDATE client_messages SET read_by_admin = 1 WHERE client_id = ? AND sender_type = ?')
            ->execute([$clientId, 'client']);

        $stmt = $pdo->prepare('SELECT * FROM client_messages WHERE client_id = ? ORDER BY created_at ASC');
        $stmt->execute([$clientId]);
        Response::json($stmt->fetchAll());
    }

    /** POST /api/v1/admin/clients/{id}/messages — body: {body} */
    public static function sendMessage(array $params): void
    {
        AuthMiddleware::requireAuth();
        $clientId = (int) ($params['id'] ?? 0);
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $body = trim((string) ($data['body'] ?? ''));
        if ($body === '') {
            Response::error('Message cannot be empty.', 422);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM clients WHERE id = ?');
        $stmt->execute([$clientId]);
        $client = $stmt->fetch();
        if (!$client) {
            Response::error('Client not found.', 404);
        }

        $pdo->prepare(
            'INSERT INTO client_messages (client_id, sender_type, body, read_by_admin) VALUES (?, ?, ?, 1)'
        )->execute([$clientId, 'admin', $body]);

        $portalUrl = self::absoluteUrl('/client/dashboard.html');
        $message = EmailTemplate::render('client_portal_message', [
            'client_name' => $client['name'],
            'client_email' => $client['email'],
            'message_body' => $body,
            'portal_url' => $portalUrl,
        ], EmailTemplate::defaults()['client_portal_message']);
        Mailer::sendHtml($client['email'], $message['subject'], $message['html'], $message['text']);

        if (false) Mailer::send(
            $client['email'],
            'New message from Prince Caleb',
            "Hi {$client['name']},\n\nYou have a new message in your client portal:\n\n{$body}\n\n"
                . self::absoluteUrl('/client/dashboard.html')
        );

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

    private static function absoluteUrl(string $path): string
    {
        $host = $_SERVER['HTTP_HOST'] ?? 'princecaleb.dev';
        $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https' ? 'https' : 'http';
        if ($host === 'princecaleb.dev' || str_ends_with($host, '.princecaleb.dev')) {
            $scheme = 'https';
        }

        return $scheme . '://' . $host . $path;
    }
}
