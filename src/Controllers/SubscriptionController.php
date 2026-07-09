<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\Database;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Settings;

/**
 * Recurring billing (maintenance retainers etc.) on Paystack subscription
 * plans. Creating a subscription here only creates the Paystack plan and a
 * checkout link — the subscription becomes real when the client authorizes
 * that checkout, which Paystack reports back through the same webhook
 * endpoint the one-off payments use (see handleWebhookEvent). Recurring
 * charge references are minted by Paystack, so they're recorded in
 * subscription_charges rather than the payments table.
 */
class SubscriptionController
{
    private const API_BASE = 'https://api.paystack.co';

    private const INTERVAL_MODIFIER = [
        'monthly' => '+1 month',
        'quarterly' => '+3 months',
        'biannually' => '+6 months',
        'annually' => '+1 year',
    ];

    /** GET /api/v1/admin/subscriptions */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query(
            'SELECT s.*, COUNT(sc.id) AS charge_count, COALESCE(SUM(sc.amount), 0) AS charged_total
             FROM subscriptions s
             LEFT JOIN subscription_charges sc ON sc.subscription_id = s.id
             GROUP BY s.id
             ORDER BY s.created_at DESC'
        )->fetchAll();
        Response::json($rows);
    }

    /** POST /api/v1/admin/subscriptions — body: {client_name, client_email, plan_name, amount, currency?, billing_interval} */
    public static function store(): void
    {
        $user = AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $clientName = trim((string) ($data['client_name'] ?? ''));
        $clientEmail = trim((string) ($data['client_email'] ?? ''));
        $planName = trim((string) ($data['plan_name'] ?? ''));
        $amount = (float) ($data['amount'] ?? 0);
        $currency = trim((string) ($data['currency'] ?? '')) ?: (Settings::get('pricing_currency') ?: 'GHS');
        $interval = (string) ($data['billing_interval'] ?? 'monthly');

        $errors = [];
        if ($clientName === '') $errors[] = 'Client name is required.';
        if (!filter_var($clientEmail, FILTER_VALIDATE_EMAIL)) $errors[] = 'A valid client email is required.';
        if ($planName === '') $errors[] = 'Plan name is required.';
        if ($amount <= 0) $errors[] = 'Amount must be greater than zero.';
        if (!isset(self::INTERVAL_MODIFIER[$interval])) $errors[] = 'Invalid billing interval.';
        if ($errors) {
            Response::json(['errors' => $errors], 422);
        }

        $secretKey = Settings::get('paystack_secret_key');
        if (!$secretKey) {
            Response::error('Paystack is not configured yet (missing secret key in Settings).', 422);
        }

        $amountSubunits = (int) round($amount * 100);

        $plan = self::paystackPost($secretKey, '/plan', [
            'name' => "{$planName} — {$clientName}",
            'amount' => $amountSubunits,
            'interval' => $interval,
            'currency' => $currency,
        ]);
        if (!$plan || empty($plan['plan_code'])) {
            Response::error('Paystack rejected the plan. Check the currency and amount.', 502);
        }

        $checkout = self::paystackPost($secretKey, '/transaction/initialize', [
            'email' => $clientEmail,
            'amount' => $amountSubunits,
            'currency' => $currency,
            'plan' => $plan['plan_code'],
        ]);
        if (!$checkout || empty($checkout['authorization_url'])) {
            Response::error('Paystack did not return a checkout link for the plan.', 502);
        }

        $pdo = Database::get();
        $pdo->prepare(
            'INSERT INTO subscriptions (client_id, client_name, client_email, plan_name, amount, currency, billing_interval, paystack_plan_code, checkout_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            !empty($data['client_id']) ? (int) $data['client_id'] : null,
            $clientName,
            $clientEmail,
            $planName,
            $amountSubunits,
            $currency,
            $interval,
            $plan['plan_code'],
            $checkout['authorization_url'],
        ]);

        ActivityLog::log($user, 'created', 'subscription', (string) $pdo->lastInsertId(), "{$planName} — {$clientName}", [
            'amount' => $amount,
            'currency' => $currency,
            'interval' => $interval,
        ]);

        Response::json(['status' => 'created', 'checkout_url' => $checkout['authorization_url']], 201);
    }

    /** POST /api/v1/admin/subscriptions/{id}/cancel */
    public static function cancel(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM subscriptions WHERE id = ?');
        $stmt->execute([(int) $params['id']]);
        $subscription = $stmt->fetch();
        if (!$subscription) {
            Response::error('Subscription not found.', 404);
        }

        // Active on Paystack's side — disable it there first; a pending one
        // (client never checked out) only exists locally.
        if ($subscription['paystack_subscription_code']) {
            $secretKey = Settings::get('paystack_secret_key');
            $result = self::paystackPost($secretKey ?: '', '/subscription/disable', [
                'code' => $subscription['paystack_subscription_code'],
                'token' => $subscription['paystack_email_token'],
            ], $rawOk);
            if (!$rawOk) {
                Response::error('Paystack could not cancel this subscription — try again or cancel it from the Paystack dashboard.', 502);
            }
        }

        $pdo->prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?")
            ->execute([$subscription['id']]);

        ActivityLog::log($user, 'cancelled', 'subscription', (string) $subscription['id'], $subscription['plan_name']);
        Response::json(['status' => 'cancelled']);
    }

    /** DELETE /api/v1/admin/subscriptions/{id} — pending/cancelled only */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT * FROM subscriptions WHERE id = ?');
        $stmt->execute([(int) $params['id']]);
        $subscription = $stmt->fetch();
        if (!$subscription) {
            Response::error('Subscription not found.', 404);
        }
        if (in_array($subscription['status'], ['active', 'past_due'], true)) {
            Response::error('Cancel the subscription before deleting it.', 422);
        }

        $pdo->prepare('DELETE FROM subscriptions WHERE id = ?')->execute([$subscription['id']]);
        ActivityLog::log($user, 'deleted', 'subscription', (string) $subscription['id'], $subscription['plan_name']);
        Response::json(['status' => 'deleted']);
    }

    /**
     * Called from PaymentController::webhook for every verified Paystack
     * event. Matches subscription lifecycle events back to local rows by
     * plan code / subscription code. Unknown events are ignored.
     */
    public static function handleWebhookEvent(array $event): void
    {
        $pdo = Database::get();
        $type = $event['event'] ?? '';
        $data = $event['data'] ?? [];

        if ($type === 'subscription.create') {
            $planCode = $data['plan']['plan_code'] ?? '';
            if ($planCode === '') {
                return;
            }
            $pdo->prepare(
                "UPDATE subscriptions
                 SET paystack_subscription_code = ?, paystack_email_token = ?, status = 'active',
                     next_payment_at = ?, updated_at = datetime('now')
                 WHERE paystack_plan_code = ? AND status IN ('pending', 'past_due')"
            )->execute([
                $data['subscription_code'] ?? null,
                $data['email_token'] ?? null,
                isset($data['next_payment_date']) ? gmdate('Y-m-d H:i:s', strtotime($data['next_payment_date'])) : null,
                $planCode,
            ]);
            return;
        }

        if ($type === 'subscription.disable' || $type === 'subscription.not_renew') {
            $code = $data['subscription_code'] ?? '';
            if ($code !== '') {
                $pdo->prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE paystack_subscription_code = ?")
                    ->execute([$code]);
            }
            return;
        }

        if ($type === 'invoice.payment_failed') {
            $code = $data['subscription']['subscription_code'] ?? '';
            if ($code !== '') {
                $pdo->prepare("UPDATE subscriptions SET status = 'past_due', updated_at = datetime('now') WHERE paystack_subscription_code = ? AND status = 'active'")
                    ->execute([$code]);
            }
            return;
        }

        if ($type === 'charge.success') {
            $planCode = $data['plan']['plan_code'] ?? '';
            $reference = $data['reference'] ?? '';
            if ($planCode === '' || $reference === '') {
                return; // one-off charge — handled by verifyAndRecord
            }
            $stmt = $pdo->prepare('SELECT * FROM subscriptions WHERE paystack_plan_code = ?');
            $stmt->execute([$planCode]);
            $subscription = $stmt->fetch();
            if (!$subscription) {
                return;
            }

            // INSERT OR IGNORE: Paystack retries webhooks, reference is unique.
            $inserted = $pdo->prepare(
                'INSERT OR IGNORE INTO subscription_charges (subscription_id, reference, amount, currency) VALUES (?, ?, ?, ?)'
            );
            $inserted->execute([
                $subscription['id'],
                $reference,
                (int) ($data['amount'] ?? $subscription['amount']),
                $data['currency'] ?? $subscription['currency'],
            ]);
            if ($inserted->rowCount() === 0) {
                return; // duplicate webhook delivery
            }

            $modifier = self::INTERVAL_MODIFIER[$subscription['billing_interval']] ?? '+1 month';
            $pdo->prepare(
                "UPDATE subscriptions SET status = 'active', next_payment_at = datetime('now', ?), updated_at = datetime('now') WHERE id = ?"
            )->execute([$modifier, $subscription['id']]);

            $amount = number_format(((int) ($data['amount'] ?? $subscription['amount'])) / 100, 2);
            $currency = $data['currency'] ?? $subscription['currency'];
            Mailer::send(
                $subscription['client_email'],
                "Receipt: {$subscription['plan_name']} — {$currency} {$amount}",
                "Hi {$subscription['client_name']},\n\n"
                    . "Your recurring payment of {$currency} {$amount} for \"{$subscription['plan_name']}\" was processed successfully.\n"
                    . "Reference: {$reference}\n\n"
                    . "No action is needed — this email is your receipt. If anything looks wrong, just reply.\n\n— Prince Caleb"
            );
        }
    }

    /**
     * POST to Paystack; returns the response's `data` array or null.
     * $ok reports transport-level success separately so callers can tell
     * "Paystack said no" from "we couldn't reach Paystack".
     */
    private static function paystackPost(string $secretKey, string $path, array $payload, ?bool &$ok = null): ?array
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Authorization: Bearer {$secretKey}\r\nContent-Type: application/json\r\nAccept: application/json\r\n",
                'content' => json_encode($payload),
                'timeout' => 20,
                'ignore_errors' => true,
            ],
        ]);
        $response = @file_get_contents(self::API_BASE . $path, false, $context);
        if ($response === false) {
            $ok = false;
            return null;
        }

        $body = json_decode($response, true);
        $ok = !empty($body['status']);
        return $ok && isset($body['data']) && is_array($body['data']) ? $body['data'] : null;
    }
}
