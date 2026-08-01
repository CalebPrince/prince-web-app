<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiText;
use App\Support\Automations;
use App\Support\Database;
use App\Support\EmailEnrichment;
use App\Support\LeadFitScorer;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;
use App\Support\Utm;

/**
 * Internal outreach tool ("Developer's Edge"): admin tracks target
 * businesses, runs a real technical audit of each site (when one exists —
 * a business with no website yet is just as valid a lead), drafts an AI
 * pitch grounded only in the actual findings, and manually approves each
 * send — there is no bulk-send / auto-blast path, since these are
 * unsolicited contacts and every message should be a deliberate, reviewed
 * decision.
 *
 * Leads can also be found by niche (discover(), backed by a real business
 * search API — Serper's Google Places search, not an AI guess) rather than
 * added one at a time. This is deliberately kept out of AiText: an AI
 * "generating" business names/websites for a niche would just be
 * hallucinating plausible-looking fake ones, which is exactly what every
 * other part of this tool goes out of its way to avoid — search results
 * only ever come from a real, verifiable API response. Discovery only
 * returns candidates for review. The separately enabled LeadDiscovery job
 * can also add deduplicated candidates from saved searches each day.
 *
 * Outreach isn't email-only: a lead with a phone number but no email gets
 * a call script (draftCallScript()) instead of an email pitch
 * (draftPitch()) — same real findings underneath (findingsContext()), just
 * worded for a conversation instead of a message. See pitch_channel.
 */
class MarketingLeadController
{
    private const STATUSES = ['pending', 'audited', 'pitch_ready', 'sent', 'rejected'];

    /** GET /api/v1/admin/marketing-leads */
    public static function adminIndex(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $rows = $pdo->query('SELECT * FROM marketing_leads ORDER BY created_at DESC')->fetchAll();
        $demoRows = $pdo->query('SELECT lead_id FROM account_demos')->fetchAll();
        $demoLeadIds = array_flip(array_map(static fn(array $row): int => (int) $row['lead_id'], $demoRows));
        $researchAgentName = Settings::get('dossier_assistant_name') ?: 'Sharon';
        foreach ($rows as &$row) {
            $row['research_agent_name'] = $researchAgentName;
            $fit = LeadFitScorer::persist($pdo, $row);
            $row['fit_score'] = $fit['score'];
            $row['fit_label'] = $fit['label'];
            $row['fit_reasons'] = $fit['reasons'];
            $row['fit_qualified'] = $fit['qualified'];
            $row['audit_findings'] = $row['audit_findings'] ? json_decode($row['audit_findings'], true) : null;
            $row['opportunity'] = self::classifyOpportunity(
                !empty($row['website_url']),
                $row['audit_findings']
            );
            // Dossier's research brief (DossierController) — decoded here so
            // the Marketing Leads page gets a structured object to render.
            $row['research_findings'] = $row['research_findings'] ? json_decode($row['research_findings'], true) : null;
            $row['account_demo'] = isset($demoLeadIds[(int) $row['id']])
                ? AccountDemoController::forLead($pdo, (int) $row['id'])
                : null;
        }
        unset($row);
        usort(
            $rows,
            static fn(array $a, array $b): int =>
                ((int) ($b['is_high_priority'] ?? 0) <=> (int) ($a['is_high_priority'] ?? 0))
                ?: (($b['opportunity']['priority'] ?? 0) <=> ($a['opportunity']['priority'] ?? 0))
                ?: strcmp((string) $b['created_at'], (string) $a['created_at'])
        );
        Response::json($rows);
    }

    /** Days of daily history returned by the send/reply trend chart. */
    private const TREND_DAYS = 30;

    /**
     * GET /api/v1/admin/marketing-leads/analytics — the numbers behind the
     * outreach funnel: how many emails actually went out, how many real
     * replies came back (and how they broke down), how prospects reacted to
     * their account demos, and the raw activity feeds (recent sends, recent
     * replies, most-engaged demos) an advanced dashboard renders as tables.
     * Every figure is derived from existing tables (outreach_sends,
     * nurturer_replies, account_demos, call_log) — nothing here is stored
     * separately, so it can never drift from what MarketingLeadController /
     * OutreachController / NurturerController actually recorded.
     */
    public static function analytics(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();

        Response::json([
            'overview' => self::buildAnalyticsOverview($pdo),
            'send_trend' => self::buildSendTrend($pdo),
            'reply_breakdown' => self::buildReplyBreakdown($pdo),
            'opportunity_breakdown' => self::buildOpportunityBreakdown($pdo),
            'recent_sends' => self::buildRecentSends($pdo, 25),
            'recent_replies' => self::buildRecentReplies($pdo, 25),
            'top_demos' => self::buildTopDemos($pdo, 10),
        ]);
    }

    /** @return array<string,mixed> */
    private static function buildAnalyticsOverview(\PDO $pdo): array
    {
        $emailsTotal = (int) $pdo->query('SELECT COUNT(*) FROM outreach_sends')->fetchColumn();
        $emailsToday = (int) $pdo->query("SELECT COUNT(*) FROM outreach_sends WHERE date(sent_at) = date('now')")->fetchColumn();
        $emails7d = (int) $pdo->query("SELECT COUNT(*) FROM outreach_sends WHERE sent_at >= datetime('now', '-7 days')")->fetchColumn();
        $emails30d = (int) $pdo->query("SELECT COUNT(*) FROM outreach_sends WHERE sent_at >= datetime('now', '-30 days')")->fetchColumn();

        // Replies are scoped to enrollments the outbound pipeline itself
        // created (source = 'marketing_lead') — a manually-enrolled
        // newsletter contact replying to an unrelated drip shouldn't count
        // toward this outreach funnel's reply rate.
        $repliesTotal = (int) $pdo->query(
            "SELECT COUNT(*) FROM nurturer_replies nr
             JOIN drip_enrollments e ON e.id = nr.enrollment_id
             WHERE e.source = 'marketing_lead'"
        )->fetchColumn();
        $repliesNeedingReview = (int) $pdo->query(
            "SELECT COUNT(*) FROM nurturer_replies nr
             JOIN drip_enrollments e ON e.id = nr.enrollment_id
             WHERE e.source = 'marketing_lead' AND (nr.status = 'review' OR nr.classification = 'needs_review')"
        )->fetchColumn();
        $repliesInterested = (int) $pdo->query(
            "SELECT COUNT(*) FROM nurturer_replies nr
             JOIN drip_enrollments e ON e.id = nr.enrollment_id
             WHERE e.source = 'marketing_lead' AND nr.classification IN ('interested', 'question')"
        )->fetchColumn();

        $callsTotal = (int) $pdo->query('SELECT COUNT(*) FROM call_log')->fetchColumn();
        $callsConnected = (int) $pdo->query("SELECT COUNT(*) FROM call_log WHERE outcome IN ('connected', 'interested')")->fetchColumn();

        $demoRow = $pdo->query(
            "SELECT COUNT(*) AS demos_total,
                    COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0) AS demos_published,
                    COALESCE(SUM(views), 0) AS views_total,
                    COALESCE(SUM(cta_clicks), 0) AS cta_clicks_total,
                    COALESCE(SUM(interaction_count), 0) AS interactions_total,
                    COALESCE(AVG(intent_score), 0) AS avg_intent,
                    COALESCE(SUM(CASE WHEN intent_score >= 70 THEN 1 ELSE 0 END), 0) AS hot_count
             FROM account_demos"
        )->fetch();

        $pipelineValue = $pdo->query(
            "SELECT currency, SUM(estimated_value) AS total FROM marketing_leads
             WHERE estimated_value > 0 GROUP BY currency"
        )->fetchAll();

        return [
            'total_leads' => (int) $pdo->query('SELECT COUNT(*) FROM marketing_leads')->fetchColumn(),
            'high_priority' => (int) $pdo->query('SELECT COUNT(*) FROM marketing_leads WHERE is_high_priority = 1')->fetchColumn(),
            'pipeline_value' => array_map(
                static fn(array $r): array => ['currency' => (string) $r['currency'], 'total' => (int) $r['total']],
                $pipelineValue
            ),
            'emails_sent_total' => $emailsTotal,
            'emails_sent_today' => $emailsToday,
            'emails_sent_7d' => $emails7d,
            'emails_sent_30d' => $emails30d,
            'replies_total' => $repliesTotal,
            'replies_needing_review' => $repliesNeedingReview,
            'replies_interested' => $repliesInterested,
            'reply_rate' => $emailsTotal > 0 ? round(($repliesTotal / $emailsTotal) * 100, 1) : 0.0,
            'calls_total' => $callsTotal,
            'calls_connected' => $callsConnected,
            'demos_total' => (int) ($demoRow['demos_total'] ?? 0),
            'demos_published' => (int) ($demoRow['demos_published'] ?? 0),
            'demo_views_total' => (int) ($demoRow['views_total'] ?? 0),
            'demo_cta_clicks_total' => (int) ($demoRow['cta_clicks_total'] ?? 0),
            'demo_interactions_total' => (int) ($demoRow['interactions_total'] ?? 0),
            'demo_avg_intent' => round((float) ($demoRow['avg_intent'] ?? 0), 1),
            'demo_hot_count' => (int) ($demoRow['hot_count'] ?? 0),
        ];
    }

    /**
     * Daily emails-sent vs. replies-received for the last TREND_DAYS days —
     * the two series a "did outreach work today" line chart needs, aligned
     * on the same date axis (missing days filled with 0 rather than omitted).
     *
     * @return list<array{date:string,sent:int,replies:int}>
     */
    private static function buildSendTrend(\PDO $pdo): array
    {
        $sent = [];
        foreach ($pdo->query("SELECT date(sent_at) AS d, COUNT(*) AS n FROM outreach_sends WHERE sent_at >= datetime('now', '-30 days') GROUP BY d") as $row) {
            $sent[(string) $row['d']] = (int) $row['n'];
        }
        $replies = [];
        foreach ($pdo->query(
            "SELECT date(nr.received_at) AS d, COUNT(*) AS n FROM nurturer_replies nr
             JOIN drip_enrollments e ON e.id = nr.enrollment_id
             WHERE e.source = 'marketing_lead' AND nr.received_at >= datetime('now', '-30 days')
             GROUP BY d"
        ) as $row) {
            $replies[(string) $row['d']] = (int) $row['n'];
        }

        $trend = [];
        for ($i = self::TREND_DAYS - 1; $i >= 0; $i--) {
            $key = date('Y-m-d', strtotime("-{$i} days"));
            $trend[] = ['date' => $key, 'sent' => $sent[$key] ?? 0, 'replies' => $replies[$key] ?? 0];
        }
        return $trend;
    }

    /** @return list<array{classification:string,count:int}> */
    private static function buildReplyBreakdown(\PDO $pdo): array
    {
        $rows = $pdo->query(
            "SELECT nr.classification, COUNT(*) AS n FROM nurturer_replies nr
             JOIN drip_enrollments e ON e.id = nr.enrollment_id
             WHERE e.source = 'marketing_lead'
             GROUP BY nr.classification ORDER BY n DESC"
        )->fetchAll();
        return array_map(
            static fn(array $r): array => ['classification' => (string) $r['classification'], 'count' => (int) $r['n']],
            $rows
        );
    }

    /**
     * How the current pipeline splits by opportunity type (recomputed live
     * from each lead's audit findings via classifyOpportunity(), the same
     * function that drives the per-row badge — so this chart can never
     * disagree with what the table shows).
     *
     * @return list<array{type:string,label:string,count:int}>
     */
    private static function buildOpportunityBreakdown(\PDO $pdo): array
    {
        $rows = $pdo->query('SELECT website_url, audit_findings FROM marketing_leads')->fetchAll();
        $counts = [];
        foreach ($rows as $row) {
            $findings = $row['audit_findings'] ? (json_decode((string) $row['audit_findings'], true) ?: null) : null;
            $opportunity = self::classifyOpportunity(!empty($row['website_url']), is_array($findings) ? $findings : null);
            $type = $opportunity['type'];
            if (!isset($counts[$type])) {
                $counts[$type] = ['label' => $opportunity['label'], 'count' => 0];
            }
            $counts[$type]['count']++;
        }
        $out = [];
        foreach ($counts as $type => $c) {
            $out[] = ['type' => $type, 'label' => $c['label'], 'count' => $c['count']];
        }
        return $out;
    }

    /** @return list<array<string,mixed>> */
    private static function buildRecentSends(\PDO $pdo, int $limit): array
    {
        $stmt = $pdo->prepare(
            "SELECT os.id, os.lead_id, ml.business_name, os.recipient_email, os.subject, os.sent_at,
                    EXISTS (
                      SELECT 1 FROM nurturer_replies nr
                      JOIN drip_enrollments e ON e.id = nr.enrollment_id
                      WHERE e.lead_id = os.lead_id
                    ) AS replied
             FROM outreach_sends os
             JOIN marketing_leads ml ON ml.id = os.lead_id
             ORDER BY os.sent_at DESC LIMIT ?"
        );
        $stmt->execute([$limit]);
        return array_map(static function (array $r): array {
            $r['replied'] = (bool) $r['replied'];
            return $r;
        }, $stmt->fetchAll());
    }

    /** @return list<array<string,mixed>> */
    private static function buildRecentReplies(\PDO $pdo, int $limit): array
    {
        $stmt = $pdo->prepare(
            "SELECT nr.id, nr.from_email, nr.subject, nr.body, nr.classification, nr.confidence,
                    nr.status, nr.received_at, nr.reply_subject, nr.reply_body,
                    COALESCE(ml.business_name, e.name) AS business_name, e.lead_id
             FROM nurturer_replies nr
             JOIN drip_enrollments e ON e.id = nr.enrollment_id
             LEFT JOIN marketing_leads ml ON ml.id = e.lead_id
             WHERE e.source = 'marketing_lead'
             ORDER BY nr.received_at DESC LIMIT ?"
        );
        $stmt->execute([$limit]);
        return $stmt->fetchAll();
    }

    /** @return list<array<string,mixed>> */
    private static function buildTopDemos(\PDO $pdo, int $limit): array
    {
        $stmt = $pdo->prepare(
            "SELECT ad.lead_id, ml.business_name, ad.status, ad.token, ad.views, ad.cta_clicks,
                    ad.interaction_count, ad.max_scroll_depth, ad.engaged_seconds, ad.intent_score,
                    ad.last_viewed_at
             FROM account_demos ad
             JOIN marketing_leads ml ON ml.id = ad.lead_id
             WHERE ad.views > 0 OR ad.status = 'published'
             ORDER BY ad.intent_score DESC, ad.views DESC LIMIT ?"
        );
        $stmt->execute([$limit]);
        return array_map(static function (array $r): array {
            $r['url'] = $r['status'] === 'published' ? '/account-demo.html?token=' . $r['token'] : null;
            unset($r['token']);
            return $r;
        }, $stmt->fetchAll());
    }

    /** POST /api/v1/admin/marketing-leads — body: {business_name, website_url?, contact_email?, contact_phone?} */
    public static function store(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $businessName = trim((string) ($data['business_name'] ?? ''));
        $contactName = trim((string) ($data['contact_name'] ?? ''));
        $websiteUrl = trim((string) ($data['website_url'] ?? ''));
        $contactEmail = trim((string) ($data['contact_email'] ?? ''));
        $contactPhone = trim((string) ($data['contact_phone'] ?? ''));
        [$estimatedValue, $currency] = self::opportunityValue($data);

        if ($businessName === '' || mb_strlen($businessName) > 255) {
            Response::error('Business name is required.', 422);
        }
        if (mb_strlen($contactName) > 160) {
            Response::error('Contact name is too long.', 422);
        }
        // No website at all is a valid lead — a business that hasn't built
        // one yet is a real prospect, just pitched differently (see
        // draftPitch()). Only validate the URL shape when one is given.
        if ($websiteUrl !== '' && (!preg_match('#^https?://#i', $websiteUrl) || !filter_var($websiteUrl, FILTER_VALIDATE_URL))) {
            Response::error('If provided, website URL must be a valid http:// or https:// address.', 422);
        }
        if ($contactEmail !== '' && !filter_var($contactEmail, FILTER_VALIDATE_EMAIL)) {
            Response::error('Contact email is not valid.', 422);
        }
        // Phone formats vary too widely across countries to validate the
        // shape — just bound the length against garbage/paste errors.
        if (mb_strlen($contactPhone) > 50) {
            Response::error('Contact phone is too long.', 422);
        }

        $pdo = Database::get();
        $pdo->prepare('INSERT INTO marketing_leads (business_name, contact_name, website_url, contact_email, contact_phone, estimated_value, currency) VALUES (?, ?, ?, ?, ?, ?, ?)')
            ->execute([$businessName, $contactName ?: null, $websiteUrl ?: null, $contactEmail ?: null, $contactPhone ?: null, $estimatedValue, $currency]);

        Response::json(['id' => (int) $pdo->lastInsertId()], 201);
    }

    /**
     * POST /api/v1/admin/marketing-leads/discover — body: {query} — finds
     * real candidate businesses for a niche/location (e.g. "plumbers in
     * Accra") via a real search API. Returns candidates only; nothing is
     * added to the leads list until bulkStore() is called with a
     * hand-picked subset.
     */
    public static function discover(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $query = trim((string) ($data['query'] ?? ''));
        if ($query === '' || mb_strlen($query) > 200) {
            Response::error('Enter a niche and location to search, e.g. "plumbers in Accra".', 422);
        }

        $apiKey = Settings::get('serper_api_key');
        if (empty($apiKey)) {
            Response::error('No search provider configured — add a Serper API key in Admin → Settings.', 503);
        }

        $results = self::searchBusinesses($apiKey, $query);
        if ($results === null) {
            Response::error('Search failed — please try again in a moment.', 502);
        }
        if (!$results) {
            Response::json(['results' => []]);
        }

        // Flag candidates that are already tracked (by website URL) so the
        // admin doesn't end up re-adding a lead they've already worked on.
        $pdo = Database::get();
        $existingUrls = array_map(
            fn($u) => rtrim(strtolower((string) $u), '/'),
            array_column(
                $pdo->query('SELECT website_url FROM marketing_leads WHERE website_url IS NOT NULL')->fetchAll(),
                'website_url'
            )
        );
        foreach ($results as &$r) {
            $r['already_added'] = $r['website_url'] !== null
                && in_array(rtrim(strtolower($r['website_url']), '/'), $existingUrls, true);
        }
        unset($r);

        Response::json(['results' => $results]);
    }

    /**
     * POST /api/v1/admin/marketing-leads/bulk — body: {leads:[{business_name, website_url?}]}
     * Adds a hand-picked batch of discovered candidates in one call. Each
     * one still goes through the normal pending -> audit -> pitch -> review
     * -> send pipeline individually — this only replaces the one-at-a-time
     * "+ Add lead" step, not any of the review gates after it.
     */
    public static function bulkStore(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $leads = is_array($data['leads'] ?? null) ? $data['leads'] : [];
        if (!$leads) {
            Response::error('No leads to add.', 422);
        }
        if (count($leads) > 50) {
            Response::error('Add up to 50 leads at a time.', 422);
        }
        [$estimatedValue, $currency] = self::opportunityValue($data);

        $pdo = Database::get();
        $existingUrls = array_map(
            fn($u) => rtrim(strtolower((string) $u), '/'),
            array_column(
                $pdo->query('SELECT website_url FROM marketing_leads WHERE website_url IS NOT NULL')->fetchAll(),
                'website_url'
            )
        );

        $stmt = $pdo->prepare('INSERT INTO marketing_leads (business_name, website_url, contact_phone, estimated_value, currency) VALUES (?, ?, ?, ?, ?)');
        $added = 0;
        foreach ($leads as $lead) {
            $name = trim((string) ($lead['business_name'] ?? ''));
            if ($name === '' || mb_strlen($name) > 255) {
                continue;
            }
            $url = trim((string) ($lead['website_url'] ?? ''));
            if ($url !== '' && (!preg_match('#^https?://#i', $url) || !filter_var($url, FILTER_VALIDATE_URL))) {
                $url = ''; // drop a malformed URL rather than reject the whole batch over one bad entry
            }
            $normalized = rtrim(strtolower($url), '/');
            if ($url !== '' && in_array($normalized, $existingUrls, true)) {
                continue; // already tracked
            }
            // Serper's Places search already returns a phone number for most
            // listings — carrying it straight through means a discovered
            // lead is often immediately ready for phone outreach even when
            // Google has no website on file for them.
            $phone = trim((string) ($lead['phone'] ?? ''));
            if (mb_strlen($phone) > 50) {
                $phone = '';
            }

            $stmt->execute([$name, $url ?: null, $phone ?: null, $estimatedValue, $currency]);
            if ($url !== '') {
                $existingUrls[] = $normalized;
            }
            $added++;
        }

        Response::json(['added' => $added], 201);
    }

    /** PATCH /api/v1/admin/marketing-leads/{id} — body: any of business_name, website_url, contact_email, contact_phone, pitch_subject, pitch_body, notes, status */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $pdo = Database::get();
        $lead = self::findOrFail($pdo, (int) $params['id']);

        $fields = [];
        $values = [];
        foreach (['business_name', 'contact_name', 'website_url', 'contact_email', 'contact_phone', 'pitch_subject', 'pitch_body', 'notes'] as $key) {
            if (array_key_exists($key, $data)) {
                $fields[] = "$key = ?";
                $values[] = trim((string) $data[$key]) !== '' ? trim((string) $data[$key]) : null;
            }
        }
        if (array_key_exists('contact_name', $data) && mb_strlen(trim((string) $data['contact_name'])) > 160) {
            Response::error('Contact name is too long.', 422);
        }
        if (array_key_exists('status', $data)) {
            if (!in_array($data['status'], self::STATUSES, true)) {
                Response::error('Invalid status.', 422);
            }
            $fields[] = 'status = ?';
            $values[] = $data['status'];
        }
        if (array_key_exists('is_high_priority', $data)) {
            $fields[] = 'is_high_priority = ?';
            $values[] = !empty($data['is_high_priority']) ? 1 : 0;
        }
        if (array_key_exists('estimated_value', $data) || array_key_exists('currency', $data)) {
            [$estimatedValue, $currency] = self::opportunityValue($data, (int) ($lead['estimated_value'] ?? 0), (string) ($lead['currency'] ?? 'GHS'));
            $fields[] = 'estimated_value = ?'; $values[] = $estimatedValue;
            $fields[] = 'currency = ?'; $values[] = $currency;
        }
        if (!$fields) {
            Response::json(['status' => 'updated']);
        }

        $values[] = $lead['id'];
        $pdo->prepare('UPDATE marketing_leads SET ' . implode(', ', $fields) . ", updated_at = datetime('now') WHERE id = ?")
            ->execute($values);

        Response::json(['status' => 'updated']);
    }

    private static function opportunityValue(array $data, int $currentValue = 0, string $currentCurrency = 'GHS'): array
    {
        $raw = $data['estimated_value'] ?? ($currentValue / 100);
        if (!is_numeric($raw) || (float) $raw < 0 || (float) $raw > 999999999) Response::error('Enter a valid estimated project value.', 422);
        $currency = strtoupper(trim((string) ($data['currency'] ?? $currentCurrency)));
        if (!preg_match('/^[A-Z]{3}$/', $currency)) Response::error('Currency must be a three-letter code.', 422);
        return [(int) round((float) $raw * 100), $currency];
    }

    /** DELETE /api/v1/admin/marketing-leads/{id} */
    public static function destroy(array $params): void
    {
        $user = AuthMiddleware::requireAuth();
        $id = (int) $params['id'];
        $pdo = Database::get();
        $stmt = $pdo->prepare('SELECT business_name FROM marketing_leads WHERE id = ?');
        $stmt->execute([$id]);
        $name = $stmt->fetchColumn();
        if ($name === false) Response::error('Lead not found.', 404);

        try {
            $pdo->beginTransaction();

            // Keep communication history, but detach it from the lead being
            // removed. Explicit updates also make deletion work on databases
            // created before these foreign keys gained ON DELETE SET NULL.
            $pdo->prepare('UPDATE drip_enrollments SET lead_id = NULL WHERE lead_id = ?')->execute([$id]);
            $pdo->prepare('UPDATE telephony_calls SET marketing_lead_id = NULL WHERE marketing_lead_id = ?')->execute([$id]);

            // These records belong exclusively to the prospect. Delete them
            // explicitly so older deployed schemas without cascade actions do
            // not turn a normal admin delete into an HTTP 500.
            $pdo->prepare('DELETE FROM account_demos WHERE lead_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM outreach_sends WHERE lead_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM call_log WHERE lead_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM marketing_leads WHERE id = ?')->execute([$id]);

            ActivityLog::log($user, 'deleted', 'marketing_lead', $id, $name ?: null);
            $pdo->commit();
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $locked = str_contains(strtolower($e->getMessage()), 'locked')
                || str_contains(strtolower($e->getMessage()), 'busy');
            error_log('Marketing lead delete failed for ' . $id . ': ' . $e->getMessage());
            Response::error(
                $locked
                    ? 'The lead database is busy with another automation. Wait a few seconds and try deleting again.'
                    : 'This lead could not be deleted because related records could not be updated.',
                $locked ? 503 : 409
            );
        }
        Response::json(['status' => 'deleted']);
    }

    /** POST /api/v1/admin/marketing-leads/{id}/audit — runs a real, verifiable technical check of the site */
    public static function runAudit(array $params): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $lead = self::findOrFail($pdo, (int) $params['id']);

        if (empty($lead['website_url'])) {
            Response::error('This lead has no website to audit — go straight to generating a pitch instead.', 422);
        }
        if (!SharedAgentTools::isSafeUrl($lead['website_url'])) {
            Response::error('That URL cannot be audited (invalid, or resolves to a private/internal address).', 422);
        }

        $findings = self::performAudit($lead['website_url']);

        $pdo->prepare("UPDATE marketing_leads SET audit_findings = ?, status = 'audited', updated_at = datetime('now') WHERE id = ?")
            ->execute([json_encode($findings), $lead['id']]);

        // If the site publishes a real email and we had none on file, capture
        // it — turns a phone-only lead into an emailable one, no guessing.
        $foundEmail = self::applyFoundEmail($pdo, $lead, $findings);
        $lead['audit_findings'] = json_encode($findings);
        if ($foundEmail !== null) $lead['contact_email'] = $foundEmail;
        $fit = LeadFitScorer::persist($pdo, $lead);

        Response::json([
            'findings' => $findings,
            'found_email' => $foundEmail,
            'opportunity' => self::classifyOpportunity(true, $findings),
            'fit' => $fit,
        ]);
    }

    /**
     * POST /api/v1/admin/marketing-leads/{id}/generate-pitch — body: {channel?: 'email'|'phone'}
     * Drafts outreach grounded only in the stored audit findings. Defaults
     * to an email pitch when possible (the richer, more professional
     * channel); auto-switches to a phone call-script when the lead has a
     * phone number on file but no email to write to. Either can be
     * requested explicitly via `channel`.
     */
    public static function generatePitch(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $pdo = Database::get();
        $lead = self::findOrFail($pdo, (int) $params['id']);

        // A lead with no website has nothing to audit — the pitch is just a
        // generic "let's build your first site" intro. A lead WITH a website
        // must still be audited first, so its pitch is always grounded in
        // real findings, never guessed at.
        if (!empty($lead['website_url']) && empty($lead['audit_findings'])) {
            Response::error('Run the audit first — the pitch is only ever based on real findings.', 422);
        }

        if (empty(Settings::get('gemini_api_key')) && empty(Settings::get('openrouter_api_key')) && empty(Settings::get('groq_api_key'))) {
            Response::error('No AI provider configured — add a Gemini, OpenRouter, or Groq key in Admin → Settings.', 503);
        }

        $channel = in_array($data['channel'] ?? '', ['email', 'phone'], true)
            ? $data['channel']
            : (empty($lead['contact_email']) && !empty($lead['contact_phone']) ? 'phone' : 'email');

        $findings = $lead['audit_findings'] ? (json_decode($lead['audit_findings'], true) ?: []) : ['no_website' => true];
        $fit = LeadFitScorer::persist($pdo, $lead);

        if ($channel === 'phone') {
            $script = self::draftWhatsAppMessage($lead['business_name'], $findings);
            if ($script === null) {
                Response::error('WhatsApp message generation failed — please try again in a moment.', 502);
            }
            $pdo->prepare(
                "UPDATE marketing_leads SET pitch_subject = NULL, pitch_body = ?, pitch_channel = 'phone',
                 status = 'pitch_ready', updated_at = datetime('now') WHERE id = ?"
            )->execute([$script, $lead['id']]);
            Response::json(['channel' => 'phone', 'subject' => null, 'body' => $script, 'fit' => $fit]);
        }

        $demoUrl = AccountDemoController::publishedUrlForLead($pdo, (int) $lead['id']);
        $caseStudy = self::findCaseStudyForLead($pdo, (int) $lead['id']);
        $pitch = self::draftPitch($lead['business_name'], $findings, $demoUrl, (int) $lead['id'], $caseStudy);
        if ($pitch === null) {
            Response::error('Pitch generation failed — please try again in a moment.', 502);
        }

        $pdo->prepare(
            "UPDATE marketing_leads SET pitch_subject = ?, pitch_body = ?, pitch_channel = 'email',
             status = 'pitch_ready', updated_at = datetime('now') WHERE id = ?"
        )->execute([$pitch['subject'], $pitch['body'], $lead['id']]);

        Response::json(['channel' => 'email', 'fit' => $fit] + $pitch);
    }

    /**
     * POST /api/v1/admin/marketing-leads/{id}/send — records that the admin
     * followed through on the outreach. There is no server-side auto-send:
     * for an email pitch, the frontend opens a mailto: draft in the admin's
     * own mail client first; for a phone script, this just records that the
     * call was made (tel: links only launch a dialer, they can't confirm a
     * call happened) — either way, this endpoint only fires after the admin
     * has actually done it themselves.
     */
    public static function markSent(array $params): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $lead = self::findOrFail($pdo, (int) $params['id']);

        if (($lead['pitch_channel'] ?? 'email') === 'phone') {
            if (empty($lead['contact_phone'])) {
                Response::error('No contact phone on file for this lead.', 422);
            }
        } elseif (empty($lead['contact_email'])) {
            Response::error('No contact email on file for this lead.', 422);
        }

        $pdo->prepare("UPDATE marketing_leads SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
            ->execute([$lead['id']]);

        // Emailed leads fire the 'marketing_pitch_sent' trigger, which enrolls
        // them into every active automation listening for it — the seeded
        // cold-outreach follow-up by default (a no-op if the address is already
        // enrolled there or has unsubscribed).
        //
        // last_action feeds Nurturer's prompt, and the audit findings are the
        // best material available for it: a specific, real observation about
        // *their* site, which is exactly what stops a follow-up reading like a
        // template. nurturer_enabled stays off — an AI-written email to a real
        // prospect is Caleb's call per lead, not something marking a pitch as
        // sent should trigger silently. Toggle it per enrollment on the
        // Automations page. lead_industry has no column to draw from on
        // marketing_leads, so it falls back to "general business"; Nurturer
        // still sees the business name and can infer from that.
        if (($lead['pitch_channel'] ?? 'email') !== 'phone' && !empty($lead['contact_email'])) {
            $auditNote = trim((string) ($lead['audit_findings'] ?? ''));
            $lastAction = 'was sent an outreach pitch about their website'
                . (!empty($lead['website_url']) ? ' (' . $lead['website_url'] . ')' : '')
                . ($auditNote !== '' ? '. Issues spotted in the audit: ' . mb_substr($auditNote, 0, 300) : '');

            Automations::fire('marketing_pitch_sent', $lead['contact_email'], [
                'name' => $lead['contact_name'] ?: ($lead['business_name'] ?: null),
                'source' => 'marketing_lead',
                'lead_id' => (int) $lead['id'],
                'last_action' => $lastAction,
            ], $pdo);
        }

        Response::json(['status' => 'updated']);
    }

    // ---- internals ----------------------------------------------------------

    /**
     * Real business search via Serper's Google Places search — returns
     * actual listings (name, real website if Google has one on file,
     * address, phone, rating), never AI-generated. A business with no
     * website on Google Places is still returned (website_url null) since
     * that's a valid lead too, same as manually-added no-website leads.
     *
     * @return array<int,array{business_name:string,website_url:?string,address:?string,phone:?string,rating:?float}>|null null only on a hard search failure
     */
    public static function searchBusinesses(string $apiKey, string $query, int $page = 1): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $ch = curl_init('https://google.serper.dev/places');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'X-API-KEY: ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode(['q' => $query, 'page' => max(1, $page)]),
            CURLOPT_TIMEOUT => 15,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);

        if ($response === false || $status !== 200) {
            error_log(sprintf(
                'Marketing lead discovery: Serper search failed: status=%s curl_error=%s body=%s',
                $status,
                $curlError !== '' ? $curlError : 'none',
                is_string($response) ? substr($response, 0, 500) : 'n/a'
            ));
            return null;
        }

        $decoded = json_decode($response, true);
        $places = $decoded['places'] ?? [];
        if (!is_array($places)) {
            return [];
        }

        $out = [];
        foreach ($places as $place) {
            $name = trim((string) ($place['title'] ?? ''));
            if ($name === '') {
                continue;
            }
            $website = trim((string) ($place['website'] ?? ''));
            $out[] = [
                'business_name' => $name,
                'website_url' => $website !== '' && preg_match('#^https?://#i', $website) ? $website : null,
                'address' => $place['address'] ?? null,
                'phone' => $place['phoneNumber'] ?? null,
                'rating' => isset($place['rating']) ? (float) $place['rating'] : null,
            ];
        }

        return $out;
    }

    private static function findOrFail(\PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM marketing_leads WHERE id = ?');
        $stmt->execute([$id]);
        $lead = $stmt->fetch();
        if (!$lead) {
            Response::error('Lead not found.', 404);
        }
        return $lead;
    }

    /** @return array<string,mixed> Only objectively verifiable technical signals — never fabricated. */
    /**
     * Runs the real technical audit and returns the findings array. Public so
     * the Cold Outreach Engine's auto-draft (OutreachController) can audit a
     * lead unattended before drafting; callers are responsible for the
     * SharedAgentTools::isSafeUrl() SSRF check first (runAudit() does it).
     */
    public static function performAudit(string $url): array
    {
        if (!function_exists('curl_init')) {
            return ['error' => 'Audit unavailable on this host (curl not installed).', 'checked_at' => date('c')];
        }

        $start = microtime(true);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; PrinceCalebSiteAudit/1.0; +https://princecaleb.dev)',
        ]);
        $html = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $finalUrl = (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        $curlError = curl_error($ch);
        curl_close($ch);
        $elapsedMs = (int) round((microtime(true) - $start) * 1000);

        if ($html === false || $status === 0) {
            // Kept in the same shape as a normal audit (an 'issues' entry,
            // not a special dead-end 'error' field) so this still becomes a
            // real, usable finding — a domain that doesn't even resolve, or
            // a server that refuses every connection, is one of the
            // strongest possible pitch angles, not something to discard.
            return [
                'reachable' => false,
                'issues' => [['issue' => 'unreachable', 'detail' => self::describeUnreachable($curlError)]],
                'checked_at' => date('c'),
            ];
        }

        $issues = [];

        // A broken site is the single most compelling (and most common) real
        // finding, so it's checked first and listed first. Two separate
        // failure modes matter here: an outright error status, and — just as
        // common with WordPress — a fatal error page that the server still
        // serves with a 200 OK, which the status-code check alone would miss.
        if ($status >= 400) {
            $issues[] = ['issue' => 'error_status', 'detail' => "The site returned an HTTP {$status} error instead of loading normally."];
        }
        if (trim($html) === '') {
            $issues[] = ['issue' => 'blank_page', 'detail' => 'The site returned a completely blank page.'];
        } else {
            $brokenPageSignatures = [
                'error establishing a database connection' => 'The site shows a "database connection" error instead of loading — a common sign the host or database is down.',
                'there has been a critical error on this website' => 'The site shows a WordPress "critical error" message instead of loading normally.',
                'this site is experiencing technical difficulties' => 'The site shows a "technical difficulties" error instead of loading normally.',
                'the site is currently unable to handle this request' => 'The site shows a fatal PHP error page instead of loading normally.',
                'service unavailable' => 'The site shows a "Service Unavailable" error instead of loading normally.',
                'briefly unavailable for scheduled maintenance' => 'The site is stuck showing a maintenance-mode message.',
                '<h1>bad gateway</h1>' => 'The site shows a "Bad Gateway" error instead of loading normally.',
            ];
            foreach ($brokenPageSignatures as $needle => $detail) {
                if (stripos($html, $needle) !== false) {
                    $issues[] = ['issue' => 'error_page_content', 'detail' => $detail];
                    break; // one is enough — this is a single underlying failure, not several
                }
            }
        }

        if (!str_starts_with($finalUrl, 'https://')) {
            $issues[] = ['issue' => 'no_https', 'detail' => 'Site does not load over HTTPS — browsers mark it "Not Secure".'];
        }
        if (!preg_match('/<meta[^>]+name=["\']viewport["\']/i', $html)) {
            $issues[] = ['issue' => 'no_viewport_meta', 'detail' => 'No mobile viewport meta tag found — the page likely does not render correctly on phones.'];
        }

        $title = null;
        if (preg_match('/<title[^>]*>(.*?)<\/title>/is', $html, $m)) {
            $title = trim(html_entity_decode(strip_tags($m[1])));
            if ($title === '') {
                $issues[] = ['issue' => 'empty_title', 'detail' => 'The page <title> tag is present but empty.'];
            }
        } else {
            $issues[] = ['issue' => 'no_title', 'detail' => 'No <title> tag found on the page.'];
        }

        if (!preg_match('/<meta[^>]+name=["\']description["\']/i', $html)) {
            $issues[] = ['issue' => 'no_meta_description', 'detail' => 'No meta description tag found — affects how the site appears in search results.'];
        }
        if ($elapsedMs > 3000) {
            $issues[] = ['issue' => 'slow_response', 'detail' => "The homepage took {$elapsedMs}ms to respond, which is slow."];
        }

        return [
            'reachable' => true,
            'http_status' => $status,
            'final_url' => $finalUrl,
            'uses_https' => str_starts_with($finalUrl, 'https://'),
            'response_time_ms' => $elapsedMs,
            'page_size_kb' => round(strlen($html) / 1024, 1),
            'title' => $title,
            'issues' => $issues,
            // A real, published email scraped from the page (mailto: or text) —
            // the business's own-domain address, or a free-provider address
            // they list. null when the site publishes none. Never guessed:
            // this is the only honest way to get an email for a lead that
            // Google Places only gave us a phone number for. applyFoundEmail()
            // uses it to fill an empty contact_email.
            'contact_email_found' => self::extractContactEmail($html, $finalUrl),
            'checked_at' => date('c'),
        ];
    }

    /** Free email providers a small business legitimately lists as its contact. */
    private const FREE_EMAIL_PROVIDERS = [
        'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk',
        'live.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'aol.com',
        'proton.me', 'protonmail.com',
    ];

    /** Vendor/boilerplate domains that show up in page source but aren't the business. */
    private const EMAIL_DOMAIN_BLOCKLIST = [
        'example.com', 'example.org', 'example.net', 'domain.com', 'yourdomain.com',
        'email.com', 'sentry.io', 'wixpress.com', 'wordpress.com', 'wordpress.org',
        'godaddy.com', 'squarespace.com', 'shopify.com',
    ];

    /**
     * Pulls the best real contact email published on the fetched page, or null.
     * Prefers an address on the business's own domain; otherwise accepts a
     * free-provider address they list. Deliberately rejects third-party vendor
     * domains, no-reply boxes, and asset false-positives (foo@2x.png), and
     * never fabricates one — an unverified guess would just bounce and hurt
     * deliverability.
     */
    private static function extractContactEmail(string $html, string $siteUrl): ?string
    {
        if (trim($html) === '') {
            return null;
        }

        $candidates = [];
        if (preg_match_all('/mailto:([^"\'?>\s]+)/i', $html, $m)) {
            foreach ($m[1] as $raw) {
                $candidates[] = rawurldecode($raw);
            }
        }
        if (preg_match_all('/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i', $html, $m2)) {
            $candidates = array_merge($candidates, $m2[0]);
        }

        $host = strtolower((string) parse_url($siteUrl, PHP_URL_HOST));
        $host = preg_replace('/^www\./', '', $host);

        $fallback = null;
        foreach ($candidates as $cand) {
            $email = strtolower(trim($cand));
            $email = preg_replace('/[?&].*$/', '', $email); // drop ?subject=… on mailto:
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                continue;
            }
            [$local, $domain] = explode('@', $email, 2);
            if (preg_match('/\.(png|jpe?g|gif|svg|webp|css|js|ico)$/', $domain)) {
                continue; // asset path that happens to match name@2x.png
            }
            if (preg_match('/(no-?reply|do-?not-?reply|donotreply|postmaster|mailer-daemon)/', $local)) {
                continue;
            }
            if (in_array($domain, self::EMAIL_DOMAIN_BLOCKLIST, true)) {
                continue;
            }
            // Their own domain is the strongest signal — take it immediately.
            if ($host !== '' && ($domain === $host || str_ends_with($domain, '.' . $host))) {
                return $email;
            }
            // A listed free-provider address is a fine fallback; anything else
            // (some theme vendor's support box) is skipped to avoid mis-targeting.
            if ($fallback === null && in_array($domain, self::FREE_EMAIL_PROVIDERS, true)) {
                $fallback = $email;
            }
        }

        return $fallback;
    }

    /**
     * Fills a lead's contact_email from an audit's discovered address, but
     * only when it's currently empty — a hand-entered email is never
     * overwritten. When the homepage published nothing, falls back to
     * Hunter.io enrichment (EmailEnrichment, opt-in via hunter_api_key —
     * returns only verified, confidence-gated addresses, never guesses).
     * Returns the email that was set, or null if nothing changed. Shared by
     * runAudit() and the Cold Outreach Engine's auto-draft.
     */
    public static function applyFoundEmail(\PDO $pdo, array $lead, array $findings): ?string
    {
        if (trim((string) ($lead['contact_email'] ?? '')) !== '') {
            return null;
        }

        $found = trim((string) ($findings['contact_email_found'] ?? ''));
        $source = 'published on their website';

        if ($found === '' && !empty($lead['website_url']) && EmailEnrichment::isConfigured()) {
            $enriched = EmailEnrichment::findEmail((string) $lead['website_url']);
            if ($enriched !== null) {
                $found = $enriched['email'];
                $source = "Hunter.io, confidence {$enriched['confidence']}%";
            }
        }

        if ($found === '') {
            return null;
        }

        // Note where the address came from so a later reader of the lead can
        // judge it — appended, never replacing hand-written notes.
        $note = "Email found ({$source}): {$found}";
        $pdo->prepare(
            "UPDATE marketing_leads SET contact_email = ?,
             notes = CASE WHEN notes IS NULL OR trim(notes) = '' THEN ? ELSE notes || char(10) || ? END,
             updated_at = datetime('now') WHERE id = ?"
        )->execute([$found, $note, $note, $lead['id']]);
        return $found;
    }

    /** Turns a raw curl error into a specific, plain-English finding — distinguishing "domain doesn't exist" from other failure modes matters for how compelling the pitch angle is. */
    private static function describeUnreachable(string $curlError): string
    {
        $lower = strtolower($curlError);
        if (str_contains($lower, 'could not resolve host') || str_contains($lower, 'name or service not known')) {
            return 'This domain does not appear to be registered, or its DNS is not pointing anywhere — there is no website live at this address at all.';
        }
        if (str_contains($lower, 'connection refused')) {
            return 'The server refused the connection — nothing is currently listening on this domain.';
        }
        if (str_contains($lower, 'timed out') || str_contains($lower, 'timeout')) {
            return 'The site took too long to respond and timed out.';
        }
        if (str_contains($lower, 'ssl') || str_contains($lower, 'certificate')) {
            return 'The site has a broken or expired SSL certificate — browsers will show visitors a security warning before they can even see the page.';
        }
        return 'The site could not be reached at all' . ($curlError !== '' ? " ({$curlError})" : '.');
    }

    /**
     * Shared by draftPitch() and draftCallScript() so both channels are
     * grounded in exactly the same real findings, worded the same
     * never-invent-a-problem way — one source of truth for what's true
     * about the lead, not two prompts that could quietly drift apart.
     */
    private static function findingsContext(array $findings): string
    {
        if (!empty($findings['no_website'])) {
            return "OPPORTUNITY TYPE: FIRST WEBSITE.\n"
                . "This business does not appear to have a website at all. Lead with a focused custom business "
                . "website that gives customers a credible place to understand the offer, enquire, book, or buy. "
                . "AI voice, WhatsApp, and workflow automation may be mentioned as later connected improvements, "
                . "but the first website is the primary offer. Do NOT claim their site has problems, since there "
                . "is no existing site to critique.";
        }

        $issues = $findings['issues'] ?? [];
        $issuesList = $issues
            ? implode("\n", array_map(fn($i) => "- {$i['detail']}", $issues))
            : '(no specific technical issues were found)';
        $opportunity = self::classifyOpportunity(true, $findings);
        $direction = $opportunity['type'] === 'broken_website'
            ? "OPPORTUNITY TYPE: BROKEN WEBSITE. Lead with restoring or rebuilding the website so customers can "
                . "reach the business reliably. After that, mention relevant AI voice, WhatsApp, or workflow "
                . "automation as an optional connected improvement."
            : "OPPORTUNITY TYPE: ACTIVE WEBSITE. Do not sell them a replacement website by default. Lead with AI "
                . "voice agents, WhatsApp/chat assistants, booking or follow-up automation, or another operational "
                . "improvement that can work with their existing website. Mention a website improvement only when "
                . "one of the verified findings below directly supports it.";
        return "{$direction}\n\nOnly reference these ACTUAL, verified findings from a real technical check of their "
            . "site — never invent, exaggerate, or imply any other problems:\n{$issuesList}\n\n"
            . "If no specific issues are listed, do not claim their site has problems — keep this brief and "
            . "focus the message on adding useful AI and automation around the active site.";
    }

    /**
     * Converts objective website evidence into one outreach lane. It is
     * computed from the audit rather than stored, so re-audits immediately
     * update both the dashboard and the next pitch.
     *
     * @param array<string,mixed>|null $findings
     * @return array{type:string,label:string,reason:string,priority:int}
     */
    public static function classifyOpportunity(bool $hasWebsite, ?array $findings): array
    {
        if (!$hasWebsite) {
            return [
                'type' => 'no_website',
                'label' => 'Needs a website',
                'reason' => 'No website is listed, so a focused first website is the primary opportunity.',
                'priority' => 90,
            ];
        }
        if ($findings === null) {
            return [
                'type' => 'audit_pending',
                'label' => 'Check website',
                'reason' => 'A website is listed but has not been checked yet.',
                'priority' => 60,
            ];
        }

        $brokenSignals = ['unreachable', 'error_status', 'blank_page', 'error_page_content'];
        $issues = is_array($findings['issues'] ?? null) ? $findings['issues'] : [];
        $issueTypes = array_map(
            static fn($issue): string => is_array($issue) ? (string) ($issue['issue'] ?? '') : '',
            $issues
        );
        if (($findings['reachable'] ?? true) === false || array_intersect($brokenSignals, $issueTypes)) {
            return [
                'type' => 'broken_website',
                'label' => 'Broken website',
                'reason' => (string) ($issues[0]['detail'] ?? 'The website failed its live availability check.'),
                'priority' => 100,
            ];
        }

        return [
            'type' => 'active_website',
            'label' => 'AI & automation',
            'reason' => $issues
                ? 'The website is live; offer automation first and mention only the verified improvements.'
                : 'The website is active, so lead with AI voice, WhatsApp/chat, and workflow automation.',
            'priority' => 75,
        ];
    }

    /** @return array{subject:string,body:string}|null */
    /**
     * Drafts the email pitch (subject + body, with the real signature block
     * appended) grounded only in $findings. Public so the Cold Outreach
     * Engine's auto-draft can generate a pitch unattended — same code path as
     * a hand-triggered generate-pitch, so the two can't drift.
     */
    /**
     * A real case study to cite in this lead's pitch, matched by the same
     * industry bucket its account demo was classified into. Requires a
     * demo to already exist (draft or published) since that's where the
     * industry classification comes from; returns null otherwise — never a
     * guessed-at industry.
     */
    public static function findCaseStudyForLead(\PDO $pdo, int $leadId): ?array
    {
        $demo = AccountDemoController::forLead($pdo, $leadId);
        if (!$demo) {
            return null;
        }
        $industry = $demo['personalization']['template'] ?? null;
        return $industry ? AccountDemoController::matchingCaseStudy($pdo, $industry) : null;
    }

    public static function draftPitch(string $businessName, array $findings, ?string $accountDemoUrl = null, ?int $leadId = null, ?array $caseStudy = null): ?array
    {
        $context = self::findingsContext($findings);

        $prompt = "You are drafting the BODY of a short, honest cold outreach email from Prince Caleb, a solo developer "
            . "who builds AI voice agents, chatbots, and business automations on 12+ years of web & mobile engineering, "
            . "to a business called \"{$businessName}\".\n\n{$context}\n\n"
            . "Structure: lead with one useful, specific observation tied to what's actually true above. Then use "
            . "1-2 sentences to show the practical improvement or free private walkthrough being offered, followed by a short \"here's how I can "
            . "help\" offer mentioning relevant services in general terms (AI voice agents that answer business "
            . "calls, WhatsApp/chat assistants, workflow automation, and connected booking or follow-up systems). "
            . "Mention custom web or mobile engineering only when the verified findings make that foundation relevant "
            . "WITHOUT claiming specific problems that weren't verified "
            . "above, then a low-pressure closing line inviting a reply.\n\n"
            . "Rules: 4-6 short sentences total, value-first, friendly and specific, never salesy or hyperbolic, no invented "
            . "statistics, no false urgency, no claims of financial harm or lost business you can't verify. "
            . "Do NOT include a sign-off or any contact details — those are appended separately.\n\n"
            . SharedAgentTools::publicContactContext() . "\n\n"
            . "Respond as JSON only: {\"subject\": \"...\", \"body\": \"...\"} — no markdown fences, no commentary.";

        $text = AiText::generate($prompt, null, 20);
        if ($text === null) {
            error_log('Marketing lead pitch: all configured AI providers (Gemini/OpenRouter/Groq) failed.');
            return null;
        }

        $text = trim(preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $text));
        $parsed = json_decode($text, true);
        if (!is_array($parsed) || empty($parsed['subject']) || empty($parsed['body'])) {
            error_log('Marketing lead pitch: could not parse JSON from model output: ' . substr($text, 0, 800));
            return null;
        }

        $body = (string) $parsed['body'];
        $campaign = 'cold_outreach_lead_' . ($leadId ?? 'unknown');
        // Fixed, factual line rather than a prompt instruction — guarantees
        // it's always present and worded exactly right, never dropped or
        // embellished by the model. True either way: this outreach (and the
        // walkthrough, when one exists) was drafted by the same kind of AI
        // agent system being pitched.
        $body .= $accountDemoUrl
            ? "\n\nOne more thing, for transparency: this note and the walkthrough below were drafted by the same kind of AI agent system I build for clients. It's literally how I run my own outreach."
            : "\n\nOne more thing, for transparency: this note was drafted by the same kind of AI agent system I build for clients. It's literally how I run my own outreach.";
        if ($accountDemoUrl) {
            $taggedDemoUrl = Utm::tagLinks($accountDemoUrl, $campaign, 'email', 'cold_outreach');
            $body .= "\n\nI put together a short outcome walkthrough for {$businessName}: {$taggedDemoUrl}";
        }
        // Real, admin-approved case study only — never AI-drafted or
        // paraphrased, so the metric quoted is exactly what's on file.
        if ($caseStudy) {
            $taggedCaseStudyUrl = Utm::tagLinks($caseStudy['url'], $campaign . '_case_study', 'email', 'cold_outreach');
            $body .= "\n\nFor context, a similar business, {$caseStudy['client_name']} ({$caseStudy['project_title']}), saw: {$caseStudy['metric']}. Full write-up: {$taggedCaseStudyUrl}";
        }
        return [
            'subject' => (string) $parsed['subject'],
            'body' => $body . "\n\n" . self::signatureBlock(),
        ];
    }

    /**
     * Talking points for a cold call, not a script to read verbatim — used
     * when a lead has a phone number but no email on file. Plain text, no
     * subject line and no JSON parsing needed (unlike draftPitch()) since
     * there's no separate subject/body split for a phone call.
     *
     * Public so the Cold Outreach Engine's auto-draft can prepare a call
     * script for a lead that has a phone number but no reachable email —
     * same code path as a hand-triggered phone pitch, so the two can't drift.
     *
     * @return string|null
     */
    public static function draftCallScript(string $businessName, array $findings): ?string
    {
        $context = self::findingsContext($findings);

        $prompt = "You are writing an identity-neutral call brief for a human-approved call to a business called "
            . "\"{$businessName}\". The call may be handled by Prince Caleb himself or by Lisa, his disclosed AI "
            . "assistant, so these must be shared talking points rather than words to read verbatim. Prince builds "
            . "AI voice agents, chatbots, and business automations on 12+ years of web & mobile engineering.\n\n{$context}\n\n"
            . "Structure: one short reason for the call tied to what's actually true above, 2-3 short talking "
            . "points to guide the conversation (services offered, "
            . "in general terms — AI voice agents that answer business calls, WhatsApp/chat assistants, workflow "
            . "automation, and connected booking or follow-up systems; mention custom software only when relevant), and one "
            . "likely objection with a brief, honest way to respond to it. Never salesy or pushy, no invented "
            . "statistics, no false urgency, no claims of financial harm or lost business that can't be "
            . "verified. Do not write a first-person introduction, do not say \"I'm Prince Caleb\", and do not imply "
            . "who is placing the call. The caller supplies the introduction: Prince introduces himself on a manual "
            . "call; Lisa identifies herself as an AI assistant calling on Prince's behalf.\n\n"
            . SharedAgentTools::publicContactContext() . "\n\n"
            . "Output plain text only — no markdown, no JSON, no scripted greeting, just the shared call brief with line breaks between "
            . "sections.";

        $text = AiText::generate($prompt, null, 20);
        if ($text === null) {
            error_log('Marketing lead call script: all configured AI providers (Gemini/OpenRouter/Groq) failed.');
            return null;
        }

        return trim(preg_replace('/^```\s*|```\s*$/m', '', $text));
    }

    /**
     * Short, human-reviewed WhatsApp introduction for phone-only prospects.
     * It remains stored under the legacy `phone` pitch channel until that
     * database constraint is migrated; the admin never sends it automatically.
     */
    public static function draftWhatsAppMessage(string $businessName, array $findings): ?string
    {
        $context = self::findingsContext($findings);
        $prompt = "Write one short, respectful WhatsApp introduction to {$businessName} from Prince Caleb. "
            . "It will be reviewed and sent manually, never automatically. Prince builds AI WhatsApp assistants, "
            . "booking workflows, business automation, and custom web/mobile systems.\n\n{$context}\n\n"
            . "Use only facts supported above. In 45-80 words: introduce Prince Caleb, mention one relevant "
            . "observation or opportunity, explain one useful outcome, and ask permission to share a short demo "
            . "or continue the conversation. Do not imply they requested contact, do not use pressure, urgency, "
            . "unverified loss claims, markdown, emojis, or a phone-call script. Output only the message body.\n\n"
            . SharedAgentTools::publicContactContext();

        $text = AiText::generate($prompt, null, 20);
        if ($text === null) {
            error_log('Marketing lead WhatsApp draft: all configured AI providers failed.');
            return null;
        }
        return trim(preg_replace('/^```\s*|```\s*$/m', '', $text));
    }

    /**
     * Real contact details pulled from the same Settings the rest of the
     * site uses — never AI-generated, so a pitch can never invent or
     * mangle a phone number/link. Omits anything not actually configured.
     */
    private static function signatureBlock(): string
    {
        $lines = ['— Prince Caleb', 'AI Voice Agents · Chatbots · Automation · Web & Mobile', '🌐 https://princecaleb.dev'];

        $voice = Settings::get('ai_voice_public_number') ?: '+44 7462 190814';
        $lines[] = "AI customer-service line: {$voice}";

        $whatsapp = Settings::get('social_whatsapp');
        if (!empty($whatsapp)) {
            $lines[] = "💬 WhatsApp: {$whatsapp}";
        }
        $phone = Settings::get('contact_phone') ?: '+233 20 804 9962';
        if (!empty($phone)) {
            $lines[] = "📞 {$phone}";
        }

        return implode("\n", $lines);
    }
}
