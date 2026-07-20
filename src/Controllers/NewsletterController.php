<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\ActivityLog;
use App\Support\Automations;
use App\Support\Database;
use App\Support\EmailTemplate;
use App\Support\Mailer;
use App\Support\Response;

class NewsletterController
{
    /** POST /api/v1/newsletter/subscribe — public, honeypot + rate-limited */
    public static function subscribe(): void
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        RateLimitMiddleware::enforce('newsletter_subscribe', appConfig()['contact_rate_limit']);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        // Honeypot: pretend success so bots don't learn their submission was rejected.
        if (!empty($data['website'])) {
            Response::json(['status' => 'subscribed'], 201);
        }

        $email = trim((string) ($data['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('A valid email address is required.', 422);
        }

        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id, status FROM newsletter_subscribers WHERE email = ?');
        $stmt->execute([$email]);
        $existing = $stmt->fetch();

        if ($existing) {
            if ($existing['status'] === 'unsubscribed') {
                $pdo->prepare("UPDATE newsletter_subscribers SET status = 'subscribed' WHERE id = ?")
                    ->execute([$existing['id']]);
                Automations::fire('newsletter_subscribed', $email, [
                    'last_action' => 'Re-subscribed to the newsletter',
                ], $pdo);
            }
            Response::json(['status' => 'subscribed'], 200);
        }

        $pdo->prepare('INSERT INTO newsletter_subscribers (email, unsubscribe_token) VALUES (?, ?)')
            ->execute([$email, bin2hex(random_bytes(16))]);

        Automations::fire('newsletter_subscribed', $email, [
            'last_action' => 'Subscribed to the newsletter',
        ], $pdo);

        Response::json(['status' => 'subscribed'], 201);
    }

    /** GET /api/v1/newsletter/unsubscribe?token=... — public, one-click from an email link */
    public static function unsubscribe(): void
    {
        $token = $_GET['token'] ?? '';
        if ($token !== '') {
            Database::get()
                ->prepare("UPDATE newsletter_subscribers SET status = 'unsubscribed' WHERE unsubscribe_token = ?")
                ->execute([$token]);
        }
        header('Location: /newsletter-unsubscribed.html');
        exit;
    }

    /** GET /api/v1/admin/newsletter */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        Response::json($pdo->query('SELECT * FROM newsletter_subscribers ORDER BY created_at DESC')->fetchAll());
    }

    /** GET /api/v1/admin/newsletter-drafts — Jason's reviewable blog announcements. */
    public static function adminDrafts(): void
    {
        AuthMiddleware::requireAuth();
        $rows = Database::get()->query('SELECT * FROM newsletter_drafts ORDER BY created_at DESC, id DESC')->fetchAll();
        Response::json($rows);
    }

    /**
     * POST /api/v1/admin/newsletter-drafts/{id}/send
     * Sends a Jason-drafted newsletter to every subscribed reader, wrapped in
     * the brand template with a per-subscriber unsubscribe link. Replaces the
     * old Make.com hand-off — the app now sends directly. Idempotent: a draft
     * that already has sent_at cannot be sent again.
     */
    public static function sendDraft(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $stmt = $pdo->prepare('SELECT * FROM newsletter_drafts WHERE id = ?');
        $stmt->execute([(int) $params['id']]);
        $draft = $stmt->fetch();

        if (!$draft) {
            Response::error('Draft not found.', 404);
        }
        if ($draft['status'] !== 'drafted' || empty($draft['subject_line']) || empty($draft['email_body'])) {
            Response::error('This draft is not ready to send yet.', 422);
        }
        if (!empty($draft['sent_at'])) {
            Response::error('This newsletter has already been sent.', 409);
        }

        $subscribers = $pdo->query(
            "SELECT email, unsubscribe_token FROM newsletter_subscribers WHERE status = 'subscribed'"
        )->fetchAll();

        $sent = 0;
        foreach ($subscribers as $sub) {
            $unsubscribeUrl = 'https://princecaleb.dev/api/v1/newsletter/unsubscribe?token=' . $sub['unsubscribe_token'];
            $text = $draft['email_body'] . "\n\n—\nUnsubscribe: " . $unsubscribeUrl;
            $html = EmailTemplate::wrapMarketing($draft['email_body'], 'Newsletter', $unsubscribeUrl);
            if (Mailer::sendHtml($sub['email'], $draft['subject_line'], $html, $text)) {
                $sent++;
            }
        }

        $pdo->prepare("UPDATE newsletter_drafts SET sent_at = datetime('now'), recipient_count = ? WHERE id = ?")
            ->execute([$sent, $draft['id']]);
        ActivityLog::log($user, 'sent', 'newsletter_draft', (int) $draft['id'], $draft['subject_line'], ['recipients' => $sent]);

        Response::json(['status' => 'sent', 'recipients' => $sent]);
    }

    /** GET /api/v1/admin/newsletter/export — CSV download */
    public static function exportCsv(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query('SELECT email, status, created_at FROM newsletter_subscribers ORDER BY created_at DESC')->fetchAll();

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="newsletter-subscribers-' . date('Y-m-d') . '.csv"');

        $out = fopen('php://output', 'w');
        fputcsv($out, ['Email', 'Status', 'Subscribed At'], ',', '"', '\\');
        foreach ($rows as $row) {
            fputcsv($out, [$row['email'], $row['status'], $row['created_at']], ',', '"', '\\');
        }
        fclose($out);
        exit;
    }

    /** DELETE /api/v1/admin/newsletter/{id} */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) $params['id'];
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT email FROM newsletter_subscribers WHERE id = ?');
        $stmt->execute([$id]);
        $email = $stmt->fetchColumn();

        $pdo->prepare('DELETE FROM newsletter_subscribers WHERE id = ?')->execute([$id]);
        ActivityLog::log($user, 'deleted', 'newsletter_subscriber', $id, $email ?: null);
        Response::json(['status' => 'deleted']);
    }
}
