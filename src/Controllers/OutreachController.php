<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Middleware\AuthMiddleware;
use App\Support\Automations;
use App\Support\Database;
use App\Support\EmailTemplate;
use App\Support\Mailer;
use App\Support\Response;
use App\Support\Settings;
use App\Support\SharedAgentTools;

/**
 * The Cold Outreach Engine — the automated sending layer that turns the
 * existing marketing_leads funnel (discover -> research -> audit ->
 * pitch_ready, all still done by hand) into "send N personalised emails a
 * day, every day" without Caleb opening his mail client 50 times.
 *
 * By default it only sends pitches Caleb has already reviewed: a lead is
 * eligible when its status is 'pitch_ready' with an email-channel pitch and a
 * real contact_email. run() is the whole engine, called by
 * database/send_cold_outreach.php on a cron; the admin endpoints expose the
 * dials (on/off, daily cap, auto-draft) and a live counter.
 *
 * Auto-draft (outreach_autodraft, OFF by default) is the opt-in that keeps
 * the queue full for "50 a day, forever" without hand-pitching every lead:
 * when on, each run audits + drafts just enough raw leads (status pending /
 * audited with a contact_email) to top today's queue up to the cap, then
 * sends them in the same run. It reuses MarketingLeadController's exact
 * audit and pitch code, so an auto-drafted pitch is identical to a
 * hand-triggered one and stays grounded in real audit findings — never
 * invented. Drafting is bounded per run (AUTODRAFT_PER_RUN) so one cron tick
 * can't stall on dozens of sequential site audits + AI calls. Turning
 * auto-draft off leaves the reviewed-only behaviour exactly as it was.
 *
 * Guardrails, because cold email done wrong is spam:
 *  - disabled by default (outreach_enabled must be '1');
 *  - a daily cap (outreach_daily_cap, default 50) counted from outreach_sends;
 *  - UNIQUE(lead_id) in outreach_sends => a prospect is emailed at most once;
 *  - every send carries a one-click unsubscribe that suppresses the address
 *    globally (email_suppressions) and stops any drip follow-up for it;
 *  - the sender skips suppressed addresses and anyone who already opted out
 *    of the drip sequence.
 *
 * On a successful send it fires the same 'marketing_pitch_sent' automation
 * trigger MarketingLeadController::markSent() does, so the follow-up
 * sequence a hand-sent pitch would start still starts here.
 */
class OutreachController
{
    private const DEFAULT_DAILY_CAP = 50;
    private const MAX_DAILY_CAP = 500;
    private const BASE_URL = 'https://princecaleb.dev';
    /** Most leads auto-draft will audit + pitch in a single cron run (bounds runtime). */
    private const AUTODRAFT_PER_RUN = 10;

    /**
     * The engine. Sends up to (daily cap − already sent today) reviewed
     * pitches and returns a summary for the cron to echo. Never throws on a
     * single bad send — one failure leaves that lead pitch_ready for the
     * next run and the loop continues, same discipline as send_drip_emails.php.
     *
     * @return array{enabled:bool,sent:int,failed:int,drafted:int,call_scripts:int,cap:int,sent_today:int,remaining:int}
     */
    public static function run(): array
    {
        $pdo = Database::get();
        $cap = self::dailyCap();

        if (Settings::get('outreach_enabled') !== '1') {
            return ['enabled' => false, 'sent' => 0, 'failed' => 0, 'drafted' => 0, 'call_scripts' => 0, 'cap' => $cap, 'sent_today' => self::sentToday($pdo), 'remaining' => 0];
        }

        $sentToday = self::sentToday($pdo);
        $remaining = max(0, $cap - $sentToday);
        if ($remaining === 0) {
            return ['enabled' => true, 'sent' => 0, 'failed' => 0, 'drafted' => 0, 'call_scripts' => 0, 'cap' => $cap, 'sent_today' => $sentToday, 'remaining' => 0];
        }

        // Auto-draft (opt-in): top the reviewed queue up to today's remaining
        // cap so there's something to send, bounded per run. Runs before the
        // send loop so freshly-drafted leads go out in the same tick. Phone
        // leads in the batch become call scripts for the call queue instead.
        $drafted = ['emails' => 0, 'calls' => 0];
        if (Settings::get('outreach_autodraft') === '1') {
            $needed = $remaining - self::eligibleCount($pdo);
            if ($needed > 0) {
                $drafted = self::autoDraft($pdo, min($needed, self::AUTODRAFT_PER_RUN));
            }
        }

        $stmt = $pdo->prepare(self::ELIGIBLE_SQL . ' ORDER BY ml.created_at ASC LIMIT ?');
        $stmt->execute([$remaining]);
        $leads = $stmt->fetchAll();

        $sent = 0;
        $failed = 0;
        foreach ($leads as $lead) {
            $email = trim((string) ($lead['contact_email'] ?? ''));
            $subject = trim((string) ($lead['pitch_subject'] ?? ''));
            $body = trim((string) ($lead['pitch_body'] ?? ''));
            // The eligibility SQL already enforced these, but a malformed
            // address that slipped past a bulk import shouldn't cost a send.
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $subject === '' || $body === '') {
                continue;
            }

            $token = trim((string) ($lead['unsubscribe_token'] ?? '')) ?: self::assignToken($pdo, (int) $lead['id']);
            $unsubscribeUrl = self::BASE_URL . '/api/v1/outreach/unsubscribe?token=' . $token;

            $text = $body . "\n\n—\nNot the right time? Unsubscribe and I won't email you again:\n" . $unsubscribeUrl;
            $preheader = 'A quick note about ' . ($lead['business_name'] ?: 'your website');
            $html = EmailTemplate::wrapMarketing($body, $preheader, $unsubscribeUrl);

            if (!Mailer::sendHtml($email, $subject, $html, $text)) {
                $failed++;
                continue;
            }

            // Record the send FIRST (idempotency anchor), then advance the
            // lead. INSERT OR IGNORE so an overlapping run that already
            // logged this lead can't double-count or double-send.
            $inserted = $pdo->prepare(
                'INSERT OR IGNORE INTO outreach_sends (lead_id, recipient_email, subject, body) VALUES (?, ?, ?, ?)'
            );
            $inserted->execute([$lead['id'], $email, $subject, $body]);

            $pdo->prepare("UPDATE marketing_leads SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
                ->execute([$lead['id']]);

            self::fireFollowUp($pdo, $lead);
            $sent++;
        }

        return [
            'enabled' => true,
            'sent' => $sent,
            'failed' => $failed,
            'drafted' => $drafted['emails'],
            'call_scripts' => $drafted['calls'],
            'cap' => $cap,
            'sent_today' => $sentToday + $sent,
            'remaining' => max(0, $remaining - $sent),
        ];
    }

    /**
     * Auto-draft up to $limit raw leads into pitch_ready state on their best
     * channel: audit the site if it has one and hasn't been audited (which
     * also mines/enriches an email), then draft an email pitch when the lead
     * is emailable — otherwise a call script when it has a phone number, so
     * phone-only leads feed the call queue instead of being dead ends. A
     * lead that can't be audited safely, or whose generation fails, is
     * skipped and left for the next run or a manual pass — never half-baked.
     *
     * @return array{emails:int,calls:int} leads that reached pitch_ready per channel
     */
    private static function autoDraft(\PDO $pdo, int $limit): array
    {
        $stmt = $pdo->prepare(self::DRAFTABLE_SQL . ' ORDER BY ml.created_at ASC LIMIT ?');
        $stmt->execute([$limit]);
        $leads = $stmt->fetchAll();

        $emails = 0;
        $calls = 0;
        foreach ($leads as $lead) {
            $website = trim((string) ($lead['website_url'] ?? ''));
            $findings = ['no_website' => true];

            if ($website !== '') {
                $auditJson = trim((string) ($lead['audit_findings'] ?? ''));
                if ($auditJson === '') {
                    // Never audited yet — do it now, with the same SSRF guard runAudit() uses.
                    if (!SharedAgentTools::isSafeUrl($website)) {
                        continue; // unsafe/unresolvable target: leave for a human to judge
                    }
                    $findings = MarketingLeadController::performAudit($website);
                    $pdo->prepare("UPDATE marketing_leads SET audit_findings = ?, status = 'audited', updated_at = datetime('now') WHERE id = ?")
                        ->execute([json_encode($findings), $lead['id']]);
                    // Mine a published email (or Hunter-enrich) if we had none —
                    // this is what makes a phone-only, website-having lead
                    // emailable in the first place.
                    $foundEmail = MarketingLeadController::applyFoundEmail($pdo, $lead, $findings);
                    if ($foundEmail !== null) {
                        $lead['contact_email'] = $foundEmail;
                    }
                } else {
                    $findings = json_decode($auditJson, true) ?: ['no_website' => true];
                }
            }

            $email = trim((string) ($lead['contact_email'] ?? ''));
            $phone = trim((string) ($lead['contact_phone'] ?? ''));

            if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
                // Emailable — the richer channel wins.
                $pitch = MarketingLeadController::draftPitch((string) $lead['business_name'], $findings);
                if ($pitch === null) {
                    continue; // generation failed — try again next run rather than send nothing
                }
                $pdo->prepare(
                    "UPDATE marketing_leads SET pitch_subject = ?, pitch_body = ?, pitch_channel = 'email',
                     status = 'pitch_ready', updated_at = datetime('now') WHERE id = ?"
                )->execute([$pitch['subject'], $pitch['body'], $lead['id']]);
                $emails++;
            } elseif ($phone !== '') {
                // No reachable email but a phone number — prepare talking
                // points for the call queue instead of dead-ending the lead.
                $script = MarketingLeadController::draftCallScript((string) $lead['business_name'], $findings);
                if ($script === null) {
                    continue;
                }
                $pdo->prepare(
                    "UPDATE marketing_leads SET pitch_subject = NULL, pitch_body = ?, pitch_channel = 'phone',
                     status = 'pitch_ready', updated_at = datetime('now') WHERE id = ?"
                )->execute([$script, $lead['id']]);
                $calls++;
            }
            // Neither channel: stays audited with no contact route — the
            // candidate query won't pick it again, no loop.
        }

        return ['emails' => $emails, 'calls' => $calls];
    }

    /** GET /api/v1/admin/outreach/stats — live engine counters for the admin panel. */
    public static function stats(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $cap = self::dailyCap();
        $sentToday = self::sentToday($pdo);

        Response::json([
            'enabled' => Settings::get('outreach_enabled') === '1',
            'autodraft' => Settings::get('outreach_autodraft') === '1',
            'daily_cap' => $cap,
            'sent_today' => $sentToday,
            'remaining_today' => max(0, $cap - $sentToday),
            'eligible_queue' => self::eligibleCount($pdo),
            'draftable_queue' => self::draftableCount($pdo),
            'sent_total' => (int) $pdo->query('SELECT COUNT(*) FROM outreach_sends')->fetchColumn(),
            'suppressed' => (int) $pdo->query('SELECT COUNT(*) FROM email_suppressions')->fetchColumn(),
            'call_queue' => (int) $pdo->query(
                "SELECT COUNT(*) FROM marketing_leads
                 WHERE status = 'pitch_ready' AND pitch_channel = 'phone'
                   AND contact_phone IS NOT NULL AND trim(contact_phone) <> ''"
            )->fetchColumn(),
            'calls_today' => self::callsToday($pdo),
        ]);
    }

    /** POST /api/v1/admin/outreach/settings — body: {enabled: bool, daily_cap: int}. */
    public static function updateSettings(): void
    {
        AuthMiddleware::requireAuth();
        $data = json_decode(file_get_contents('php://input'), true) ?? [];

        if (array_key_exists('enabled', $data)) {
            Settings::set('outreach_enabled', !empty($data['enabled']) ? '1' : '0');
        }
        if (array_key_exists('autodraft', $data)) {
            Settings::set('outreach_autodraft', !empty($data['autodraft']) ? '1' : '0');
        }
        if (array_key_exists('daily_cap', $data)) {
            $cap = (int) $data['daily_cap'];
            if ($cap < 1 || $cap > self::MAX_DAILY_CAP) {
                Response::error('Daily cap must be between 1 and ' . self::MAX_DAILY_CAP . '.', 422);
            }
            Settings::set('outreach_daily_cap', (string) $cap);
        }
        if (array_key_exists('daily_call_target', $data)) {
            $target = (int) $data['daily_call_target'];
            if ($target < 1 || $target > 200) {
                Response::error('Daily call target must be between 1 and 200.', 422);
            }
            Settings::set('outreach_daily_call_target', (string) $target);
        }

        self::stats();
    }

    /**
     * GET /api/v1/admin/outreach/scoreboard — the daily-ritual scoreboard:
     * today's emails/calls/social-post against their targets, a streak of
     * consecutive active days, and a 14-day history for the activity bars.
     * "Active" deliberately means at least one outreach touch (an email
     * sent, a call logged, or a social post published) — the streak exists
     * to enforce "never a zero day", not to punish a day the cap wasn't hit.
     * Today doesn't break the streak while it's still in progress: an
     * inactive today just isn't counted yet.
     */
    public static function scoreboard(): void
    {
        AuthMiddleware::requireAuth();
        Response::json(self::computeScoreboard(Database::get()));
    }

    /**
     * The scoreboard computation, separated from the HTTP handler so it can
     * be exercised directly against a database (and reused by e.g. Chief's
     * daily brief later) without faking an admin session.
     *
     * @return array{today:array{emails:int,calls:int,social:bool},targets:array{emails:int,calls:int},streak:int,history:list<array{date:string,emails:int,calls:int,social:bool}>}
     */
    public static function computeScoreboard(\PDO $pdo): array
    {
        // Per-day activity for the last 60 days (streak window), one map
        // keyed YYYY-MM-DD. 60 days is plenty: a longer streak than that is
        // better told by the history the admin already lived through.
        $days = [];
        $bump = function (string $day, string $key, int $n = 1) use (&$days): void {
            if ($day === '') {
                return;
            }
            $days[$day] ??= ['emails' => 0, 'calls' => 0, 'social' => false];
            if ($key === 'social') {
                $days[$day]['social'] = true;
            } else {
                $days[$day][$key] += $n;
            }
        };

        foreach ($pdo->query("SELECT date(sent_at) AS d, COUNT(*) AS n FROM outreach_sends WHERE sent_at >= datetime('now', '-60 days') GROUP BY d") as $row) {
            $bump((string) $row['d'], 'emails', (int) $row['n']);
        }
        foreach ($pdo->query("SELECT date(called_at) AS d, COUNT(*) AS n FROM call_log WHERE called_at >= datetime('now', '-60 days') GROUP BY d") as $row) {
            $bump((string) $row['d'], 'calls', (int) $row['n']);
        }
        foreach ($pdo->query("SELECT DISTINCT date(published_at) AS d FROM social_post_drafts WHERE published_at IS NOT NULL AND published_at >= datetime('now', '-60 days')") as $row) {
            $bump((string) $row['d'], 'social');
        }

        $isActive = fn(array $day): bool => $day['emails'] > 0 || $day['calls'] > 0 || $day['social'];

        // Streak: walk back from today. An inactive today is skipped (still
        // in progress), an inactive earlier day ends the count.
        $streak = 0;
        for ($i = 0; $i <= 60; $i++) {
            $key = date('Y-m-d', strtotime("-{$i} days"));
            $day = $days[$key] ?? null;
            if ($day !== null && $isActive($day)) {
                $streak++;
            } elseif ($i > 0) {
                break;
            }
        }

        $history = [];
        for ($i = 13; $i >= 0; $i--) {
            $key = date('Y-m-d', strtotime("-{$i} days"));
            $day = $days[$key] ?? ['emails' => 0, 'calls' => 0, 'social' => false];
            $history[] = ['date' => $key, 'emails' => $day['emails'], 'calls' => $day['calls'], 'social' => $day['social']];
        }

        $today = $days[date('Y-m-d')] ?? ['emails' => 0, 'calls' => 0, 'social' => false];
        $callTarget = max(1, min(200, (int) (Settings::get('outreach_daily_call_target') ?: 10)));

        return [
            'today' => [
                'emails' => $today['emails'],
                'calls' => $today['calls'],
                'social' => $today['social'],
            ],
            'targets' => [
                'emails' => self::dailyCap(),
                'calls' => $callTarget,
            ],
            'streak' => $streak,
            'history' => $history,
        ];
    }

    /** Outcomes that end a lead's time in the call queue, and where they send it. */
    private const CALL_TERMINAL_OUTCOMES = [
        'connected' => 'sent',
        'interested' => 'sent',
        'not_interested' => 'sent',
        'wrong_number' => 'rejected',
    ];
    private const CALL_OUTCOMES = ['connected', 'voicemail', 'no_answer', 'wrong_number', 'not_interested', 'interested', 'callback'];

    /**
     * GET /api/v1/admin/outreach/call-queue — today's call list: every
     * phone-channel lead with a reviewed call script, oldest first, with its
     * attempt history summarised. Leads stay queued through no-answer/
     * voicemail/callback outcomes and leave on a terminal one, so this is a
     * working list, not a one-shot.
     */
    public static function callQueue(): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();

        $rows = $pdo->query(
            "SELECT ml.id, ml.business_name, ml.contact_phone, ml.website_url, ml.pitch_body,
                    (SELECT COUNT(*) FROM call_log cl WHERE cl.lead_id = ml.id) AS attempts,
                    (SELECT cl.outcome FROM call_log cl WHERE cl.lead_id = ml.id ORDER BY cl.called_at DESC, cl.id DESC LIMIT 1) AS last_outcome,
                    (SELECT cl.called_at FROM call_log cl WHERE cl.lead_id = ml.id ORDER BY cl.called_at DESC, cl.id DESC LIMIT 1) AS last_called_at
             FROM marketing_leads ml
             WHERE ml.status = 'pitch_ready'
               AND ml.pitch_channel = 'phone'
               AND ml.contact_phone IS NOT NULL AND trim(ml.contact_phone) <> ''
             ORDER BY last_called_at IS NOT NULL, last_called_at ASC, ml.created_at ASC"
        )->fetchAll();

        Response::json([
            'queue' => $rows,
            'calls_today' => self::callsToday($pdo),
        ]);
    }

    /**
     * POST /api/v1/admin/outreach/call-log/{id} — body: {outcome, notes?}.
     * Records a call attempt against a lead and advances the lead when the
     * outcome is terminal. This only ever fires after Caleb has actually
     * made the call himself — the engine never dials anything.
     */
    public static function logCall(array $params): void
    {
        AuthMiddleware::requireAuth();
        $pdo = Database::get();
        $leadId = (int) $params['id'];

        $stmt = $pdo->prepare('SELECT * FROM marketing_leads WHERE id = ?');
        $stmt->execute([$leadId]);
        $lead = $stmt->fetch();
        if (!$lead) {
            Response::error('Lead not found.', 404);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $outcome = trim((string) ($data['outcome'] ?? ''));
        if (!in_array($outcome, self::CALL_OUTCOMES, true)) {
            Response::error('Invalid call outcome.', 422);
        }
        $notes = trim((string) ($data['notes'] ?? '')) ?: null;
        if ($notes !== null && mb_strlen($notes) > 2000) {
            Response::error('Notes are too long (2000 characters max).', 422);
        }

        $pdo->prepare('INSERT INTO call_log (lead_id, outcome, notes) VALUES (?, ?, ?)')
            ->execute([$leadId, $outcome, $notes]);

        $newStatus = self::CALL_TERMINAL_OUTCOMES[$outcome] ?? null;
        if ($newStatus !== null) {
            $pdo->prepare(
                $newStatus === 'sent'
                    ? "UPDATE marketing_leads SET status = 'sent', sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
                    : "UPDATE marketing_leads SET status = 'rejected', updated_at = datetime('now') WHERE id = ?"
            )->execute([$leadId]);
        }

        Response::json([
            'logged' => true,
            'lead_status' => $newStatus ?? $lead['status'],
            'calls_today' => self::callsToday($pdo),
        ]);
    }

    /**
     * GET /api/v1/outreach/unsubscribe?token=... — public, linked from every
     * automated pitch. One click suppresses the address everywhere: it goes
     * on the global do-not-email list, any drip follow-up for it is stopped,
     * and the lead itself is marked rejected so it never re-enters the queue.
     */
    public static function unsubscribe(): void
    {
        $token = trim((string) ($_GET['token'] ?? ''));
        if ($token !== '') {
            $pdo = Database::get();
            $stmt = $pdo->prepare('SELECT contact_email FROM marketing_leads WHERE unsubscribe_token = ?');
            $stmt->execute([$token]);
            $email = $stmt->fetchColumn();

            if ($email !== false && trim((string) $email) !== '') {
                $email = trim((string) $email);
                $pdo->prepare('INSERT OR IGNORE INTO email_suppressions (email, reason) VALUES (?, ?)')
                    ->execute([strtolower($email), 'outreach_unsubscribe']);
                $pdo->prepare("UPDATE drip_enrollments SET status = 'stopped' WHERE lower(email) = lower(?)")
                    ->execute([$email]);
                $pdo->prepare("UPDATE marketing_leads SET status = 'rejected', updated_at = datetime('now') WHERE unsubscribe_token = ?")
                    ->execute([$token]);
            }
        }

        // Same landing page the drip/newsletter opt-outs use.
        header('Location: /newsletter-unsubscribed.html');
        exit;
    }

    // --- internals ---------------------------------------------------------

    /**
     * A lead is eligible when Caleb has produced an email pitch for it and it
     * hasn't already been sent or opted out. Kept as one constant so run()
     * and eligibleCount() can never drift out of agreement on "the queue".
     */
    private const ELIGIBLE_SQL =
        "SELECT ml.* FROM marketing_leads ml
         WHERE ml.status = 'pitch_ready'
           AND ml.pitch_channel = 'email'
           AND ml.contact_email IS NOT NULL AND trim(ml.contact_email) <> ''
           AND ml.pitch_subject IS NOT NULL AND trim(ml.pitch_subject) <> ''
           AND ml.pitch_body IS NOT NULL AND trim(ml.pitch_body) <> ''
           AND NOT EXISTS (SELECT 1 FROM outreach_sends os WHERE os.lead_id = ml.id)
           AND lower(ml.contact_email) NOT IN (SELECT lower(email) FROM email_suppressions)
           AND lower(ml.contact_email) NOT IN (SELECT lower(email) FROM drip_enrollments WHERE status = 'stopped')";

    private static function eligibleCount(\PDO $pdo): int
    {
        return (int) $pdo->query('SELECT COUNT(*) FROM (' . self::ELIGIBLE_SQL . ')')->fetchColumn();
    }

    /**
     * Leads auto-draft can work on: still pending/audited, not already sent,
     * suppressed, or opted out, and reachable on SOME channel — already
     * emailable, a site we haven't mined yet (auditing it may surface a
     * published/enriched email — most Places-discovered leads arrive
     * phone-only, so this is how they become emailable at all), or a phone
     * number to prepare a call script for. A website lead audited without
     * yielding an email doesn't loop on re-audits: it either has a phone
     * (gets a call script, leaves the pool as pitch_ready) or drops out.
     */
    private const DRAFTABLE_SQL =
        "SELECT ml.* FROM marketing_leads ml
         WHERE ml.status IN ('pending', 'audited')
           AND NOT EXISTS (SELECT 1 FROM outreach_sends os WHERE os.lead_id = ml.id)
           AND lower(COALESCE(ml.contact_email, '')) NOT IN (SELECT lower(email) FROM email_suppressions)
           AND lower(COALESCE(ml.contact_email, '')) NOT IN (SELECT lower(email) FROM drip_enrollments WHERE status = 'stopped')
           AND (
             ml.contact_email LIKE '%_@_%.__%'
             OR (ml.website_url IS NOT NULL AND trim(ml.website_url) <> ''
                 AND (ml.audit_findings IS NULL OR trim(ml.audit_findings) = ''))
             OR (ml.contact_phone IS NOT NULL AND trim(ml.contact_phone) <> '')
           )";

    private static function draftableCount(\PDO $pdo): int
    {
        return (int) $pdo->query('SELECT COUNT(*) FROM (' . self::DRAFTABLE_SQL . ')')->fetchColumn();
    }

    private static function sentToday(\PDO $pdo): int
    {
        return (int) $pdo->query("SELECT COUNT(*) FROM outreach_sends WHERE date(sent_at) = date('now')")->fetchColumn();
    }

    private static function callsToday(\PDO $pdo): int
    {
        return (int) $pdo->query("SELECT COUNT(*) FROM call_log WHERE date(called_at) = date('now')")->fetchColumn();
    }

    private static function dailyCap(): int
    {
        $cap = (int) (Settings::get('outreach_daily_cap') ?: self::DEFAULT_DAILY_CAP);
        return max(1, min(self::MAX_DAILY_CAP, $cap));
    }

    private static function assignToken(\PDO $pdo, int $leadId): string
    {
        $token = bin2hex(random_bytes(16));
        $pdo->prepare('UPDATE marketing_leads SET unsubscribe_token = ? WHERE id = ?')->execute([$token, $leadId]);
        return $token;
    }

    /**
     * Fires the same 'marketing_pitch_sent' trigger markSent() does, so a
     * lead sent by the engine enters the follow-up sequence exactly as one
     * sent by hand would. last_action carries a real, specific observation
     * (the audit findings) so any follow-up doesn't read like a template.
     */
    private static function fireFollowUp(\PDO $pdo, array $lead): void
    {
        $auditNote = trim((string) ($lead['audit_findings'] ?? ''));
        $lastAction = 'was sent an outreach pitch about their website'
            . (!empty($lead['website_url']) ? ' (' . $lead['website_url'] . ')' : '')
            . ($auditNote !== '' ? '. Issues spotted in the audit: ' . mb_substr($auditNote, 0, 300) : '');

        Automations::fire('marketing_pitch_sent', (string) $lead['contact_email'], [
            'name' => $lead['business_name'] ?: null,
            'source' => 'marketing_lead',
            'lead_id' => (int) $lead['id'],
            'last_action' => $lastAction,
        ], $pdo);
    }
}
