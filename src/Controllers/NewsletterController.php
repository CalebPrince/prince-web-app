<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\Database;
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
            }
            Response::json(['status' => 'subscribed'], 200);
        }

        $pdo->prepare('INSERT INTO newsletter_subscribers (email, unsubscribe_token) VALUES (?, ?)')
            ->execute([$email, bin2hex(random_bytes(16))]);

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
        AuthMiddleware::requireAuth();
        Database::get()->prepare('DELETE FROM newsletter_subscribers WHERE id = ?')->execute([(int) $params['id']]);
        Response::json(['status' => 'deleted']);
    }
}
