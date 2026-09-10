<?php

declare(strict_types=1);

// Seeds the Admin -> Expenses "Service ledger" from the recurring
// subscriptions found on the operating card (Sep 2026 bank records).
// Writes three settings keys: external_expense_currency,
// external_service_expenses, external_expense_monthly_budget.
//
// WARNING: re-running this OVERWRITES the whole ledger, including rows
// edited live in the admin UI since this file was last touched. Run it
// once to populate the page, then manage the ledger from the UI. Adjust
// the list here only if you want this file to stay the source of truth.
//
// Amounts are USD monthly. "usage" lines are estimates for variable,
// credit/top-up or metered services; refine them from the UI as real
// months are recorded. The page shows a GHS equivalent via the live rate.

require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Settings;

$currency = 'USD';
$monthlyBudget = '350.00';

// name | monthly USD | fixed|usage
$items = [
    // --- Fixed subscriptions ---
    ['Anthropic (Claude)',            24.00, 'fixed'],
    ['Supabase (Pro)',                25.00, 'fixed'],
    ['Vercel (Pro)',                  20.00, 'fixed'],
    ['Upwork (Freelancer Plus)',       9.99, 'fixed'],
    ['ElevenLabs',                     6.00, 'fixed'],
    ['Bluehost',                      13.19, 'fixed'],
    ['Namecheap hosting (princecaleb.dev)', 3.00, 'fixed'],
    ['Bank account & card fees',       4.00, 'fixed'],

    // --- Usage / variable ---
    ['Twilio (WhatsApp & SMS)',       50.00, 'usage'],
    ['Higgsfield (image/video credits)', 40.00, 'usage'],
    ['Google Cloud',                  25.00, 'usage'],
    ['Facebook Ads',                  60.00, 'usage'],
    ['Fiverr (freelance help)',       20.00, 'usage'],
    ['Domain renewals (Vercel)',       2.00, 'usage'],
];

$lines = array_map(
    static fn (array $i): string => sprintf('%s | %.2f | %s', $i[0], $i[1], $i[2]),
    $items
);

Settings::set('external_expense_currency', $currency);
Settings::set('external_service_expenses', implode("\n", $lines));
Settings::set('external_expense_monthly_budget', $monthlyBudget);

$fixed = array_sum(array_map(static fn ($i) => $i[2] === 'fixed' ? $i[1] : 0, $items));
$usage = array_sum(array_map(static fn ($i) => $i[2] === 'usage' ? $i[1] : 0, $items));

echo "Seeded " . count($items) . " expense lines ({$currency}).\n";
printf("  Fixed:  \$%.2f / month\n", $fixed);
printf("  Usage:  \$%.2f / month (estimated)\n", $usage);
printf("  Total:  \$%.2f / month  vs budget \$%s\n", $fixed + $usage, $monthlyBudget);
echo "Open Admin -> Expenses to review, then save from the UI.\n";
