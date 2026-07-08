<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

$pdo = Database::get();
$schema = file_get_contents(__DIR__ . '/schema.sql');
$pdo->exec($schema);

$pricingDefaultUpdates = [
    'pricing_currency' => ['USD', 'GHS'],
    'pricing_tier_1_amount' => ['600', '6000'],
    'pricing_tier_1_price' => ['From $600', 'From GHS 6,000'],
    'pricing_tier_2_price' => ['From $2,500', 'From GHS 25,000'],
];
$pricingUpdateStmt = $pdo->prepare('UPDATE settings SET value = ? WHERE name = ? AND value = ?');
foreach ($pricingDefaultUpdates as $name => [$oldValue, $newValue]) {
    $pricingUpdateStmt->execute([$newValue, $name, $oldValue]);
}

// SQLite has no "ADD COLUMN IF NOT EXISTS" — guard new columns on tables that
// may already exist from before this migration was written.
$userColumns = array_column($pdo->query('PRAGMA table_info(users)')->fetchAll(), 'name');
if (!in_array('totp_secret', $userColumns, true)) {
    $pdo->exec('ALTER TABLE users ADD COLUMN totp_secret TEXT');
}
if (!in_array('totp_enabled', $userColumns, true)) {
    $pdo->exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0');
}
if (!in_array('totp_backup_codes', $userColumns, true)) {
    $pdo->exec('ALTER TABLE users ADD COLUMN totp_backup_codes TEXT');
}

$chatSessionColumns = array_column($pdo->query('PRAGMA table_info(chat_sessions)')->fetchAll(), 'name');
if (!in_array('client_phone', $chatSessionColumns, true)) {
    $pdo->exec('ALTER TABLE chat_sessions ADD COLUMN client_phone TEXT');
}
if (!in_array('ready_for_prototype', $chatSessionColumns, true)) {
    $pdo->exec('ALTER TABLE chat_sessions ADD COLUMN ready_for_prototype INTEGER NOT NULL DEFAULT 0');
}

$projectColumns = array_column($pdo->query('PRAGMA table_info(projects)')->fetchAll(), 'name');
if (!in_array('is_embeddable', $projectColumns, true)) {
    $pdo->exec('ALTER TABLE projects ADD COLUMN is_embeddable INTEGER NOT NULL DEFAULT 0');
}
if (!in_array('is_featured', $projectColumns, true)) {
    $pdo->exec('ALTER TABLE projects ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0');
}
if (!in_array('outcome_metrics', $projectColumns, true)) {
    $pdo->exec('ALTER TABLE projects ADD COLUMN outcome_metrics TEXT');
}
if (!in_array('testimonial_id', $projectColumns, true)) {
    $pdo->exec('ALTER TABLE projects ADD COLUMN testimonial_id INTEGER REFERENCES testimonials(id)');
}

$webhookColumns = array_column($pdo->query('PRAGMA table_info(webhook_queue)')->fetchAll(), 'name');
if (!in_array('slack_sent', $webhookColumns, true)) {
    $pdo->exec('ALTER TABLE webhook_queue ADD COLUMN slack_sent INTEGER NOT NULL DEFAULT 0');
}
if (!in_array('email_sent', $webhookColumns, true)) {
    $pdo->exec('ALTER TABLE webhook_queue ADD COLUMN email_sent INTEGER NOT NULL DEFAULT 0');
}

$inquiryColumns = array_column($pdo->query('PRAGMA table_info(inquiries)')->fetchAll(), 'name');
if (!in_array('type', $inquiryColumns, true)) {
    $pdo->exec("ALTER TABLE inquiries ADD COLUMN type TEXT NOT NULL DEFAULT 'contact'");
}
foreach (['project_type', 'budget', 'timeline', 'features', 'attachments'] as $col) {
    if (!in_array($col, $inquiryColumns, true)) {
        $pdo->exec("ALTER TABLE inquiries ADD COLUMN {$col} TEXT");
    }
}
if (!in_array('pipeline_stage', $inquiryColumns, true)) {
    $pdo->exec("ALTER TABLE inquiries ADD COLUMN pipeline_stage TEXT NOT NULL DEFAULT 'new'");
}
if (!in_array('stale_alert_sent', $inquiryColumns, true)) {
    $pdo->exec('ALTER TABLE inquiries ADD COLUMN stale_alert_sent INTEGER NOT NULL DEFAULT 0');
}
$pdo->exec('CREATE INDEX IF NOT EXISTS idx_inquiries_type ON inquiries (type)');

$appointmentColumns = array_column($pdo->query('PRAGMA table_info(appointments)')->fetchAll(), 'name');
if (!in_array('reminder_sent', $appointmentColumns, true)) {
    $pdo->exec('ALTER TABLE appointments ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0');
}

$paymentColumns = array_column($pdo->query('PRAGMA table_info(payments)')->fetchAll(), 'name');
if (!in_array('tos_accepted', $paymentColumns, true)) {
    $pdo->exec('ALTER TABLE payments ADD COLUMN tos_accepted INTEGER');
}
if (!in_array('tos_accepted_at', $paymentColumns, true)) {
    $pdo->exec('ALTER TABLE payments ADD COLUMN tos_accepted_at TEXT');
}
if (!in_array('tos_version', $paymentColumns, true)) {
    $pdo->exec('ALTER TABLE payments ADD COLUMN tos_version TEXT');
}
if (!in_array('reviewed', $paymentColumns, true)) {
    $pdo->exec('ALTER TABLE payments ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0');
}
if (!in_array('notes', $paymentColumns, true)) {
    $pdo->exec('ALTER TABLE payments ADD COLUMN notes TEXT');
}

$proposalColumns = array_column($pdo->query('PRAGMA table_info(proposals)')->fetchAll(), 'name');
if (!in_array('accepted_by_name', $proposalColumns, true)) {
    $pdo->exec('ALTER TABLE proposals ADD COLUMN accepted_by_name TEXT');
}
if (!in_array('accepted_ip', $proposalColumns, true)) {
    $pdo->exec('ALTER TABLE proposals ADD COLUMN accepted_ip TEXT');
}
if (!in_array('accepted_user_agent', $proposalColumns, true)) {
    $pdo->exec('ALTER TABLE proposals ADD COLUMN accepted_user_agent TEXT');
}
if (!in_array('client_id', $proposalColumns, true)) {
    $pdo->exec('ALTER TABLE proposals ADD COLUMN client_id INTEGER REFERENCES clients(id)');
}

$paymentLinkColumns = array_column($pdo->query('PRAGMA table_info(payment_links)')->fetchAll(), 'name');
if (!in_array('client_id', $paymentLinkColumns, true)) {
    $pdo->exec('ALTER TABLE payment_links ADD COLUMN client_id INTEGER REFERENCES clients(id)');
}

$milestoneColumns = array_column($pdo->query('PRAGMA table_info(proposal_milestones)')->fetchAll(), 'name');
if (!in_array('reminder_sent', $milestoneColumns, true)) {
    $pdo->exec('ALTER TABLE proposal_milestones ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0');
}

$socialDraftColumns = array_column($pdo->query('PRAGMA table_info(social_post_drafts)')->fetchAll(), 'name');
if (!in_array('image_url', $socialDraftColumns, true)) {
    $pdo->exec('ALTER TABLE social_post_drafts ADD COLUMN image_url TEXT');
}
if (!in_array('ai_provider', $socialDraftColumns, true)) {
    $pdo->exec('ALTER TABLE social_post_drafts ADD COLUMN ai_provider TEXT');
}

// SQLite can't relax a NOT NULL constraint via ALTER TABLE — rebuild the
// table if website_url is still marked NOT NULL from before leads with no
// website were supported.
$leadColumns = $pdo->query('PRAGMA table_info(marketing_leads)')->fetchAll();
foreach ($leadColumns as $col) {
    if ($col['name'] === 'website_url' && (int) $col['notnull'] === 1) {
        $pdo->exec('BEGIN TRANSACTION');
        $pdo->exec('ALTER TABLE marketing_leads RENAME TO marketing_leads_old');
        $pdo->exec("CREATE TABLE marketing_leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            business_name TEXT NOT NULL,
            website_url TEXT,
            contact_email TEXT,
            status TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'audited', 'pitch_ready', 'sent', 'rejected')),
            audit_findings TEXT,
            pitch_subject TEXT,
            pitch_body TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            sent_at TEXT
        )");
        $pdo->exec(
            'INSERT INTO marketing_leads (id, business_name, website_url, contact_email, status, audit_findings,
             pitch_subject, pitch_body, notes, created_at, updated_at, sent_at)
             SELECT id, business_name, website_url, contact_email, status, audit_findings,
             pitch_subject, pitch_body, notes, created_at, updated_at, sent_at FROM marketing_leads_old'
        );
        $pdo->exec('DROP TABLE marketing_leads_old');
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_marketing_leads_status ON marketing_leads (status, created_at)');
        $pdo->exec('COMMIT');
        break;
    }
}

echo "Schema applied.\n";
