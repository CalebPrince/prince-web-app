<?php

declare(strict_types=1);

// Auto-schedules a follow-up (due immediately) for any active pipeline lead
// that's gone quiet for too long — same "stale" definition already shown on
// the Pipeline board (pipelineIsStale() in admin-pipeline.js): not won/lost,
// no follow_up_at already set, and no activity across any linked source in
// stale_lead_followup_days days. Reuses PipelineController::buildUnifiedLeads()
// so this can never drift from what the UI calls stale, and
// syncFollowUpQueue() so the result is indistinguishable from a hand-set
// follow-up — same Agent Queue entry, same Tasks-page entry once due.
//
// Off by default (stale_lead_followup_enabled) — this changes real pipeline
// data, so it should be an opt-in decision, not a silent default. Once a
// lead gets an auto-scheduled follow-up, follow_up_at is no longer null, so
// it won't be re-flagged by this script again until that follow-up is
// cleared and the lead goes quiet a second time.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\PipelineController;
use App\Support\Database;
use App\Support\Settings;

const DEFAULT_STALE_DAYS = 5;

if (Settings::get('stale_lead_followup_enabled') !== '1') {
    echo "Stale-lead auto-follow-up is disabled, skipping.\n";
    exit;
}

$days = (int) (Settings::get('stale_lead_followup_days') ?: DEFAULT_STALE_DAYS);
if ($days < 1) {
    $days = DEFAULT_STALE_DAYS;
}
$staleBeforeTimestamp = time() - $days * 86400;

$pdo = Database::get();
$leads = PipelineController::buildUnifiedLeads($pdo);

$scheduled = 0;
foreach ($leads as $lead) {
    if (in_array($lead['stage'], ['won', 'lost'], true)) {
        continue;
    }
    if (!empty($lead['follow_up_at'])) {
        continue;
    }
    $latestAt = strtotime((string) $lead['latest_at']) ?: 0;
    $pipelineUpdatedAt = strtotime((string) ($lead['pipeline_updated_at'] ?? '')) ?: 0;
    $lastActivity = max($latestAt, $pipelineUpdatedAt);
    if ($lastActivity === 0 || $lastActivity > $staleBeforeTimestamp) {
        continue;
    }

    $id = (int) $lead['id'];
    // Kept short deliberately: this same string becomes the pipeline lead's
    // next_action, the agent_tasks reschedule_reason, AND (via dispatch_
    // agent_tasks.php's title fallback) the Tasks-page entry's title — a
    // full explanatory sentence reads fine as a note but badly as a title.
    $nextAction = "Reach out — quiet for {$days}+ days";
    $pdo->prepare("UPDATE pipeline_leads SET follow_up_at = datetime('now'), next_action = ?, updated_at = datetime('now') WHERE id = ?")
        ->execute([$nextAction, $id]);
    PipelineController::syncFollowUpQueue($pdo, $id, date('Y-m-d H:i:s'), $nextAction);
    $scheduled++;
}

echo "{$scheduled} stale lead(s) auto-scheduled for follow-up.\n";
