<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\Database;
use App\Support\Mailer;
use App\Support\MakeWebhook;
use App\Support\Response;
use App\Support\Settings;

/**
 * Client testimonial pipeline: admin sends a request (name/email, optional
 * project reference) which emails the client a one-time link; the client
 * submits a quote + rating through that link; admin approves before it's
 * shown on the public testimonials page. Separate from the hand-authored
 * testimonial_1/2/3 homepage CMS fields.
 */
class TestimonialController
{
    /** GET /api/v1/testimonials — public, approved only, for the public listing page */
    public static function publicList(): void
    {
        $pdo = Database::get();
        $rows = $pdo->query(
            "SELECT client_name, project_reference, rating, quote, submitted_at
             FROM testimonials WHERE status = 'approved'
             ORDER BY sort_order ASC, submitted_at DESC"
        )->fetchAll();
        Response::json($rows);
    }

    /** GET /api/v1/testimonials/{token} — public, for the client submission form */
    public static function getByToken(array $params): void
    {
        $row = self::findByToken($params['token'] ?? '');
        if (!$row) {
            Response::error('This review link is invalid or has expired.', 404);
        }
        if ($row['status'] !== 'requested') {
            Response::error('This review has already been submitted — thank you!', 422);
        }

        Response::json([
            'client_name' => $row['client_name'],
            'project_reference' => $row['project_reference'],
        ]);
    }

    /** POST /api/v1/testimonials/{token} — public, body: {client_name?, rating, quote} */
    public static function submit(array $params): void
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        RateLimitMiddleware::enforce('testimonial_submit', appConfig()['contact_rate_limit']);

        $row = self::findByToken($params['token'] ?? '');
        if (!$row) {
            Response::error('This review link is invalid or has expired.', 404);
        }
        if ($row['status'] !== 'requested') {
            Response::error('This review has already been submitted — thank you!', 422);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $clientName = trim((string) ($data['client_name'] ?? $row['client_name']));
        $rating = (int) ($data['rating'] ?? 0);
        $quote = trim((string) ($data['quote'] ?? ''));

        if ($clientName === '' || mb_strlen($clientName) > 255) {
            Response::error('Your name is required.', 422);
        }
        if ($rating < 1 || $rating > 5) {
            Response::error('Please choose a rating from 1 to 5.', 422);
        }
        if ($quote === '' || mb_strlen($quote) > 2000) {
            Response::error('A review under 2000 characters is required.', 422);
        }

        Database::get()->prepare(
            "UPDATE testimonials SET client_name = ?, rating = ?, quote = ?, status = 'submitted',
             submitted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
        )->execute([$clientName, $rating, $quote, $row['id']]);

        $notifyEmail = Settings::get('notification_email') ?: Settings::get('social_email');
        if ($notifyEmail) {
            Mailer::send(
                $notifyEmail,
                "New testimonial submitted — {$clientName}",
                "{$clientName} just submitted a review ({$rating}/5):\n\n\"{$quote}\"\n\nApprove it in Admin → Testimonials."
            );
        }

        Response::json(['status' => 'submitted']);
    }

    /** GET /api/v1/admin/testimonials */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        Response::json(
            $pdo->query('SELECT * FROM testimonials ORDER BY requested_at DESC')->fetchAll()
        );
    }

    /** POST /api/v1/admin/testimonials — body: {client_name, client_email, project_reference?} */
    public static function request(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $clientName = trim((string) ($data['client_name'] ?? ''));
        $clientEmail = trim((string) ($data['client_email'] ?? ''));
        $projectReference = trim((string) ($data['project_reference'] ?? ''));

        if ($clientName === '' || mb_strlen($clientName) > 255) {
            Response::error('Client name is required.', 422);
        }
        if (!filter_var($clientEmail, FILTER_VALIDATE_EMAIL)) {
            Response::error('A valid client email is required.', 422);
        }

        $pdo = Database::get();
        $token = bin2hex(random_bytes(16));
        $pdo->prepare(
            'INSERT INTO testimonials (token, client_name, client_email, project_reference) VALUES (?, ?, ?, ?)'
        )->execute([$token, $clientName, $clientEmail, $projectReference ?: null]);

        $link = "https://princecaleb.dev/testimonial.html?token={$token}";

        Mailer::send(
            $clientEmail,
            'Quick favor — mind leaving a review?',
            "Hi {$clientName},\n\nThanks again for working together"
                . ($projectReference !== '' ? " on {$projectReference}" : '') . "! If you have two minutes, "
                . "I'd really appreciate a short review to share with future clients:\n\n{$link}\n\n— Prince Caleb"
        );

        Response::json(['id' => (int) $pdo->lastInsertId(), 'token' => $token], 201);
    }

    /** PATCH /api/v1/admin/testimonials/{id} — body: {status?, sort_order?} */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $id = (int) $params['id'];

        if (array_key_exists('status', $data)) {
            if (!in_array($data['status'], ['approved', 'rejected'], true)) {
                Response::error('Status must be approved or rejected.', 422);
            }

            $pdo = Database::get();
            $stmt = $pdo->prepare('SELECT * FROM testimonials WHERE id = ?');
            $stmt->execute([$id]);
            $existing = $stmt->fetch();

            $pdo->prepare("UPDATE testimonials SET status = ?, updated_at = datetime('now') WHERE id = ?")
                ->execute([$data['status'], $id]);

            if ($existing && $existing['status'] !== 'approved' && $data['status'] === 'approved') {
                MakeWebhook::send('testimonial_approved', [
                    'client_name' => $existing['client_name'],
                    'project_reference' => $existing['project_reference'],
                    'rating' => (int) $existing['rating'],
                    'quote' => $existing['quote'],
                ]);
            }
        }
        if (array_key_exists('sort_order', $data)) {
            Database::get()->prepare("UPDATE testimonials SET sort_order = ?, updated_at = datetime('now') WHERE id = ?")
                ->execute([(int) $data['sort_order'], $id]);
        }

        Response::json(['status' => 'updated']);
    }

    /** DELETE /api/v1/admin/testimonials/{id} */
    public static function destroy(array $params): void
    {
        AuthMiddleware::requireAuth();
        Database::get()->prepare('DELETE FROM testimonials WHERE id = ?')->execute([(int) $params['id']]);
        Response::json(['status' => 'deleted']);
    }

    private static function findByToken(string $token): array|false
    {
        if ($token === '') {
            return false;
        }
        $stmt = Database::get()->prepare('SELECT * FROM testimonials WHERE token = ?');
        $stmt->execute([$token]);
        return $stmt->fetch();
    }
}
