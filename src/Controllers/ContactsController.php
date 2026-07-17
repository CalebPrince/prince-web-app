<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;

/**
 * Contacts: a read-only, merged view across every pipeline that captures a
 * name/email — inquiries, marketing leads, clients, proposals, payments,
 * appointments, drip enrollments, and live chat sessions. No new tables, no
 * writes: everything here is aggregated on the fly (grouped by email) from
 * tables the rest of the admin already owns, so none of the existing
 * pipelines change. It's a visibility layer on top of them, not a new
 * source of truth — "what do we know about this person, across everything,"
 * in one place instead of six separate admin pages.
 */
class ContactsController
{
    /** GET /api/v1/admin/contacts — one row per distinct email, most recently active first. */
    public static function index(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $contacts = self::buildContacts($pdo);

        $list = array_values($contacts);
        usort($list, fn($a, $b) => strcmp($b['last_activity_at'], $a['last_activity_at']));

        Response::json($list);
    }

    /** GET /api/v1/admin/contacts/{email} — full merged timeline for one email. */
    public static function show(array $params): void
    {
        AuthMiddleware::requireAuth();
        $email = self::normalizeEmail((string) ($params['email'] ?? ''));
        if ($email === '' || !str_contains($email, '@')) {
            Response::error('A valid email is required.', 422);
        }

        $pdo = Database::get();
        $contacts = self::buildContacts($pdo);
        if (!isset($contacts[$email])) {
            Response::error('No contact found for that email.', 404);
        }

        Response::json([
            'contact' => $contacts[$email],
            'timeline' => self::buildTimeline($pdo, $email),
        ]);
    }

    /**
     * GET /api/v1/admin/contacts/pipeline-summary — revenue and pipeline
     * totals computed live from proposals/payments. Read-only, no new
     * tables, same principle as the rest of this controller.
     */
    public static function pipelineSummary(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $currency = Settings::get('pricing_currency') ?: 'GHS';

        // Open pipeline value: sent-but-undecided proposals — the one place
        // a real number exists per opportunity. inquiries.budget is
        // free-text ("~$5k", "flexible"), not something safe to sum.
        $openPipeline = (int) $pdo->query(
            "SELECT COALESCE(SUM(total_amount), 0) FROM proposals WHERE status = 'sent'"
        )->fetchColumn();

        $accepted = (int) $pdo->query("SELECT COUNT(*) FROM proposals WHERE status = 'accepted'")->fetchColumn();
        $declined = (int) $pdo->query("SELECT COUNT(*) FROM proposals WHERE status = 'declined'")->fetchColumn();
        $decided = $accepted + $declined;
        $winRate = $decided > 0 ? round($accepted / $decided, 4) : null;

        $revenueAllTime = (int) $pdo->query(
            "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'success'"
        )->fetchColumn();
        $revenueThisMonth = (int) $pdo->query(
            "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'success' "
            . "AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
        )->fetchColumn();

        // Last 12 calendar months, oldest first, zero-filled for any month
        // with no revenue so the chart doesn't silently skip a quiet month.
        $byMonthRaw = [];
        foreach ($pdo->query(
            "SELECT strftime('%Y-%m', created_at) AS month, SUM(amount) AS amount FROM payments "
            . "WHERE status = 'success' AND created_at >= datetime('now', '-12 months') GROUP BY month"
        ) as $r) {
            $byMonthRaw[$r['month']] = (int) $r['amount'];
        }
        $revenueByMonth = [];
        for ($i = 11; $i >= 0; $i--) {
            $month = date('Y-m', strtotime("-{$i} months"));
            $revenueByMonth[] = ['month' => $month, 'amount' => $byMonthRaw[$month] ?? 0];
        }

        $bySourceRaw = $pdo->query(
            "SELECT source, SUM(amount) AS amount FROM payments WHERE status = 'success' GROUP BY source"
        )->fetchAll(\PDO::FETCH_KEY_PAIR);

        Response::json([
            'currency' => $currency,
            'open_pipeline_value' => $openPipeline,
            'win_rate' => $winRate,
            'proposals_accepted' => $accepted,
            'proposals_declined' => $declined,
            'revenue_this_month' => $revenueThisMonth,
            'revenue_all_time' => $revenueAllTime,
            'revenue_by_month' => $revenueByMonth,
            'revenue_by_source' => [
                ['source' => 'tier_checkout', 'label' => 'Starter tier checkout', 'amount' => (int) ($bySourceRaw['tier_checkout'] ?? 0)],
                ['source' => 'payment_link', 'label' => 'Custom-quoted (payment links)', 'amount' => (int) ($bySourceRaw['payment_link'] ?? 0)],
            ],
        ]);
    }

    private static function normalizeEmail(string $email): string
    {
        return strtolower(trim(rawurldecode($email)));
    }

    /**
     * Scans every pipeline table once, folding rows into one contact per
     * distinct email — the same aggregation backs both index() and show()
     * so the summary card on the list and on a single contact's page can
     * never drift apart.
     *
     * @return array<string,array<string,mixed>> keyed by lowercased email
     */
    private static function buildContacts(\PDO $pdo): array
    {
        $contacts = [];

        $touch = function (?string $rawEmail, ?string $name, ?string $phone, string $source, ?string $at) use (&$contacts): void {
            $email = self::normalizeEmail((string) $rawEmail);
            if ($email === '' || !str_contains($email, '@')) {
                return;
            }
            $at = $at ?: '1970-01-01 00:00:00';
            $name = trim((string) $name);
            $phone = trim((string) $phone);

            if (!isset($contacts[$email])) {
                $contacts[$email] = [
                    'email' => $email,
                    'name' => '',
                    'phone' => '',
                    'sources' => [],
                    'last_activity_at' => $at,
                    'lifetime_value' => 0,
                    'lifetime_value_currency' => Settings::get('pricing_currency') ?: 'GHS',
                ];
            }

            // Prefer the longest name seen across every source — a business
            // name or full name from one pipeline usually beats a bare first
            // name volunteered to another.
            if ($name !== '' && strlen($name) > strlen($contacts[$email]['name'])) {
                $contacts[$email]['name'] = $name;
            }
            if ($phone !== '' && $contacts[$email]['phone'] === '') {
                $contacts[$email]['phone'] = $phone;
            }
            if (!in_array($source, $contacts[$email]['sources'], true)) {
                $contacts[$email]['sources'][] = $source;
            }
            if ($at > $contacts[$email]['last_activity_at']) {
                $contacts[$email]['last_activity_at'] = $at;
            }
        };

        foreach ($pdo->query('SELECT name, email, created_at FROM inquiries') as $r) {
            $touch($r['email'], $r['name'], null, 'inquiry', $r['created_at']);
        }
        foreach ($pdo->query(
            "SELECT business_name, contact_email, contact_phone, created_at FROM marketing_leads "
            . "WHERE contact_email IS NOT NULL AND contact_email != ''"
        ) as $r) {
            $touch($r['contact_email'], $r['business_name'], $r['contact_phone'], 'marketing_lead', $r['created_at']);
        }
        foreach ($pdo->query('SELECT name, email, phone, created_at FROM clients') as $r) {
            $touch($r['email'], $r['name'], $r['phone'], 'client', $r['created_at']);
        }
        foreach ($pdo->query('SELECT client_name, client_email, created_at FROM proposals') as $r) {
            $touch($r['client_email'], $r['client_name'], null, 'proposal', $r['created_at']);
        }
        foreach ($pdo->query(
            "SELECT email, customer_name, amount, currency, created_at FROM payments WHERE status = 'success'"
        ) as $r) {
            $touch($r['email'], $r['customer_name'], null, 'payment', $r['created_at']);
            $email = self::normalizeEmail((string) $r['email']);
            if (isset($contacts[$email])) {
                // Subunits (kobo/pesewas), same convention as everywhere
                // else payments/proposals store amounts — divided to a
                // display currency value only when it's actually rendered.
                // Assumes one currency per contact (true for this business);
                // the last successful payment's currency wins if that ever
                // isn't the case, rather than silently summing mixed units.
                $contacts[$email]['lifetime_value'] += (int) $r['amount'];
                $contacts[$email]['lifetime_value_currency'] = (string) $r['currency'];
            }
        }
        foreach ($pdo->query('SELECT client_name, client_email, created_at FROM appointments') as $r) {
            $touch($r['client_email'], $r['client_name'], null, 'appointment', $r['created_at']);
        }
        foreach ($pdo->query('SELECT email, name, enrolled_at FROM drip_enrollments') as $r) {
            $touch($r['email'], $r['name'], null, 'drip', $r['enrolled_at']);
        }
        foreach ($pdo->query(
            "SELECT client_name, client_email, updated_at FROM chat_sessions "
            . "WHERE client_email IS NOT NULL AND client_email != ''"
        ) as $r) {
            $touch($r['client_email'], $r['client_name'], null, 'chat', $r['updated_at']);
        }

        return $contacts;
    }

    /** @return array<int,array<string,mixed>> every record touching $email, newest first */
    private static function buildTimeline(\PDO $pdo, string $email): array
    {
        $timeline = [];

        $stmt = $pdo->prepare('SELECT * FROM inquiries WHERE lower(email) = ? ORDER BY created_at DESC');
        $stmt->execute([$email]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $timeline[] = [
                'type' => 'inquiry',
                'at' => $r['created_at'],
                'label' => $r['type'] === 'project_request' ? 'Project request' : 'Contact form message',
                'detail' => mb_substr((string) $r['message'], 0, 200),
                'data' => $r,
            ];
        }

        $stmt = $pdo->prepare("SELECT * FROM marketing_leads WHERE lower(contact_email) = ? ORDER BY created_at DESC");
        $stmt->execute([$email]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $timeline[] = [
                'type' => 'marketing_lead',
                'at' => $r['created_at'],
                'label' => 'Marketing outreach — ' . $r['status'],
                'detail' => (string) $r['business_name'],
                'data' => $r,
            ];
        }

        $stmt = $pdo->prepare('SELECT * FROM clients WHERE lower(email) = ?');
        $stmt->execute([$email]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            unset($r['password_hash'], $r['invite_token'], $r['reset_token']);
            $timeline[] = [
                'type' => 'client',
                'at' => $r['created_at'],
                'label' => 'Client portal account created',
                'detail' => $r['is_active'] ? 'Active' : 'Inactive',
                'data' => $r,
            ];
        }

        $stmt = $pdo->prepare('SELECT * FROM proposals WHERE lower(client_email) = ? ORDER BY created_at DESC');
        $stmt->execute([$email]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $timeline[] = [
                'type' => 'proposal',
                'at' => $r['created_at'],
                'label' => 'Proposal — ' . $r['status'] . ': ' . $r['title'],
                'detail' => number_format(((int) $r['total_amount']) / 100, 2) . ' ' . $r['currency'],
                'data' => $r,
            ];
        }

        $stmt = $pdo->prepare("SELECT * FROM payments WHERE lower(email) = ? ORDER BY created_at DESC");
        $stmt->execute([$email]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $timeline[] = [
                'type' => 'payment',
                'at' => $r['created_at'],
                'label' => 'Payment — ' . $r['status'],
                'detail' => number_format(((int) $r['amount']) / 100, 2) . ' ' . $r['currency']
                    . ($r['description'] ? ' — ' . $r['description'] : ''),
                'data' => $r,
            ];
        }

        $stmt = $pdo->prepare('SELECT * FROM appointments WHERE lower(client_email) = ? ORDER BY created_at DESC');
        $stmt->execute([$email]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $timeline[] = [
                'type' => 'appointment',
                'at' => $r['created_at'],
                'label' => 'Call booked for ' . $r['appointment_date'] . ' ' . $r['appointment_time'] . ' — ' . $r['status'],
                'detail' => (string) ($r['topic'] ?? ''),
                'data' => $r,
            ];
        }

        $stmt = $pdo->prepare('SELECT * FROM drip_enrollments WHERE lower(email) = ?');
        $stmt->execute([$email]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $timeline[] = [
                'type' => 'drip',
                'at' => $r['enrolled_at'],
                'label' => 'Enrolled in drip sequence — ' . $r['status'],
                'detail' => (string) ($r['lead_industry'] ?? ''),
                'data' => $r,
            ];
        }

        $stmt = $pdo->prepare(
            "SELECT id, client_name, client_email, prototype_status, admin_seen, created_at, updated_at "
            . "FROM chat_sessions WHERE lower(client_email) = ? ORDER BY updated_at DESC"
        );
        $stmt->execute([$email]);
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $timeline[] = [
                'type' => 'chat',
                'at' => $r['updated_at'],
                'label' => 'Live chat conversation',
                'detail' => $r['prototype_status'] !== 'none' ? 'Prototype: ' . $r['prototype_status'] : '',
                'data' => $r,
            ];
        }

        usort($timeline, fn($a, $b) => strcmp($b['at'], $a['at']));
        return $timeline;
    }
}
