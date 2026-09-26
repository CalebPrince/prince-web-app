<?php

declare(strict_types=1);

// Terminal version of Admin -> TypeSafe Gate: answers "is it safe to switch
// typesafe_gate_mode to 'enforce'?" from the shadow-mode audit table.
//   php database/typesafe_gate_report.php
// Not scheduled: it's a decision aid, not a job.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\TypeSafeGate;

$r = TypeSafeGate::report();
echo 'Gate mode: ' . $r['mode'] . "\n";
echo 'Logged verdicts: ' . $r['total'] . ' (' . ($r['sample'] ?? 0) . " clean shadow samples)\n";
echo 'Score threshold: ' . $r['score_threshold'] . ', competitor cutoff: ' . $r['competitor_cutoff'] . "\n";
echo $r['verdict_text'] . "\n";
$c = $r['cost'] ?? null;
if ($c) {
    if ($c['gate_per_call'] === null || $c['full_per_call'] === null) {
        echo "Cost: enter typesafe_cost_per_call_usd and beacon_full_call_cost_usd in Settings to see spend and savings.\n";
    } else {
        printf(
            "Cost: gate spend \$%.2f over %d calls, saved \$%.2f (%d AI calls skipped), net \$%.2f. Projected net if enforced: \$%.2f\n",
            $c['gate_spend'], $c['calls'], $c['actual_saved'], $c['skipped'], $c['actual_net'], $c['projected_net']
        );
    }
}

foreach ($r['kinds'] as $kind => $k) {
    printf("\n[%s] %d candidates, %d qualified by the full model\n", $kind, $k['candidates'], $k['qualified']);
    printf("  %-10s %-10s %-8s %s\n", 'score >=', 'rejected', 'saved', 'leads missed');
    foreach ($k['sweep'] as $row) {
        printf("  %-10.2f %-10d %-8s %d%s\n", $row['threshold'], $row['rejected'], $row['saved_pct'] . '%', $row['missed'],
            $row['current'] ? '   <- current' : '');
    }
}
