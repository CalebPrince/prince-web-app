<?php

declare(strict_types=1);

// Lisa's cold-conversation follow-up pass. Jev reads each WhatsApp conversation
// that has gone quiet after Lisa's last message and decides whether a
// check-in is welcome; code applies the 24 hour window rules (free text inside
// it, the approved conversation_followup template after it). Gated by
// lisa_followup_mode in Admin -> Settings -> WhatsApp & phone: 'off',
// 'shadow' (default: records what it would send, sends nothing) or 'live'.
// Run every 30 to 60 minutes from cron; it does nothing until a contact has
// been silent long enough, never sends in quiet hours, and remembers what it
// has already decided so repeated runs are harmless.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\LisaFollowups;
use App\Support\LisaQuoting;

$pdo = Database::get();
$r = LisaFollowups::run($pdo);
// The after-the-conversation quote summaries to the owner ride on the same cron.
$summaries = LisaQuoting::sendDueSummaries($pdo);

echo sprintf(
    "Lisa follow-ups (%s): %d considered, %d sent, %d shadow, %d skipped, %d failed.\n",
    $r['mode'], $r['considered'], $r['sent'], $r['shadow'], $r['skipped'], $r['failed']
);
echo "Quote summaries to the owner: {$summaries}.\n";
if ($r['note'] !== null) {
    echo $r['note'] . "\n";
}
