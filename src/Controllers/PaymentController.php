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

        // Subscription lifecycle events (and recurring charge.success, whose
        // references are Paystack-minted and unknown to verifyAndRecord).
        SubscriptionController::handleWebhookEvent($event);

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
            InvoiceController::settleByPaymentLink($pdo, (int) $payment['payment_link_id']);
        }

        if ($verifiedSuccess) {
            self::sendOnboardingEmail($payment);
            // Same genuine pending -> success transition the onboarding email
            // rides on (guarded upstream), so a paid client is enrolled exactly
            // once into any active payment_received automation.
            Automations::fire('payment_received', (string) ($payment['email'] ?? ''), [
                'name' => trim((string) ($payment['customer_name'] ?? '')) ?: null,
                'last_action' => 'Completed a payment',
            ], $pdo);
        }

        return $newStatus;
    }

    /**
     * Fires once per payment — this is only ever reached on the genuine
     * pending -> success transition, since the early-return idempotency
     * guard above short-circuits every later verify/webhook call for the
     * same reference.
     */
    private static function sendOnboardingEmail(array $payment): void
    {
        $email = trim((string) ($payment['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return;
        }

        $name = trim((string) ($payment['customer_name'] ?? '')) ?: 'there';
        $description = $payment['description'] ?: 'your project';
        $amount = number_format(((int) $payment['amount']) / 100, 2);
        $currency = $payment['currency'] ?: 'GHS';
        $bookingUrl = self::absoluteUrl('/book.html');

        $message = EmailTemplate::render('payment_success', [
            'name' => $name,
            'description' => $description,
            'amount' => $amount,
            'currency' => $currency,
            'booking_url' => $bookingUrl,
            'reference' => $payment['reference'] ?? '',
        ], EmailTemplate::defaults()['payment_success']);

        Mailer::sendHtml($email, $message['subject'], $message['html'], $message['text']);
        return;

        $body = "Hi {$name},\n\n"
            . "Thanks for your payment of {$currency} {$amount} for {$description} — it's been received and confirmed.\n\n"
            . "Here's what happens next:\n"
            . "1. I'll review the details and reach out within 1 business day to confirm scope and timeline.\n"
            . "2. If we haven't already, let's book a kickoff call to align on requirements: {$bookingUrl}\n"
            . "3. In the meantime, it helps to have ready: any brand assets (logo, colors), example sites/apps you like, and a short list of must-have features.\n\n"
            . "I'll keep you updated at each milestone. If you have questions in the meantime, just reply to this email.\n\n"
            . "Looking forward to working with you,\nPrince Caleb";

        Mailer::send($email, 'Payment received — next steps for ' . $description, $body);
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
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('DELETE FROM payments WHERE reference = ?');
        $stmt->execute([$params['reference']]);
        ActivityLog::log($user, 'deleted', 'payment', $params['reference'] ?? null);
        Response::json(['status' => 'deleted']);
    }

    /** PATCH /api/v1/admin/payments/{reference} — body: {reviewed?, notes?} */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $reference = $params['reference'] ?? '';
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT id FROM payments WHERE reference = ?');
        $stmt->execute([$reference]);
        if (!$stmt->fetch()) {
            Response::error('Payment not found.', 404);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $fields = [];
        $values = [];
        if (array_key_exists('reviewed', $data)) {
            $fields[] = 'reviewed = ?';
            $values[] = !empty($data['reviewed']) ? 1 : 0;
        }
        if (array_key_exists('notes', $data)) {
            $fields[] = 'notes = ?';
            $values[] = trim((string) $data['notes']) !== '' ? trim((string) $data['notes']) : null;
        }
        if (!$fields) {
            Response::error('Nothing to update.', 422);
        }

        $values[] = $reference;
        $pdo->prepare('UPDATE payments SET ' . implode(', ', $fields) . ", updated_at = datetime('now') WHERE reference = ?")
            ->execute($values);

        Response::json(['status' => 'updated']);
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
        $user = AuthMiddleware::requireAuth();
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

        ActivityLog::log($user, 'created', 'payment_link', $token, $clientName, [
            'amount' => $amount,
            'currency' => $currency,
            'description' => $description,
        ]);

        Response::json(['token' => $token, 'url' => '/pay.html?token=' . $token], 201);
    }
}
