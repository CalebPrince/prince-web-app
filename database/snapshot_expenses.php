<?php

declare(strict_types=1);

// Saves this month's external-expense totals into external_expense_history so
// the dashboard's monthly profit/loss has a real expense figure for every
// month, even when nobody opens the dashboard. Run daily from cron; it
// updates the current month's row in place, so running it more often is safe.

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Controllers\DashboardController;
use App\Support\Database;

$e = DashboardController::externalExpenses(Database::get());
echo 'Snapshot saved: ' . number_format($e['monthly_total'] / 100, 2) . ' ' . $e['currency'] . "\n";
