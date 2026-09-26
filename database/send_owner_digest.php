<?php

declare(strict_types=1);

// Sends the owner one digest of the routine agent messages Jev held instead of
// interrupting. Only does anything when agent_jev_owner_mode is 'live' and
// something is waiting. Goes out at agent_digest_times (default 09:00 and
// 17:00, site timezone), never in quiet hours, and anything held longer than
// 24 hours goes at the next chance so nothing waits forever. Run every 30
// minutes from cron; it is safe to run as often as you like.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\OwnerMessages;

$r = OwnerMessages::flushDigest(Database::get());

echo $r['sent'] > 0
    ? "Digest sent: {$r['sent']} held update(s).\n"
    : "Nothing to send.\n";
if ($r['note'] !== null) {
    echo $r['note'] . "\n";
}
