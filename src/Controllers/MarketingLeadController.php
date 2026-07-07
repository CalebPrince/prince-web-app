<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Database;
use App\Support\Response;
use App\Support\Settings;

/**
 * Internal outreach tool ("Developer's Edge"): admin tracks target
 * businesses, runs a real technical audit of each site (when one exists —
 * a business with no website yet is just as valid a lead), drafts an AI
 * pitch grounded only in the actual findings, and manually approves each
 * send — there is no bulk-send / auto-blast path, since these are
 * unsolicited contacts and every message should be a deliberate, reviewed
 * decision.
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
        }
        Response::json($rows);
    }

    /** POST /api/v1/admin/marketing-leads — body: {business_name, website_url?, contact_email?} */
    public static function store(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        $businessName = trim((string) ($data['business_name'] ?? ''));
        $websiteUrl = trim((string) ($data['website_url'] ?? ''));
        $contactEmail = trim((string) ($data['contact_email'] ?? ''));

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

        $pdo = Database::get();
        $pdo->prepare('INSERT INTO marketing_leads (business_name, website_url, contact_email) VALUES (?, ?, ?)')
            ->execute([$businessName, $websiteUrl ?: null, $contactEmail ?: null]);

        Response::json(['id' => (int) $pdo->lastInsertId()], 201);
    }

    /** PATCH /api/v1/admin/marketing-leads/{id} — body: any of business_name, website_url, contact_email, pitch_subject, pitch_body, notes, status */
    public static function update(array $params): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $pdo = Database::get();
        $lead = self::findOrFail($pdo, (int) $params['id']);

        $fields = [];
        $values = [];
        foreach (['business_name', 'website_url', 'contact_email', 'pitch_subject', 'pitch_body', 'notes'] as $key) {
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
        if (!$fields) {
            Response::json(['status' => 'updated']);
        }

        $values[] = $lead['id'];
        $pdo->prepare('UPDATE marketing_leads SET ' . implode(', ', $fields) . ", updated_at = datetime('now') WHERE id = ?")
            ->execute($values);

        Response::json(['status' => 'updated']);
    }

    /** DELETE /api/v1/admin/marketing-leads/{id} */
    public static function destroy(array $params): void
    {
        AuthMiddleware::requireAuth();
        Database::get()->prepare('DELETE FROM marketing_leads WHERE id = ?')->execute([(int) $params['id']]);
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
        if (!self::isSafeUrl($lead['website_url'])) {
            Response::error('That URL cannot be audited (invalid, or resolves to a private/internal address).', 422);
        }

        $findings = self::performAudit($lead['website_url']);

        $pdo->prepare("UPDATE marketing_leads SET audit_findings = ?, status = 'audited', updated_at = datetime('now') WHERE id = ?")
            ->execute([json_encode($findings), $lead['id']]);

        Response::json(['findings' => $findings]);
    }

    /** POST /api/v1/admin/marketing-leads/{id}/generate-pitch — drafts a pitch grounded only in the stored audit findings */
    public static function generatePitch(array $params): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $lead = self::findOrFail($pdo, (int) $params['id']);

        // A lead with no website has nothing to audit — the pitch is just a
        // generic "let's build your first site" intro. A lead WITH a website
        // must still be audited first, so its pitch is always grounded in
        // real findings, never guessed at.
        if (!empty($lead['website_url']) && empty($lead['audit_findings'])) {
            Response::error('Run the audit first — the pitch is only ever based on real findings.', 422);
        }

        $geminiKey = Settings::get('gemini_api_key');
        if (empty($geminiKey)) {
            Response::error('No Gemini API key configured — add one in Admin → Settings.', 503);
        }

        $findings = $lead['audit_findings'] ? (json_decode($lead['audit_findings'], true) ?: []) : ['no_website' => true];
        $pitch = self::draftPitch($geminiKey, $lead['business_name'], $findings);
        if ($pitch === null) {
            Response::error('Pitch generation failed — please try again in a moment.', 502);
        }

        $pdo->prepare(
            "UPDATE marketing_leads SET pitch_subject = ?, pitch_body = ?, status = 'pitch_ready', updated_at = datetime('now') WHERE id = ?"
        )->execute([$pitch['subject'], $pitch['body'], $lead['id']]);

        Response::json($pitch);
    }

    /**
     * POST /api/v1/admin/marketing-leads/{id}/send — records that the admin
     * sent it. There is no server-side auto-send: the frontend opens a
     * mailto: draft in the admin's own mail client first, and this endpoint
     * only fires after they've actually sent it themselves.
     */
    public static function markSent(array $params): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $lead = self::findOrFail($pdo, (int) $params['id']);

        if (empty($lead['contact_email'])) {
            Response::error('No contact email on file for this lead.', 422);
        }

        $pdo->prepare("UPDATE marketing_leads SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
            ->execute([$lead['id']]);

        Response::json(['status' => 'updated']);
    }

    // ---- internals ----------------------------------------------------------

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

    /** Blocks anything that isn't a plain public http(s) host — no loopback/private/reserved targets. */
    private static function isSafeUrl(string $url): bool
    {
        $parts = parse_url($url);
        if (!$parts || !in_array($parts['scheme'] ?? '', ['http', 'https'], true) || empty($parts['host'])) {
            return false;
        }
        $host = $parts['host'];
        if (strtolower($host) === 'localhost') {
            return false;
        }
        $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : gethostbyname($host);
        if ($ip === $host && !filter_var($host, FILTER_VALIDATE_IP)) {
            return false; // DNS resolution failed
        }
        return (bool) filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
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
            return [
                'error' => 'Could not reach the site' . ($curlError !== '' ? ": {$curlError}" : '.'),
                'checked_at' => date('c'),
            ];
        }

        $issues = [];
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

    /** @return array{subject:string,body:string}|null */
    private static function draftPitch(string $apiKey, string $businessName, array $findings): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        if (!empty($findings['no_website'])) {
            $context = "This business does not appear to have a website at all. Draft a short, friendly email "
                . "introducing Prince's web & mobile development services, focused on the opportunity of "
                . "getting a first professional website/online presence — do NOT claim their site has any "
                . "problems, since there is no existing site to critique.";
        } else {
            $issues = $findings['issues'] ?? [];
            $issuesList = $issues
                ? implode("\n", array_map(fn($i) => "- {$i['detail']}", $issues))
                : '(no specific technical issues were found)';
            $context = "Only reference these ACTUAL, verified findings from a real technical check of their "
                . "site — never invent, exaggerate, or imply any other problems:\n{$issuesList}\n\n"
                . "If no specific issues are listed, do not claim their site has problems — write a brief, "
                . "generic note introducing Prince's services instead.";
        }

        $prompt = "You are drafting a short, honest cold outreach email from Prince Caleb, a web & mobile "
            . "developer, to a business called \"{$businessName}\" about their website.\n\n{$context}\n\n"
            . "Rules: 3-5 short sentences, friendly and specific, not salesy or hyperbolic, no false urgency, "
            . "ends with a low-pressure invitation to reply if interested. Sign off as Prince Caleb.\n\n"
            . "Respond as JSON only: {\"subject\": \"...\", \"body\": \"...\"} — no markdown fences, no commentary.";

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' . $apiKey;
        $body = json_encode(['contents' => [['parts' => [['text' => $prompt]]]]]);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_TIMEOUT => 20,
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($response === false || $status !== 200) {
            return null;
        }

        $decoded = json_decode($response, true);
        $text = $decoded['candidates'][0]['content']['parts'][0]['text'] ?? null;
        if ($text === null) {
            return null;
        }

        $text = trim(preg_replace('/^```(?:json)?\s*|```\s*$/m', '', $text));
        $parsed = json_decode($text, true);
        if (!is_array($parsed) || empty($parsed['subject']) || empty($parsed['body'])) {
            return null;
        }

        return ['subject' => (string) $parsed['subject'], 'body' => (string) $parsed['body']];
    }
}
