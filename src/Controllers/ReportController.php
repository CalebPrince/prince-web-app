<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;

/**
 * Business reporting — revenue, sales pipeline, email-automation performance,
 * bookings, lead sources, and top clients — all computed live from the
 * existing tables. Distinct from AnalyticsController (web traffic / page
 * views); this is money and pipeline. Read-only, one round trip: the whole
 * dashboard is assembled by summary() so the page makes a single request.
 *
 * Money amounts are stored in subunits (Paystack pesewas/kobo) throughout, so
 * every total here is a subunit integer and the frontend divides by 100 — the
 * same convention as the dashboard and contacts pages.
 */
class ReportController
{
    /** Labels for proposals.service_category — keep in sync with ProposalController::SERVICE_CATEGORIES. */
    private const SERVICE_LABELS = [
        'website' => 'Websites',
        'mobile_app' => 'Mobile apps',
        'brand_system' => 'Brand systems',
        'strategy' => 'Strategy',
        'other' => 'Other',
        'uncategorized' => 'Uncategorized',
    ];

    // Flat placeholders: no cost/expense or hours/time-tracking data exists
    // anywhere in the schema, so margin and utilization can't be computed for
    // real yet. See estimates().
    private const ESTIMATED_MARGIN_PCT = 0.60;
    private const ESTIMATED_UTILIZATION_PCT = 0.75;

    /** GET /api/v1/admin/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD */
    public static function summary(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $currency = Settings::get('pricing_currency') ?: 'GHS';
        [$from, $to, $prevFrom, $prevTo] = self::resolvePeriod();
        $revenue = self::revenue($pdo);

        Response::json([
            'currency' => $currency,
            'revenue' => $revenue,
            'pipeline' => self::pipeline($pdo),
            'automations' => self::automations($pdo),
            'bookings' => self::bookings($pdo),
            'lead_sources' => self::leadSources($pdo),
            'top_clients' => self::topClients($pdo),
            'period' => self::periodMetrics($pdo, $from, $to, $prevFrom, $prevTo),
            'estimates' => self::estimates(),
            'six_month_view' => self::sixMonthView($revenue['by_month']),
        ]);
    }

    /**
     * Reads ?from=&to= (YYYY-MM-DD, inclusive); defaults to month-to-date so
     * the period cards read the same as a plain "vs last month" view when no
     * range is picked. Also computes the immediately-preceding period of the
     * same length, for the trend comparison.
     *
     * @return array{0:string,1:string,2:string,3:string} from, to, prev_from, prev_to
     */
    private static function resolvePeriod(): array
    {
        $isDate = static fn($v): bool => is_string($v) && (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $v);
        $from = $_GET['from'] ?? null;
        $to = $_GET['to'] ?? null;
        if (!$isDate($from) || !$isDate($to)) {
            $from = date('Y-m-01');
            $to = date('Y-m-d');
        }
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }

        $days = (int) ((strtotime($to) - strtotime($from)) / 86400) + 1;
        $prevTo = date('Y-m-d', strtotime($from . ' -1 day'));
        $prevFrom = date('Y-m-d', strtotime($prevTo . ' -' . ($days - 1) . ' days'));

        return [$from, $to, $prevFrom, $prevTo];
    }

    private static function changePct(float $now, float $prev): ?float
    {
        if ($prev <= 0) {
            return null;
        }
        return round((($now - $prev) / $prev) * 100, 1);
    }

    /**
     * Revenue, average accepted-deal size, and revenue-by-service-category
     * for the selected date range, each compared against the immediately
     * preceding period of the same length.
     *
     * @return array<string,mixed>
     */
    private static function periodMetrics(\PDO $pdo, string $from, string $to, string $prevFrom, string $prevTo): array
    {
        $revenueStmt = $pdo->prepare(
            "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'success' AND date(created_at) BETWEEN ? AND ?"
        );
        $revenueStmt->execute([$from, $to]);
        $revenueNow = (int) $revenueStmt->fetchColumn();
        $revenueStmt->execute([$prevFrom, $prevTo]);
        $revenuePrev = (int) $revenueStmt->fetchColumn();

        $avgStmt = $pdo->prepare(
            "SELECT COUNT(*), COALESCE(AVG(total_amount), 0) FROM proposals WHERE status = 'accepted' AND date(accepted_at) BETWEEN ? AND ?"
        );
        $avgStmt->execute([$from, $to]);
        [$countNow, $avgNow] = $avgStmt->fetch(\PDO::FETCH_NUM);
        $avgStmt->execute([$prevFrom, $prevTo]);
        [$countPrev, $avgPrev] = $avgStmt->fetch(\PDO::FETCH_NUM);

        // Service mix: join back through proposal_milestones -> proposals so
        // a payment inherits the category of the proposal it was paid
        // against. Tier-checkout payments (no payment_link_id) and payment
        // links created outside a proposal have nothing to join to, and land
        // in 'uncategorized' rather than being silently dropped.
        $mixStmt = $pdo->prepare(
            "SELECT COALESCE(pr.service_category, 'uncategorized') AS category, SUM(pay.amount) AS amount
             FROM payments pay
             LEFT JOIN proposal_milestones pm ON pm.payment_link_id = pay.payment_link_id
             LEFT JOIN proposals pr ON pr.id = pm.proposal_id
             WHERE pay.status = 'success' AND date(pay.created_at) BETWEEN ? AND ?
             GROUP BY category
             ORDER BY amount DESC"
        );
        $mixStmt->execute([$from, $to]);
        $mix = array_map(static fn(array $r): array => [
            'category' => $r['category'],
            'label' => self::SERVICE_LABELS[$r['category']] ?? ucfirst(str_replace('_', ' ', (string) $r['category'])),
            'amount' => (int) $r['amount'],
        ], $mixStmt->fetchAll(\PDO::FETCH_ASSOC));

        return [
            'from' => $from,
            'to' => $to,
            'prev_from' => $prevFrom,
            'prev_to' => $prevTo,
            'revenue' => $revenueNow,
            'revenue_prev' => $revenuePrev,
            'revenue_change_pct' => self::changePct((float) $revenueNow, (float) $revenuePrev),
            'avg_project' => $countNow > 0 ? (int) round((float) $avgNow) : null,
            'avg_project_prev' => $countPrev > 0 ? (int) round((float) $avgPrev) : null,
            'avg_project_change_pct' => ($countNow > 0 && $countPrev > 0)
                ? self::changePct((float) $avgNow, (float) $avgPrev)
                : null,
            'revenue_mix' => $mix,
        ];
    }

    /**
     * Gross margin and utilization have no real data source yet — there's no
     * cost/expense tracking and no hours/time-tracking anywhere in the
     * schema. These are flat placeholders, explicitly flagged with
     * is_estimate so the frontend can badge them rather than presenting them
     * as computed figures. Replace with real queries once cost and hours
     * data exist.
     */
    private static function estimates(): array
    {
        return [
            'gross_margin_pct' => round(self::ESTIMATED_MARGIN_PCT * 100, 1),
            'utilization_pct' => round(self::ESTIMATED_UTILIZATION_PCT * 100, 1),
            'is_estimate' => true,
            'note' => 'No cost or time-tracking data exists yet in this app — these are placeholder estimates, not computed figures.',
        ];
    }

    /**
     * Last 6 calendar months of real revenue, plus an estimated margin line
     * (flat % of revenue — see estimates()).
     *
     * @param list<array{month:string,amount:int}> $byMonth last 12 months, oldest first (from revenue())
     * @return list<array<string,mixed>>
     */
    private static function sixMonthView(array $byMonth): array
    {
        $lastSix = array_slice($byMonth, -6);
        return array_map(static fn(array $m): array => [
            'month' => $m['month'],
            'revenue' => $m['amount'],
            'margin_est' => (int) round($m['amount'] * self::ESTIMATED_MARGIN_PCT),
        ], $lastSix);
    }

    /** @return array<string,mixed> */
    private static function revenue(\PDO $pdo): array
    {
        $allTime = (int) $pdo->query("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'success'")->fetchColumn();
        $thisMonth = (int) $pdo->query(
            "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'success' "
            . "AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
        )->fetchColumn();
        $last30 = (int) $pdo->query(
            "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'success' "
            . "AND created_at >= datetime('now', '-30 days')"
        )->fetchColumn();

        // Last 12 calendar months, oldest first, zero-filled so a quiet month
        // still shows on the chart instead of being silently dropped.
        $byMonthRaw = [];
        foreach ($pdo->query(
            "SELECT strftime('%Y-%m', created_at) AS month, SUM(amount) AS amount FROM payments "
            . "WHERE status = 'success' AND created_at >= datetime('now', '-12 months') GROUP BY month"
        ) as $r) {
            $byMonthRaw[$r['month']] = (int) $r['amount'];
        }
        $byMonth = [];
        for ($i = 11; $i >= 0; $i--) {
            $month = date('Y-m', strtotime("-{$i} months"));
            $byMonth[] = ['month' => $month, 'amount' => $byMonthRaw[$month] ?? 0];
        }

        $bySourceRaw = $pdo->query(
            "SELECT source, SUM(amount) AS amount FROM payments WHERE status = 'success' GROUP BY source"
        )->fetchAll(\PDO::FETCH_KEY_PAIR);

        // Grouped by currency too — payment links can be issued in a currency
        // other than the site default, so a single summed total would be a lie.
        $byCurrency = $pdo->query(
            "SELECT currency, COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'success' GROUP BY currency"
        )->fetchAll(\PDO::FETCH_ASSOC);

        return [
            'all_time' => $allTime,
            'this_month' => $thisMonth,
            'last_30_days' => $last30,
            'by_month' => $byMonth,
            'by_source' => [
                ['label' => 'Starter tier checkout', 'amount' => (int) ($bySourceRaw['tier_checkout'] ?? 0)],
                ['label' => 'Custom-quoted (payment links)', 'amount' => (int) ($bySourceRaw['payment_link'] ?? 0)],
            ],
            'by_currency' => array_map(
                static fn(array $r): array => ['currency' => $r['currency'], 'total' => (int) $r['total']],
                $byCurrency
            ),
        ];
    }

    /** @return array<string,mixed> */
    private static function pipeline(\PDO $pdo): array
    {
        // Inquiry pipeline stages (new -> reviewing -> proposal_sent -> won/lost).
        $stageRaw = $pdo->query('SELECT pipeline_stage, COUNT(*) AS c FROM inquiries GROUP BY pipeline_stage')
            ->fetchAll(\PDO::FETCH_KEY_PAIR);
        $stages = [];
        foreach (['new', 'reviewing', 'proposal_sent', 'won', 'lost'] as $stage) {
            $stages[] = ['stage' => $stage, 'count' => (int) ($stageRaw[$stage] ?? 0)];
        }

        $inquiriesTotal = (int) $pdo->query('SELECT COUNT(*) FROM inquiries')->fetchColumn();
        $proposalsSent = (int) $pdo->query("SELECT COUNT(*) FROM proposals WHERE status = 'sent'")->fetchColumn();
        $accepted = (int) $pdo->query("SELECT COUNT(*) FROM proposals WHERE status = 'accepted'")->fetchColumn();
        $declined = (int) $pdo->query("SELECT COUNT(*) FROM proposals WHERE status = 'declined'")->fetchColumn();
        $proposalsTotal = (int) $pdo->query('SELECT COUNT(*) FROM proposals')->fetchColumn();
        $decided = $accepted + $declined;
        $winRate = $decided > 0 ? round($accepted / $decided, 4) : null;

        // Average accepted deal size, in subunits — accepted proposals are the
        // closest thing to a real per-deal figure (inquiries.budget is free text).
        $avgDeal = (int) round((float) $pdo->query(
            "SELECT COALESCE(AVG(total_amount), 0) FROM proposals WHERE status = 'accepted'"
        )->fetchColumn());

        // Paying customers = distinct emails with a successful payment — the
        // bottom of the funnel, independent of whether a proposal was logged.
        $payingCustomers = (int) $pdo->query(
            "SELECT COUNT(DISTINCT LOWER(email)) FROM payments WHERE status = 'success'"
        )->fetchColumn();

        return [
            'stages' => $stages,
            'inquiries_total' => $inquiriesTotal,
            'proposals_total' => $proposalsTotal,
            'proposals_sent' => $proposalsSent,
            'proposals_accepted' => $accepted,
            'proposals_declined' => $declined,
            'paying_customers' => $payingCustomers,
            'win_rate' => $winRate,
            'avg_deal_size' => $avgDeal,
            // Headline funnel for the chart: everyone in -> proposals out -> paid.
            'funnel' => [
                ['label' => 'Inquiries', 'count' => $inquiriesTotal],
                ['label' => 'Proposals sent', 'count' => $proposalsTotal],
                ['label' => 'Paying clients', 'count' => $payingCustomers],
            ],
        ];
    }

    /**
     * Per-automation email performance. Sends/AI-sends/unsubscribes are joined
     * back through drip_enrollments so each number belongs to the right
     * automation even for a contact enrolled in several at once.
     *
     * @return list<array<string,mixed>>
     */
    private static function automations(\PDO $pdo): array
    {
        $rows = $pdo->query(
            "SELECT a.id, a.name, a.trigger_event, a.is_active, a.nurturer_enabled,
                    (SELECT COUNT(*) FROM drip_enrollments e WHERE e.automation_id = a.id) AS enrollments,
                    (SELECT COUNT(*) FROM drip_enrollments e WHERE e.automation_id = a.id AND e.status = 'active') AS active_enrollments,
                    (SELECT COUNT(*) FROM drip_enrollments e WHERE e.automation_id = a.id AND e.status = 'stopped') AS unsubscribed,
                    (SELECT COUNT(*) FROM drip_sends ds JOIN drip_enrollments e ON e.id = ds.enrollment_id WHERE e.automation_id = a.id) AS steps_sent,
                    (SELECT COUNT(*) FROM nurturer_sends ns JOIN drip_enrollments e ON e.id = ns.enrollment_id WHERE e.automation_id = a.id) AS ai_sends
             FROM automations a ORDER BY a.id ASC"
        )->fetchAll(\PDO::FETCH_ASSOC);

        return array_map(static function (array $r): array {
            $r['is_active'] = (int) $r['is_active'];
            $r['nurturer_enabled'] = (int) $r['nurturer_enabled'];
            foreach (['enrollments', 'active_enrollments', 'unsubscribed', 'steps_sent', 'ai_sends'] as $k) {
                $r[$k] = (int) $r[$k];
            }
            return $r;
        }, $rows);
    }

    /** @return array<string,mixed> */
    private static function bookings(\PDO $pdo): array
    {
        $total = (int) $pdo->query('SELECT COUNT(*) FROM appointments')->fetchColumn();
        $upcoming = (int) $pdo->query(
            "SELECT COUNT(*) FROM appointments WHERE status != 'cancelled' AND appointment_date >= date('now')"
        )->fetchColumn();
        $completed = (int) $pdo->query("SELECT COUNT(*) FROM appointments WHERE status = 'completed'")->fetchColumn();
        $cancelled = (int) $pdo->query("SELECT COUNT(*) FROM appointments WHERE status = 'cancelled'")->fetchColumn();

        $byMonthRaw = [];
        foreach ($pdo->query(
            "SELECT strftime('%Y-%m', appointment_date) AS month, COUNT(*) AS c FROM appointments "
            . "WHERE appointment_date >= date('now', '-12 months') GROUP BY month"
        ) as $r) {
            $byMonthRaw[$r['month']] = (int) $r['c'];
        }
        $byMonth = [];
        for ($i = 11; $i >= 0; $i--) {
            $month = date('Y-m', strtotime("-{$i} months"));
            $byMonth[] = ['month' => $month, 'count' => $byMonthRaw[$month] ?? 0];
        }

        return [
            'total' => $total,
            'upcoming' => $upcoming,
            'completed' => $completed,
            'cancelled' => $cancelled,
            'by_month' => $byMonth,
        ];
    }

    /**
     * Where leads come from, counted from each intake table. Contact-form and
     * project-request inquiries are split by type; chat, newsletter and
     * marketing are their own tables.
     *
     * @return list<array<string,mixed>>
     */
    private static function leadSources(\PDO $pdo): array
    {
        $contactForm = (int) $pdo->query("SELECT COUNT(*) FROM inquiries WHERE type = 'contact'")->fetchColumn();
        $projectReq = (int) $pdo->query("SELECT COUNT(*) FROM inquiries WHERE type = 'project_request'")->fetchColumn();
        $newsletter = (int) $pdo->query("SELECT COUNT(*) FROM newsletter_subscribers WHERE status = 'subscribed'")->fetchColumn();
        $marketing = (int) $pdo->query('SELECT COUNT(*) FROM marketing_leads')->fetchColumn();
        // Chat sessions that captured a contact — the live-chat lead source.
        $chat = (int) $pdo->query(
            "SELECT COUNT(*) FROM chat_sessions WHERE client_email IS NOT NULL AND TRIM(client_email) != ''"
        )->fetchColumn();

        return [
            ['label' => 'Contact form', 'count' => $contactForm],
            ['label' => 'Project requests', 'count' => $projectReq],
            ['label' => 'Live chat', 'count' => $chat],
            ['label' => 'Marketing leads', 'count' => $marketing],
            ['label' => 'Newsletter', 'count' => $newsletter],
        ];
    }

    /**
     * Top clients by successful-payment revenue. Grouped by lowercased email so
     * a client who paid under two name spellings still totals as one.
     *
     * @return list<array<string,mixed>>
     */
    private static function topClients(\PDO $pdo): array
    {
        $rows = $pdo->query(
            "SELECT LOWER(email) AS email,
                    MAX(customer_name) AS name,
                    COUNT(*) AS payments_count,
                    SUM(amount) AS total,
                    currency,
                    MAX(created_at) AS last_paid_at
             FROM payments
             WHERE status = 'success'
             GROUP BY LOWER(email), currency
             ORDER BY total DESC
             LIMIT 10"
        )->fetchAll(\PDO::FETCH_ASSOC);

        return array_map(static fn(array $r): array => [
            'email' => $r['email'],
            'name' => $r['name'] ?: null,
            'payments_count' => (int) $r['payments_count'],
            'total' => (int) $r['total'],
            'currency' => $r['currency'],
            'last_paid_at' => $r['last_paid_at'],
        ], $rows);
    }
}
