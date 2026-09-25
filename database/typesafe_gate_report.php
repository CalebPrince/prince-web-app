<?php

declare(strict_types=1);

// Reads the shadow-mode audit (typesafe_gate_log) and answers "is it safe to
// switch typesafe_gate_mode to 'enforce'?". For each kind (post, engagement) it
// sweeps the score threshold and reports how many generative calls would be
// saved versus how many leads the full model qualified that the gate would
// have rejected. Run manually after Beacon has been in shadow mode for a while:
//   php database/typesafe_gate_report.php
// Not scheduled: it's a decision aid, not a job.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;
use App\Support\Settings;

$pdo = Database::get();
$total = (int) $pdo->query('SELECT COUNT(*) FROM typesafe_gate_log')->fetchColumn();
echo 'Gate mode: ' . (Settings::get('typesafe_gate_mode') ?: 'shadow') . "\n";
echo "Logged verdicts: {$total}\n";
if ($total === 0) {
    echo "Nothing to report yet. Needs typesafe_api_key set and Beacon discovery to have run in shadow mode.\n";
    exit;
}

$competitorCut = 0.5;
foreach (['post', 'engagement'] as $kind) {
    $stmt = $pdo->prepare('SELECT score, competitor, model_qualified FROM typesafe_gate_log WHERE kind = ?');
    $stmt->execute([$kind]);
    $rows = $stmt->fetchAll();
    $n = count($rows);
    if ($n === 0) {
        continue;
    }
    $qualified = array_sum(array_column($rows, 'model_qualified'));
    printf("\n[%s] %d candidates, %d qualified by the full model (%.0f%%)\n", $kind, $n, $qualified, $qualified / $n * 100);
    printf("  %-16s %-10s %-10s %s\n", 'score >=', 'rejected', 'saved', 'leads missed');

    foreach ([0.25, 0.5, 0.75, 1.0, 1.25, 1.5] as $threshold) {
        $rejected = 0;
        $missed = 0;
        foreach ($rows as $r) {
            if ((float) $r['score'] < $threshold || (float) $r['competitor'] >= $competitorCut) {
                $rejected++;
                $missed += (int) $r['model_qualified'];
            }
        }
        printf("  %-16.2f %-10d %-10s %d%s\n", $threshold, $rejected, sprintf('%.0f%%', $rejected / $n * 100), $missed,
            $threshold === 1.0 ? '   <- current' : '');
    }
}
echo "\nSafe to enforce when 'leads missed' is 0 (or a rate you accept) at a threshold that still saves most calls.\n";
echo "The gate's scores need a few hundred candidates before that reads as more than noise.\n";
