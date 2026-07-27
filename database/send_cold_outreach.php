<?php

declare(strict_types=1);

// Cold Outreach Engine — sends up to outreach_daily_cap (default 50)
// human-reviewed email pitches per day, so "50 personalised emails a day,
// forever" runs itself instead of being a manual chore. Run on a cron;
// hourly is a good cadence — each run tops the day up toward the cap, so
// spreading the sends across the day looks more human than one 9am blast.
// (Want it all in the morning? Schedule it once daily instead.)
//
// It only sends leads Caleb has already turned into an email pitch
// (status 'pitch_ready'), never auto-drafted text, and is disabled until
// switched on under Admin -> Marketing Leads. All the throttling,
// idempotency, suppression and follow-up wiring lives in OutreachController.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\OutreachController;

$result = OutreachController::run();

if (!$result['enabled']) {
    echo "Cold Outreach Engine is off — turn it on under Admin -> Marketing Leads.\n";
    exit;
}

$failed = $result['failed'] > 0 ? ", {$result['failed']} failed" : '';
$drafted = $result['drafted'] > 0 ? "auto-drafted {$result['drafted']} email pitch(es), " : '';
$scripts = $result['call_scripts'] > 0 ? "prepared {$result['call_scripts']} call script(s) for the call queue, " : '';
$discovered = ($result['discovery_added'] ?? 0) > 0 ? "discovered {$result['discovery_added']} new lead(s), " : '';
echo "{$discovered}{$drafted}{$scripts}{$result['sent']} cold outreach email(s) sent{$failed} "
    . "({$result['sent_today']}/{$result['cap']} today, {$result['remaining']} left in today's cap).\n";
