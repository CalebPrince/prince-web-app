<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Middleware\RateLimitMiddleware;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;

/**
 * Paystack integration. Amounts are always stored and sent to Paystack in
 * the smallest currency unit (pesewas/kobo/cents) as integers — never
 * floats — to avoid rounding drift. The client only ever handles the public
 * key; every charge is confirmed server-side against Paystack's API before
 * a payment is marked successful, both via the verify endpoint and the
 * webhook, since neither the client-side popup result nor a lone webhook
 * call should be trusted in isolation.
 */
class PaymentController
{
    private const API_BASE = 'https://api.paystack.co';
    private const TOS_VERSION = '2026-07-07';

    /** GET /api/v1/payments/config — public: what the checkout UI needs to render */
    public static function config(): void
    {
        $publicKey = Settings::get('paystack_public_key');
        $currency = Settings::get('pricing_currency') ?: 'GHS';
        $tier1Amount = Settings::get('pricing_tier_1_amount');

        Response::json([
            'public_key' => $publicKey ?: null,
            'currency' => $currency,
            'tier_1_amount' => $tier1Amount !== null && $tier1Amount !== '' ? (float) $tier1Amount : null,
        ]);
    }

    /** GET /api/v1/payments/link/{token} — public: details for the /pay.html page */
    public static function showLink(array $params): void
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT token, client_name, client_email, amount, currency, description, status FROM payment_links WHERE token = ?');
        $stmt->execute([$params['token']]);
        $link = $stmt->fetch();

        if (!$link) {
            Response::error('Payment link not found.', 404);
        }

        Response::json($link);
    }

    /** POST /api/v1/payments/prepare — public, rate-limited. Body: {tier,name,email,tos_accepted} or {link_token} */
    public static function prepare(): void
    {
        require_once dirname(__DIR__, 2) . '/config/config.php';
        RateLimitMiddleware::enforce('payment_prepare', appConfig()['contact_rate_limit'] * 4);

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $pdo = Database::get();

        if (!empty($data['link_token'])) {
            $stmt = $pdo->prepare("SELECT * FROM payment_links WHERE token = ? AND status = 'pending'");
            $stmt->execute([$data['link_token']]);
            $link = $stmt->fetch();
            if (!$link) {
                Response::error('This payment link is invalid or already used.', 404);
            }

            $reference = self::createPaymentRow($pdo, [
                'email' => $link['client_email'],
                'customer_name' => $link['client_name'],
                'amount' => (int) $link['amount'],
                'currency' => $link['currency'],
                'description' => $link['description'],
                'source' => 'payment_link',
                'payment_link_id' => (int) $link['id'],
                'tos_accepted' => null,
                'tos_accepted_at' => null,
                'tos_version' => null,
            ]);

            Response::json([
                'reference' => $reference,
                'amount' => (int) $link['amount'],
                'currency' => $link['currency'],
                'email' => $link['client_email'],
                'description' => $link['description'],
            ]);
            return;
        }

        if (($data['tier'] ?? '') === 'starter') {
            $email = trim((string) ($data['email'] ?? ''));
            $name = trim((string) ($data['name'] ?? ''));
            $tosAccepted = !empty($data['tos_accepted']);
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                Response::error('A valid email address is required.', 422);
            }
            if (!$tosAccepted) {
                Response::error('You must accept the Terms of Service to continue.', 422);
            }

            $amountSetting = Settings::get('pricing_tier_1_amount');
            if ($amountSetting === null || $amountSetting === '' || (float) $amountSetting <= 0) {
                Response::error('Checkout is not configured for this tier yet.', 422);
            }
            $currency = Settings::get('pricing_currency') ?: 'GHS';
            $amountSubunits = (int) round(((float) $amountSetting) * 100);

            $reference = self::createPaymentRow($pdo, [
                'email' => $email,
                'customer_name' => $name ?: null,
                'amount' => $amountSubunits,
                'currency' => $currency,
                'description' => 'Starter tier — project deposit',
                'source' => 'tier_checkout',
                'payment_link_id' => null,
                'tos_accepted' => 1,
                'tos_accepted_at' => gmdate('Y-m-d H:i:s'),
                'tos_version' => self::TOS_VERSION,
            ]);

            Response::json([
                'reference' => $reference,
                'amount' => $amountSubunits,
                'currency' => $currency,
                'email' => $email,
                'description' => 'Starter tier — project deposit',
            ]);
            return;
        }

        Response::error('Nothing to charge for.', 422);
    }

    /** POST /api/v1/payments/verify — public. Body: {reference} */
    public static function verify(): void
    {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $reference = trim((string) ($data['reference'] ?? ''));
        if ($reference === '') {
            Response::error('Missing reference.', 422);
        }

        $result = self::verifyAndRecord($reference);
        if ($result === null) {
            Response::error('Could not verify this payment.', 502);
        }

        Response::json(['status' => $result]);
    }

    /** POST /api/v1/payments/webhook — Paystack server-to-server event */
    public static function webhook(): void
    {
        $secretKey = Settings::get('paystack_secret_key');
        $rawBody = file_get_contents('php://input');
        $signature = $_SERVER['HTTP_X_PAYSTACK_SIGNATURE'] ?? '';

        if (!$secretKey || !$signature || !hash_equals(hash_hmac('sha512', $rawBody, $secretKey), $signature)) {
            Response::error('Invalid signature.', 401);
        }

        $event = json_decode($rawBody, true) ?? [];
        if (($event['event'] ?? '') === 'charge.success') {
            $reference = $event['data']['reference'] ?? '';
            if ($reference !== '') {
                self::verifyAndRecord($reference);
            }
        }

        Response::json(['status' => 'ok']);
    }

    /** @return string|null 'success'|'failed', or null on a Paystack API/network failure */
    private static function verifyAndRecord(string $reference): ?string
    {
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM payments WHERE reference = ?');
        $stmt->execute([$reference]);
        $payment = $stmt->fetch();
        if (!$payment) {
            return null;
        }
        if ($payment['status'] === 'success') {
            return 'success'; // already confirmed (e.g. webhook beat the client-side verify call)
        }

        $secretKey = Settings::get('paystack_secret_key');
        if (!$secretKey) {
            return null;
        }

        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Authorization: Bearer {$secretKey}\r\nAccept: application/json\r\n",
                'timeout' => 15,
                'ignore_errors' => true,
            ],
        ]);
        $response = @file_get_contents(self::API_BASE . '/transaction/verify/' . rawurlencode($reference), false, $context);
        $responseHeaders = function_exists('http_get_last_response_headers')
            ? (http_get_last_response_headers() ?? [])
            : ($http_response_header ?? []);
        $httpStatus = 0;
        foreach ($responseHeaders as $header) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $header, $m)) {
                $httpStatus = (int) $m[1];
            }
        }

        if ($response === false || $httpStatus !== 200) {
            return null;
        }

        $body = json_decode($response, true);
        $txn = $body['data'] ?? null;
        if (!$txn) {
            return null;
        }

        // Never trust the amount the client displayed — only what Paystack confirms was charged.
        $verifiedSuccess = ($txn['status'] ?? '') === 'success' && (int) $txn['amount'] === (int) $payment['amount'];
        $newStatus = $verifiedSuccess ? 'success' : 'failed';

        $pdo->prepare("UPDATE payments SET status = ?, updated_at = datetime('now') WHERE id = ?")
            ->execute([$newStatus, $payment['id']]);

        if ($verifiedSuccess && $payment['payment_link_id']) {
            $pdo->prepare("UPDATE payment_links SET status = 'paid', paid_at = datetime('now') WHERE id = ? AND status != 'paid'")
                ->execute([$payment['payment_link_id']]);
        }

        return $newStatus;
    }

    private static function createPaymentRow(\PDO $pdo, array $fields): string
    {
        $reference = 'PSK_' . bin2hex(random_bytes(12));
        $pdo->prepare(
            'INSERT INTO payments (reference, email, customer_name, amount, currency, description, source, payment_link_id, tos_accepted, tos_accepted_at, tos_version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $reference,
            $fields['email'],
            $fields['customer_name'],
            $fields['amount'],
            $fields['currency'],
            $fields['description'],
            $fields['source'],
            $fields['payment_link_id'],
            $fields['tos_accepted'] ?? null,
            $fields['tos_accepted_at'] ?? null,
            $fields['tos_version'] ?? null,
        ]);

        return $reference;
    }

    /** GET /api/v1/admin/payments */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query('SELECT * FROM payments ORDER BY created_at DESC')->fetchAll();
        Response::json($rows);
    }

    /** DELETE /api/v1/admin/payments/{reference} */
    public static function destroy(array $params): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('DELETE FROM payments WHERE reference = ?');
        $stmt->execute([$params['reference']]);
        Response::json(['status' => 'deleted']);
    }

    /** GET /api/v1/admin/payment-links */
    public static function adminIndexLinks(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query('SELECT * FROM payment_links ORDER BY created_at DESC')->fetchAll();
        Response::json($rows);
    }

    /** POST /api/v1/admin/payment-links — body: {client_name, client_email, amount, currency, description} */
    public static function createLink(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $clientName = trim((string) ($data['client_name'] ?? ''));
        $clientEmail = trim((string) ($data['client_email'] ?? ''));
        $amount = (float) ($data['amount'] ?? 0);
        $description = trim((string) ($data['description'] ?? ''));
        $currency = trim((string) ($data['currency'] ?? '')) ?: (Settings::get('pricing_currency') ?: 'GHS');

        $errors = [];
        if ($clientName === '') $errors[] = 'Client name is required.';
        if (!filter_var($clientEmail, FILTER_VALIDATE_EMAIL)) $errors[] = 'A valid client email is required.';
        if ($amount <= 0) $errors[] = 'Amount must be greater than zero.';
        if ($description === '') $errors[] = 'Description is required.';
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $token = bin2hex(random_bytes(12));
        $pdo = Database::get();
        $pdo->prepare(
            'INSERT INTO payment_links (token, client_name, client_email, amount, currency, description)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$token, $clientName, $clientEmail, (int) round($amount * 100), $currency, $description]);

        Response::json(['token' => $token, 'url' => '/pay.html?token=' . $token], 201);
    }
}
