<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\ActivityLog;
use App\Support\AiText;
use App\Support\Automations;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

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
 * returns candidates for review; adding them (bulkStore()) is still a
 * separate, explicit admin action, same as every other step here.
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
        foreach ($rows as &$row) {
            $row['audit_findings'] = $row['audit_findings'] ? json_decode($row['audit_findings'], true) : null;
            // Dossier's research brief (DossierController) — decoded here so
            // the Marketing Leads page gets a structured object to render.
            $row['research_findings'] = $row['research_findings'] ? json_decode($row['research_findings'], true) : null;
        }
        Response::json($rows);
    }

    /** POST /api/v1/admin/marketing-leads — body: {business_name, website_url?, contact_email?, contact_phone?} */
    public static function store(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $businessName = trim((string) ($data['business_name'] ?? ''));
        $websiteUrl = trim((string) ($data['website_url'] ?? ''));
        $contactEmail = trim((string) ($data['contact_email'] ?? ''));
        $contactPhone = trim((string) ($data['contact_phone'] ?? ''));
        [$estimatedValue, $currency] = self::opportunityValue($data);

        if ($businessName === '' || mb_strlen($businessName) > 255) {
            Response::error('Business name is required.', 422);
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
        $pdo->prepare('INSERT INTO marketing_leads (business_name, website_url, contact_email, contact_phone, estimated_value, currency) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$businessName, $websiteUrl ?: null, $contactEmail ?: null, $contactPhone ?: null, $estimatedValue, $currency]);

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
        foreach (['business_name', 'website_url', 'contact_email', 'contact_phone', 'pitch_subject', 'pitch_body', 'notes'] as $key) {
            if (array_key_exists($key, $data)) {
                $fields[] = "$key = ?";
                $values[] = trim((string) $data[$key]) !== '' ? trim((string) $data[$key]) : null;
            }
        }
        if (array_key_exists('status', $data)) {
            if (!in_array($data['status'], self::STATUSES, true)) {
                Response::error('Invalid status.', 422);
            }
            $fields[] = 'status = ?';
            $values[] = $data['status'];
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

        $pdo->prepare('DELETE FROM marketing_leads WHERE id = ?')->execute([$id]);
        ActivityLog::log($user, 'deleted', 'marketing_lead', $id, $name ?: null);
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

        Response::json(['findings' => $findings]);
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

        if ($channel === 'phone') {
            $script = self::draftCallScript($lead['business_name'], $findings);
            if ($script === null) {
                Response::error('Call script generation failed — please try again in a moment.', 502);
            }
            $pdo->prepare(
                "UPDATE marketing_leads SET pitch_subject = NULL, pitch_body = ?, pitch_channel = 'phone',
                 status = 'pitch_ready', updated_at = datetime('now') WHERE id = ?"
            )->execute([$script, $lead['id']]);
            Response::json(['channel' => 'phone', 'subject' => null, 'body' => $script]);
        }

        $pitch = self::draftPitch($lead['business_name'], $findings);
        if ($pitch === null) {
            Response::error('Pitch generation failed — please try again in a moment.', 502);
        }

        $pdo->prepare(
            "UPDATE marketing_leads SET pitch_subject = ?, pitch_body = ?, pitch_channel = 'email',
             status = 'pitch_ready', updated_at = datetime('now') WHERE id = ?"
        )->execute([$pitch['subject'], $pitch['body'], $lead['id']]);

        Response::json(['channel' => 'email'] + $pitch);
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
                'name' => $lead['business_name'] ?: null,
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
    private static function searchBusinesses(string $apiKey, string $query): ?array
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
            CURLOPT_POSTFIELDS => json_encode(['q' => $query]),
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
    private static function performAudit(string $url): array
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
            'checked_at' => date('c'),
        ];
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
            return "This business does not appear to have a website at all. Focus on the opportunity of "
                . "getting a first professional website/online presence — do NOT claim their site has any "
                . "problems, since there is no existing site to critique.";
        }

        $issues = $findings['issues'] ?? [];
        $issuesList = $issues
            ? implode("\n", array_map(fn($i) => "- {$i['detail']}", $issues))
            : '(no specific technical issues were found)';
        return "Only reference these ACTUAL, verified findings from a real technical check of their "
            . "site — never invent, exaggerate, or imply any other problems:\n{$issuesList}\n\n"
            . "If no specific issues are listed, do not claim their site has problems — keep this brief and "
            . "generic instead.";
    }

    /** @return array{subject:string,body:string}|null */
    private static function draftPitch(string $businessName, array $findings): ?array
    {
        $context = self::findingsContext($findings);

        $prompt = "You are drafting the BODY of a short, honest cold outreach email from Prince Caleb, a web & "
            . "mobile developer, to a business called \"{$businessName}\".\n\n{$context}\n\n"
            . "Structure: 1-2 sentences tied to what's actually true above, then a short \"here's how I can "
            . "help\" offer mentioning relevant services in general terms (custom websites, mobile apps, "
            . "booking/ordering systems, automation) WITHOUT claiming specific problems that weren't verified "
            . "above, then a low-pressure closing line inviting a reply.\n\n"
            . "Rules: 4-6 short sentences total, friendly and specific, never salesy or hyperbolic, no invented "
            . "statistics, no false urgency, no claims of financial harm or lost business you can't verify. "
            . "Do NOT include a sign-off or any contact details — those are appended separately.\n\n"
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

        return [
            'subject' => (string) $parsed['subject'],
            'body' => (string) $parsed['body'] . "\n\n" . self::signatureBlock(),
        ];
    }

    /**
     * Talking points for a cold call, not a script to read verbatim — used
     * when a lead has a phone number but no email on file. Plain text, no
     * subject line and no JSON parsing needed (unlike draftPitch()) since
     * there's no separate subject/body split for a phone call.
     *
     * @return string|null
     */
    private static function draftCallScript(string $businessName, array $findings): ?string
    {
        $context = self::findingsContext($findings);

        $prompt = "You are writing short talking points — not a script to read verbatim — for Prince Caleb, a "
            . "web & mobile developer, to use on a cold call to a business called \"{$businessName}\".\n\n{$context}\n\n"
            . "Structure: a natural one-sentence opening introducing himself and why he's calling (tied to "
            . "what's actually true above), 2-3 short bullet points to guide the conversation (services offered, "
            . "in general terms — custom websites, mobile apps, booking/ordering systems, automation), and one "
            . "likely objection with a brief, honest way to respond to it. Never salesy or pushy, no invented "
            . "statistics, no false urgency, no claims of financial harm or lost business that can't be "
            . "verified.\n\n"
            . "Output plain text only — no markdown, no JSON, just the talking points with line breaks between "
            . "sections.";

        $text = AiText::generate($prompt, null, 20);
        if ($text === null) {
            error_log('Marketing lead call script: all configured AI providers (Gemini/OpenRouter/Groq) failed.');
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
        $lines = ['— Prince Caleb', 'Web & Mobile App Developer', '🌐 https://princecaleb.dev'];

        $whatsapp = Settings::get('social_whatsapp');
        if (!empty($whatsapp)) {
            $lines[] = "💬 WhatsApp: {$whatsapp}";
        }
        $phone = Settings::get('contact_phone');
        if (!empty($phone)) {
            $lines[] = "📞 {$phone}";
        }

        return implode("\n", $lines);
    }
}
