<?php

declare(strict_types=1);

// Sends any drip-sequence EMAIL steps that have come due (channel='whatsapp'
// steps are send_drip_whatsapp.php's job). Run on a cron (hourly is plenty —
// offsets are whole days). For each active enrollment, a step is due when
// `enrolled_at + day_offset days` has passed and that step hasn't been sent
// to that enrollment yet (drip_sends is UNIQUE per pair, so retries and
// overlapping runs can't double-send). Enrollments with no remaining active
// steps are marked completed. {{name}}, {{lead_industry}}, {{last_action}},
// {{audit_highlight}}, and {{research_summary}} personalize the copy (the
// first three from the enrollment's own columns, the last two from the
// source marketing_leads row when lead_id points to one), and every email
// carries the enrollment's unsubscribe link.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\CustomerMessages;
use App\Support\EmailTemplate;
use App\Support\Mailer;
use App\Support\Utm;

$pdo = Database::get();

// Each enrollment only receives the steps of its OWN automation, and only
// while that automation is switched on (a.is_active) — pausing an automation
// halts every sequence in flight, the master-switch behaviour the admin UI
// promises. drip_sends stays UNIQUE per (enrollment, step), so a lead in
// several automations at once still can't be double-sent the same step.
// LEFT JOIN — lead_id is nullable (NULL for enrollments the pipeline_stage_changed
// trigger creates, since a pipeline_leads id isn't a marketing_leads id) and
// ON DELETE SET NULL if the source lead is later removed, so this must never
// filter a row out; it only adds two optional columns when a match exists.
$due = $pdo->query(
    "SELECT e.id AS enrollment_id, e.email, e.name, e.lead_industry, e.last_action, e.unsubscribe_token,
            ml.audit_findings, ml.research_findings,
            s.id AS step_id, s.subject, s.body, a.trigger_event
     FROM drip_enrollments e
     JOIN automations a ON a.id = e.automation_id AND a.is_active = 1
     JOIN drip_steps s ON s.automation_id = e.automation_id AND s.is_active = 1 AND s.channel = 'email'
     LEFT JOIN marketing_leads ml ON ml.id = e.lead_id
     WHERE e.status = 'active'
       AND datetime(e.enrolled_at, '+' || s.day_offset || ' days') <= datetime('now')
       AND NOT EXISTS (SELECT 1 FROM drip_sends ds WHERE ds.enrollment_id = e.id AND ds.step_id = s.id)
     ORDER BY e.id, s.day_offset"
)->fetchAll();

$sent = 0;
foreach ($due as $row) {
    // Jev decides first whether this step should go to this person now.
    $gate = CustomerMessages::check([
        'agent' => 'drip', 'channel' => 'email', 'kind' => 'drip_step',
        'ref' => "drip:enrollment{$row['enrollment_id']}:step{$row['step_id']}", 'enrollment_id' => (int) $row['enrollment_id'],
        'name' => (string) ($row['name'] ?? ''), 'industry' => (string) ($row['lead_industry'] ?? ''), 'last_action' => (string) ($row['last_action'] ?? ''),
        'subject' => (string) $row['subject'], 'message' => (string) $row['body'],
    ]);
    if ($gate['action'] === 'stop') {
        CustomerMessages::stopEnrollment($pdo, (int) $row['enrollment_id']);
        continue;
    }
    if ($gate['action'] !== 'send') {
        continue;
    }

    $audit = json_decode((string) ($row['audit_findings'] ?? ''), true);
    $research = json_decode((string) ($row['research_findings'] ?? ''), true);
    $tokens = [
        '{{name}}' => trim((string) ($row['name'] ?? '')) ?: 'there',
        '{{lead_industry}}' => trim((string) ($row['lead_industry'] ?? '')) ?: 'your business',
        '{{last_action}}' => trim((string) ($row['last_action'] ?? '')),
        // First entry only — performAudit() always lists its single most
        // compelling finding first, and each 'detail' is already a clean,
        // short sentence safe to drop straight into outbound copy.
        '{{audit_highlight}}' => trim((string) ($audit['issues'][0]['detail'] ?? '')) ?: 'your online presence',
        // DossierController's AI-written prose paragraph — the only
        // research_findings sub-field short/clean enough for a merge token.
        '{{research_summary}}' => trim((string) ($research['summary'] ?? '')) ?: 'your business',
    ];
    $subject = strtr($row['subject'], $tokens);
    $message = strtr($row['body'], $tokens);
    $message = Utm::tagLinks($message, (string) $row['trigger_event']);
    $unsubscribeUrl = 'https://princecaleb.dev/api/v1/drip/unsubscribe?token=' . $row['unsubscribe_token'];

    $text = $message . "\n\n—\nNo longer interested? Unsubscribe here and you won't hear from me again:\n" . $unsubscribeUrl;
    $html = EmailTemplate::wrapMarketing($message, 'Update', $unsubscribeUrl);

    if (Mailer::sendHtml($row['email'], $subject, $html, $text, Mailer::replyInbox())) {
        $pdo->prepare('INSERT OR IGNORE INTO drip_sends (enrollment_id, step_id) VALUES (?, ?)')
            ->execute([$row['enrollment_id'], $row['step_id']]);
        $sent++;
    }
}

// Close out enrollments that have received every active step — and, for
// leads opted into Nurturer, both of its AI follow-ups too. Completing on
// the fixed steps alone would strand those: send_nurturer_emails.php only
// picks up active enrollments, so anything still due (likely, whenever the
// last active step's day_offset falls before the sequence 3 offset) would
// silently never send.
$completed = $pdo->exec(
    "UPDATE drip_enrollments SET status = 'completed'
     WHERE status = 'active'
       AND (SELECT is_active FROM automations WHERE id = drip_enrollments.automation_id) = 1
       AND (SELECT COUNT(*) FROM drip_steps WHERE is_active = 1 AND automation_id = drip_enrollments.automation_id) > 0
       AND NOT EXISTS (
         SELECT 1 FROM drip_steps s
         WHERE s.is_active = 1 AND s.automation_id = drip_enrollments.automation_id
           AND NOT EXISTS (SELECT 1 FROM drip_sends ds WHERE ds.enrollment_id = drip_enrollments.id AND ds.step_id = s.id)
       )
       AND (
         nurturer_enabled = 0
         OR (
           SELECT COUNT(*) FROM nurturer_sends ns
           WHERE ns.enrollment_id = drip_enrollments.id AND ns.sequence_number IN (2, 3)
         ) = 2
       )"
);

echo "$sent drip email(s) sent, $completed enrollment(s) completed.\n";
