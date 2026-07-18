<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/autoload.php';

use App\Support\Database;

$pdo = Database::get();
$schema = file_get_contents(__DIR__ . '/schema.sql');
$pdo->exec($schema);

/**
 * Rebuilds $table with a genuinely new schema (a NOT NULL/CHECK/FK clause
 * SQLite can't apply via plain ALTER TABLE) without corrupting any OTHER
 * table's foreign key that points at it.
 *
 * The naive approach — RENAME the old table out of the way, CREATE the new
 * one under the real name, copy data in, DROP the renamed-away old one —
 * looks safe but isn't: modern SQLite's ALTER TABLE RENAME automatically
 * rewrites every OTHER table's foreign key definition to follow the
 * renamed table. So the moment the old table gets renamed to "{table}_old",
 * anything referencing it (e.g. proposal_milestones -> proposals) gets
 * silently rewritten to reference "{table}_old" instead — and when that
 * table is dropped a few statements later, those foreign keys are left
 * pointing at a name that no longer exists. This was caught by testing
 * against a copy of the real data before ever running it for real (see the
 * client_id fix below) — worth keeping this helper as the single safe path
 * so it can't recur.
 *
 * The safe order (SQLite's own documented procedure) creates the new table
 * under a throwaway name FIRST — nothing references that name yet, so
 * there's nothing for SQLite to rewrite — copies data in, drops the old
 * table, then renames the new one into the real name. At the instant the
 * rename happens, the new table is the only thing anything can be
 * referencing by that name, and old tables' foreign keys are untouched.
 *
 * $columns is an explicit column list (never SELECT *) so id — and every
 * OTHER table's foreign key value pointing at a specific id — survives
 * unchanged, and AUTOINCREMENT keeps counting from the right place.
 * $createSqlTemplate must contain exactly one %s for the (temporary) table
 * name. Verifies with PRAGMA foreign_key_check before committing and rolls
 * back rather than leaving a corrupted database if anything doesn't add up.
 */
function rebuildTable(\PDO $pdo, string $table, string $createSqlTemplate, string $columns, array $indexes = []): void
{
    $foreignKeysWereOn = (bool) $pdo->query('PRAGMA foreign_keys')->fetchColumn();
    // A schema-changing PRAGMA is a no-op inside a transaction, so this has
    // to happen before BEGIN — and be restored after COMMIT/ROLLBACK, since
    // this $pdo connection is reused for the rest of migrate.php.
    if ($foreignKeysWereOn) {
        $pdo->exec('PRAGMA foreign_keys = OFF');
    }

    $tmpTable = $table . '_rebuild_tmp';
    $pdo->exec('BEGIN TRANSACTION');
    $pdo->exec(sprintf($createSqlTemplate, $tmpTable));
    $pdo->exec("INSERT INTO {$tmpTable} ({$columns}) SELECT {$columns} FROM {$table}");
    $pdo->exec("DROP TABLE {$table}");
    $pdo->exec("ALTER TABLE {$tmpTable} RENAME TO {$table}");
    foreach ($indexes as $indexSql) {
        $pdo->exec($indexSql);
    }

    $problems = $pdo->query('PRAGMA foreign_key_check')->fetchAll();
    if ($problems) {
        $pdo->exec('ROLLBACK');
        if ($foreignKeysWereOn) {
            $pdo->exec('PRAGMA foreign_keys = ON');
        }
        throw new \RuntimeException(
            "Rebuilding {$table} would leave a broken foreign key — rolled back, nothing was changed: "
            . json_encode($problems)
        );
    }

    $pdo->exec('COMMIT');
    if ($foreignKeysWereOn) {
        $pdo->exec('PRAGMA foreign_keys = ON');
    }
}

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
    $pdo->exec('ALTER TABLE proposals ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL');
}

$paymentLinkColumns = array_column($pdo->query('PRAGMA table_info(payment_links)')->fetchAll(), 'name');
if (!in_array('client_id', $paymentLinkColumns, true)) {
    $pdo->exec('ALTER TABLE payment_links ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL');
}

// The two ADD COLUMNs above originally omitted ON DELETE SET NULL, so any
// database that already had client_id added before this fix is stuck with a
// FK that defaults to NO ACTION — SQLite enforces that as a hard failure
// ("FOREIGN KEY constraint failed"), not a graceful null-out, the moment
// ClientController::destroy() tries to delete a client with any proposal or
// payment link on file. SQLite can't ALTER an existing column's FK action,
// so fix it the same way the marketing_leads/beacon_social_leads rebuilds
// above do: rename, recreate with the correct clause, copy data back
// (explicit id list, so AUTOINCREMENT keeps counting from the right place
// and every other table's FK to these rows — proposal_milestones,
// client_files, payments — still resolves correctly), drop the old table.
foreach ([
    'proposals' => [
        'create' => "CREATE TABLE %s (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            inquiry_id INTEGER NULL REFERENCES inquiries(id) ON DELETE SET NULL,
            client_id INTEGER NULL REFERENCES clients(id) ON DELETE SET NULL,
            client_name TEXT NOT NULL,
            client_email TEXT NOT NULL,
            title TEXT NOT NULL,
            scope TEXT NOT NULL,
            timeline TEXT,
            total_amount INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT 'GHS',
            terms TEXT,
            status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'accepted', 'declined')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            accepted_at TEXT,
            accepted_by_name TEXT,
            accepted_ip TEXT,
            accepted_user_agent TEXT
        )",
        'columns' => 'id, token, inquiry_id, client_id, client_name, client_email, title, scope, timeline,
            total_amount, currency, terms, status, created_at, updated_at, accepted_at, accepted_by_name,
            accepted_ip, accepted_user_agent',
        'indexes' => ['CREATE INDEX IF NOT EXISTS idx_proposals_status_created ON proposals (status, created_at)'],
    ],
    'payment_links' => [
        'create' => "CREATE TABLE %s (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            client_id INTEGER NULL REFERENCES clients(id) ON DELETE SET NULL,
            client_name TEXT NOT NULL,
            client_email TEXT NOT NULL,
            amount INTEGER NOT NULL,
            currency TEXT NOT NULL DEFAULT 'GHS',
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            paid_at TEXT
        )",
        'columns' => 'id, token, client_id, client_name, client_email, amount, currency, description, status,
            created_at, paid_at',
        'indexes' => [],
    ],
] as $table => $spec) {
    $onDelete = null;
    foreach ($pdo->query("PRAGMA foreign_key_list({$table})")->fetchAll() as $fk) {
        if ($fk['from'] === 'client_id') {
            $onDelete = strtoupper((string) $fk['on_delete']);
        }
    }
    if ($onDelete !== null && $onDelete !== 'SET NULL') {
        rebuildTable($pdo, $table, $spec['create'], $spec['columns'], $spec['indexes']);
        echo "Rebuilt {$table} — client_id FK now correctly ON DELETE SET NULL.\n";
    }
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
if (!in_array('published_at', $socialDraftColumns, true)) {
    $pdo->exec('ALTER TABLE social_post_drafts ADD COLUMN published_at TEXT');
}
if (!in_array('publish_error', $socialDraftColumns, true)) {
    $pdo->exec('ALTER TABLE social_post_drafts ADD COLUMN publish_error TEXT');
}

$clientColumns = array_column($pdo->query('PRAGMA table_info(clients)')->fetchAll(), 'name');
if (!in_array('phone', $clientColumns, true)) {
    $pdo->exec('ALTER TABLE clients ADD COLUMN phone TEXT');
}

$leadColumns = $pdo->query('PRAGMA table_info(marketing_leads)')->fetchAll();
$leadColumnNames = array_column($leadColumns, 'name');
if (!in_array('contact_phone', $leadColumnNames, true)) {
    $pdo->exec('ALTER TABLE marketing_leads ADD COLUMN contact_phone TEXT');
}
if (!in_array('pitch_channel', $leadColumnNames, true)) {
    $pdo->exec('ALTER TABLE marketing_leads ADD COLUMN pitch_channel TEXT');
}

// SQLite can't relax a NOT NULL constraint via ALTER TABLE — rebuild the
// table if website_url is still marked NOT NULL from before leads with no
// website were supported.
$leadColumns = $pdo->query('PRAGMA table_info(marketing_leads)')->fetchAll();
foreach ($leadColumns as $col) {
    if ($col['name'] === 'website_url' && (int) $col['notnull'] === 1) {
        // drip_enrollments.lead_id references this table — rebuildTable()
        // (not a bare RENAME/DROP) is what keeps that foreign key intact.
        rebuildTable(
            $pdo,
            'marketing_leads',
            "CREATE TABLE %s (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                business_name TEXT NOT NULL,
                website_url TEXT,
                contact_email TEXT,
                contact_phone TEXT,
                pitch_channel TEXT CHECK (pitch_channel IS NULL OR pitch_channel IN ('email', 'phone')),
                status TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'audited', 'pitch_ready', 'sent', 'rejected')),
                audit_findings TEXT,
                pitch_subject TEXT,
                pitch_body TEXT,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                sent_at TEXT
            )",
            'id, business_name, website_url, contact_email, contact_phone, pitch_channel, status,
             audit_findings, pitch_subject, pitch_body, notes, created_at, updated_at, sent_at',
            ['CREATE INDEX IF NOT EXISTS idx_marketing_leads_status ON marketing_leads (status, created_at)']
        );
        break;
    }
}

$dripEnrollmentColumns = array_column($pdo->query('PRAGMA table_info(drip_enrollments)')->fetchAll(), 'name');
if (!in_array('nurturer_enabled', $dripEnrollmentColumns, true)) {
    $pdo->exec('ALTER TABLE drip_enrollments ADD COLUMN nurturer_enabled INTEGER NOT NULL DEFAULT 0');
}
if (!in_array('lead_industry', $dripEnrollmentColumns, true)) {
    $pdo->exec('ALTER TABLE drip_enrollments ADD COLUMN lead_industry TEXT');
}
if (!in_array('last_action', $dripEnrollmentColumns, true)) {
    $pdo->exec('ALTER TABLE drip_enrollments ADD COLUMN last_action TEXT');
}

// --- Email automations -------------------------------------------------------
// Generalise the single global drip into named, trigger-driven automations.
// Automation #1 is the original cold-lead outreach sequence; every existing
// step and enrollment belongs to it, so nothing already in flight changes
// behaviour. Seeded active (unlike the trigger automations added later, which
// ship inactive) precisely to preserve the old always-on marketing follow-up.
if ((int) $pdo->query('SELECT COUNT(*) FROM automations')->fetchColumn() === 0) {
    $pdo->prepare(
        "INSERT INTO automations (id, name, description, trigger_event, is_active)
         VALUES (1, ?, ?, 'marketing_pitch_sent', 1)"
    )->execute([
        'Cold-lead outreach follow-up',
        'The original outreach sequence. A contact is enrolled when you mark a marketing pitch as sent, or by hand.',
    ]);
}

// Seed a starter (inactive) automation for each remaining lifecycle trigger so
// the whole CRM funnel is visible and one edit away from live. Gated by a
// settings flag rather than an existence check per trigger, so an automation
// the admin deliberately deletes doesn't get resurrected on the next deploy.
if ($pdo->query("SELECT value FROM settings WHERE name = 'automations_defaults_seeded'")->fetchColumn() === false) {
    $defaults = [
        ['inquiry_created', 'New inquiry welcome', 'Greets anyone who sends a message through the contact form.'],
        ['quote_requested', 'Quote request follow-up', 'Follows up with people who submit a detailed project request.'],
        ['proposal_sent', 'Proposal nudge', 'Gentle reminders after a proposal goes out but is not yet accepted.'],
        ['payment_received', 'Client onboarding', 'Welcomes and onboards a client once their payment succeeds.'],
        ['appointment_booked', 'Booking prep', 'Preps a lead for their upcoming call after they book.'],
        ['project_completed', 'Review request', 'Asks for a testimonial after a session or engagement wraps.'],
        ['newsletter_subscribed', 'Newsletter nurture', 'Introduces new newsletter subscribers to your work.'],
        ['chat_lead_captured', 'Chat lead follow-up', 'Follows up with leads who left their details in the live chat.'],
    ];
    $insAuto = $pdo->prepare('INSERT INTO automations (name, description, trigger_event, is_active) VALUES (?, ?, ?, 0)');
    foreach ($defaults as [$trigger, $name, $description]) {
        $insAuto->execute([$name, $description, $trigger]);
    }
    $pdo->prepare("INSERT INTO settings (name, value) VALUES ('automations_defaults_seeded', '1')")->execute();
    echo 'Seeded ' . count($defaults) . " starter automations (inactive).\n";
}

// Steps gain an automation_id (existing rows -> #1), then the table is rebuilt
// to attach the FK + ON DELETE CASCADE. The column is added WITHOUT the
// REFERENCES clause because SQLite forbids ALTER ADD COLUMN with both a foreign
// key and a non-NULL default; the rebuild below carries the real FK in.
$dripStepColumns = array_column($pdo->query('PRAGMA table_info(drip_steps)')->fetchAll(), 'name');
if (!in_array('automation_id', $dripStepColumns, true)) {
    $pdo->exec('ALTER TABLE drip_steps ADD COLUMN automation_id INTEGER NOT NULL DEFAULT 1');
}
$dripStepSql = $pdo->query(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'drip_steps'"
)->fetchColumn();
if ($dripStepSql && !str_contains($dripStepSql, 'REFERENCES automations')) {
    rebuildTable(
        $pdo,
        'drip_steps',
        "CREATE TABLE %s (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            automation_id INTEGER NOT NULL DEFAULT 1 REFERENCES automations(id) ON DELETE CASCADE,
            day_offset INTEGER NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        'id, automation_id, day_offset, subject, body, is_active, created_at, updated_at'
    );
}

// Enrollments gain automation_id first (constant DEFAULT 1 backfills every
// existing row; no REFERENCES here for the same reason as drip_steps above),
// THEN the table is rebuilt to attach the FK, swap the old single-column
// UNIQUE(email) for UNIQUE(automation_id, email), and widen the source CHECK
// to accept trigger-driven enrollments. Adding the column before the rebuild
// lets the rebuild's INSERT ... SELECT carry automation_id across like any other.
$dripEnrollmentColumns = array_column($pdo->query('PRAGMA table_info(drip_enrollments)')->fetchAll(), 'name');
if (!in_array('automation_id', $dripEnrollmentColumns, true)) {
    $pdo->exec('ALTER TABLE drip_enrollments ADD COLUMN automation_id INTEGER NOT NULL DEFAULT 1');
}
$dripEnrollmentSql = $pdo->query(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'drip_enrollments'"
)->fetchColumn();
if ($dripEnrollmentSql && !str_contains($dripEnrollmentSql, 'UNIQUE (automation_id, email)')) {
    rebuildTable(
        $pdo,
        'drip_enrollments',
        "CREATE TABLE %s (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            automation_id INTEGER NOT NULL DEFAULT 1 REFERENCES automations(id) ON DELETE CASCADE,
            email TEXT NOT NULL,
            name TEXT,
            source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'marketing_lead', 'trigger')),
            lead_id INTEGER NULL REFERENCES marketing_leads(id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'stopped')),
            unsubscribe_token TEXT UNIQUE NOT NULL,
            enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
            nurturer_enabled INTEGER NOT NULL DEFAULT 0,
            lead_industry TEXT,
            last_action TEXT,
            UNIQUE (automation_id, email)
        )",
        'id, automation_id, email, name, source, lead_id, status, unsubscribe_token, enrolled_at,
         nurturer_enabled, lead_industry, last_action',
        [
            'CREATE INDEX IF NOT EXISTS idx_drip_enrollments_status ON drip_enrollments (status, enrolled_at)',
            'CREATE INDEX IF NOT EXISTS idx_drip_enrollments_automation ON drip_enrollments (automation_id, status)',
        ]
    );
}

// The automation_id indexes are created here (not in schema.sql, which runs
// before the columns exist on an upgrade) and unconditionally (not inside the
// ADD COLUMN / rebuild guards, which are skipped on a fresh install where the
// columns already came from schema.sql). CREATE INDEX IF NOT EXISTS makes both
// paths idempotent.
$pdo->exec('CREATE INDEX IF NOT EXISTS idx_drip_steps_automation ON drip_steps (automation_id, day_offset)');
$pdo->exec('CREATE INDEX IF NOT EXISTS idx_drip_enrollments_automation ON drip_enrollments (automation_id, status)');

// Decision columns on an existing beacon_scan_seen (it only recorded the URL
// when first shipped) — nullable, since rows scanned before this have no
// decision to backfill.
$beaconScanColumns = array_column($pdo->query('PRAGMA table_info(beacon_scan_seen)')->fetchAll(), 'name');
foreach (['qualified' => 'INTEGER', 'confidence_score' => 'INTEGER', 'reasoning' => 'TEXT'] as $col => $type) {
    if (!in_array($col, $beaconScanColumns, true)) {
        $pdo->exec("ALTER TABLE beacon_scan_seen ADD COLUMN {$col} {$type}");
    }
}

// SQLite can't relax a CHECK constraint via ALTER TABLE — rebuild the table
// if 'cron' (added for run_beacon_discovery.php) isn't in it yet.
$beaconLeadsSql = $pdo->query(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'beacon_social_leads'"
)->fetchColumn();
if ($beaconLeadsSql && !str_contains($beaconLeadsSql, "'cron'")) {
    rebuildTable(
        $pdo,
        'beacon_social_leads',
        "CREATE TABLE %s (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL,
            username TEXT NOT NULL,
            post_content TEXT NOT NULL,
            post_url TEXT,
            confidence_score INTEGER NOT NULL,
            reasoning TEXT NOT NULL,
            drafted_reply TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'draft' CHECK (source IN ('draft', 'chat', 'cron')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        'id, platform, username, post_content, post_url, confidence_score, reasoning, drafted_reply,
         source, created_at',
        ['CREATE INDEX IF NOT EXISTS idx_beacon_social_leads_created ON beacon_social_leads (created_at)']
    );
}

// Deliberately after the rebuild above, which recreates the table from an
// explicit column list — adding post_age first would just get dropped on any
// database still carrying the pre-'cron' CHECK.
$beaconLeadColumns = array_column($pdo->query('PRAGMA table_info(beacon_social_leads)')->fetchAll(), 'name');
if (!in_array('post_age', $beaconLeadColumns, true)) {
    $pdo->exec('ALTER TABLE beacon_social_leads ADD COLUMN post_age TEXT');
}

// Seed a starter drip sequence the first time the table appears — inactive
// on purpose, so nothing sends until the copy is reviewed and switched on.
if ((int) $pdo->query('SELECT COUNT(*) FROM drip_steps')->fetchColumn() === 0) {
    $seedStep = $pdo->prepare('INSERT INTO drip_steps (day_offset, subject, body, is_active) VALUES (?, ?, ?, 0)');
    $seedStep->execute([
        3,
        'Quick follow-up for {{name}}',
        "Hi {{name}},\n\nI reached out a few days ago about your website and didn't want my note to get buried. "
            . "If growing your online presence is on your radar this quarter, I'd love to show you a couple of quick wins I spotted.\n\n"
            . "No pressure either way — happy to answer questions whenever suits you.\n\nBest,\nPrince Caleb\nprincecaleb.dev",
    ]);
    $seedStep->execute([
        8,
        'A recent project you might find relevant',
        "Hi {{name}},\n\nIn case it's useful context: I recently rebuilt a local business's website and their enquiries went up noticeably within the first month. "
            . "You can see that case study (and others) here: https://princecaleb.dev/projects.html\n\n"
            . "If you'd like a free, no-strings look at what could be improved on your site, just reply to this email.\n\nBest,\nPrince Caleb",
    ]);
    $seedStep->execute([
        16,
        'Last note from me, {{name}}',
        "Hi {{name}},\n\nI'll keep this short — this is my last email. If a better website or some automation ever becomes a priority, "
            . "my door is open: https://princecaleb.dev/contact.html\n\nWishing you and the business all the best,\nPrince Caleb",
    ]);
    echo "Seeded 3 drip steps (inactive).\n";
}

echo "Schema applied.\n";
