<?php

declare(strict_types=1);

// Optional standalone runner for testing or a dedicated daily cron. Normal
// production use needs no extra cron: send_cold_outreach.php invokes this
// same daily-gated service before auto-drafting.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\LeadDiscovery;

$result = LeadDiscovery::run(in_array('--force', $argv ?? [], true));
echo $result['status'] . "\n";
