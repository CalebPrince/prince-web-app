<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/src/autoload.php';

use App\Support\LeadFitScorer;

$strong = LeadFitScorer::score([
    'business_name' => 'Example Clinic',
    'contact_name' => 'Ama Mensah',
    'contact_email' => 'ama@example.com',
    'website_url' => 'https://example.com',
    'audit_findings' => json_encode([
        'reachable' => false,
        'issues' => [['issue' => 'unreachable', 'detail' => 'Connection failed']],
    ]),
    'research_findings' => json_encode(['summary' => 'Active private clinic']),
    'estimated_value' => 600000,
]);

$weak = LeadFitScorer::score([
    'business_name' => 'Unknown Account',
    'website_url' => 'https://example.com',
]);

if ($strong['score'] < 75 || !$strong['qualified'] || $strong['label'] !== 'Strong fit') {
    throw new RuntimeException('Expected the evidence-rich lead to be a strong fit.');
}
if ($weak['score'] >= 35 || $weak['qualified']) {
    throw new RuntimeException('Expected the unreachable, evidence-poor lead to remain low fit.');
}

echo "Lead fit scoring checks passed.\n";
