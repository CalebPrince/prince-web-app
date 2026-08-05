<?php

declare(strict_types=1);

// One-time backfill, NOT a cron. Run this once by hand
// (`php database/backfill_pending_review_leads.php`) after enabling
// beacon_auto_accept_all / outreach_auto_accept_all, to clear out whatever
// was already sitting in pending_review from before those settings existed.
// Without this, only *new* leads going forward are affected — existing
// pending_review rows stay stuck requiring a manual approve forever, since
// review_status is only ever written once, at the moment a lead is first
// scored/drafted (see BeaconController::draft(), OutreachController::autoDraft()).
//
// Real consequence, not cosmetic: a Cold Outreach lead flipped to accepted
// here becomes immediately eligible for send_cold_outreach.php's next run
// (real pitch email, spread across days by the daily cap). A Beacon lead
// flipped here fires its deferred marketing_pitch_sent automation right now,
// same as clicking "Approve" on it by hand — just for all of them at once
// instead of one at a time.
//
// High-priority leads are untouched by this either way: is_high_priority = 0
// is a separate, independent gate in OutreachController::ELIGIBLE_SQL that
// this script never writes to.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\BeaconController;
use App\Support\Database;

$pdo = Database::get();

$beaconIds = $pdo->query("SELECT id FROM beacon_social_leads WHERE review_status = 'pending_review'")
    ->fetchAll(\PDO::FETCH_COLUMN);
$beaconApproved = 0;
foreach ($beaconIds as $id) {
    if (BeaconController::approveLeadById($pdo, (int) $id)) {
        $beaconApproved++;
    }
}

$outreachStmt = $pdo->prepare(
    "UPDATE marketing_leads SET review_status = 'accepted', updated_at = datetime('now')
     WHERE status = 'pitch_ready' AND review_status = 'pending_review'"
);
$outreachStmt->execute();
$outreachApproved = $outreachStmt->rowCount();

echo "Beacon: {$beaconApproved} pending_review lead(s) approved (of " . count($beaconIds) . " found).\n";
echo "Cold Outreach: {$outreachApproved} pending_review lead(s) approved — will send on send_cold_outreach.php's next run(s), subject to the daily cap.\n";
