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
echo 'Logged verdicts: ' . $r['total'] . "\n";
echo $r['verdict_text'] . "\n";

foreach ($r['kinds'] as $kind => $k) {
    printf("\n[%s] %d candidates, %d qualified by the full model\n", $kind, $k['candidates'], $k['qualified']);
    printf("  %-10s %-10s %-8s %s\n", 'score >=', 'rejected', 'saved', 'leads missed');
    foreach ($k['sweep'] as $row) {
        printf("  %-10.2f %-10d %-8s %d%s\n", $row['threshold'], $row['rejected'], $row['saved_pct'] . '%', $row['missed'],
            $row['current'] ? '   <- current' : '');
    }
}
