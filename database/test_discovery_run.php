<?php

declare(strict_types=1);

// Manually fires one Marketing Leads discovery run right now, bypassing the
// once-a-day gate, for testing the query-rotation/yield-report changes
// without waiting for the next UTC day.
//
//   php database/test_discovery_run.php
//
// Real searches run and any leads found are really inserted (so results
// show up in Marketing Leads / the Analytics yield table immediately) — but
// lead_discovery_pages, lead_discovery_query_offset, lead_discovery_last_run,
// and lead_discovery_last_status are all left untouched. That means this
// script can be run as many times as needed without ever advancing the
// rotation cursor, per-query pagination, or the once-a-day gate ahead of
// where the real scheduled hourly cron (send_cold_outreach.php) left them —
// the next real run behaves exactly as if this test never happened.

require_once dirname(__DIR__) . '/src/autoload.php';
require_once dirname(__DIR__) . '/config/config.php';

use App\Support\LeadDiscovery;

$result = LeadDiscovery::run(true, false);

echo "Forced test run (not persisted — rotation/pagination/gate untouched)\n";
echo "----------------------------------------------------------------------\n";
foreach ($result as $key => $value) {
    echo str_pad($key, 10) . (is_bool($value) ? ($value ? 'true' : 'false') : $value) . "\n";
}
