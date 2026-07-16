CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_backup_codes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  case_study_body TEXT,
  category TEXT NOT NULL CHECK (category IN ('custom_solution', 'cms', 'mobile')),
  live_url TEXT,
  repo_url TEXT,
  cover_image_path TEXT NOT NULL,
  gallery_json TEXT,
  is_embeddable INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  outcome_metrics TEXT,
  testimonial_id INTEGER NULL REFERENCES testimonials(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_published_sort ON projects (is_published, sort_order);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS project_tags (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  source_project_id INTEGER NULL REFERENCES projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'flagged', 'archived')),
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  type TEXT NOT NULL DEFAULT 'contact' CHECK (type IN ('contact', 'project_request')),
  pipeline_stage TEXT NOT NULL DEFAULT 'new'
    CHECK (pipeline_stage IN ('new', 'reviewing', 'proposal_sent', 'won', 'lost')),
  stale_alert_sent INTEGER NOT NULL DEFAULT 0,
  project_type TEXT,
  budget TEXT,
  timeline TEXT,
  features TEXT,
  attachments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inquiries_status_created ON inquiries (status, created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TEXT NOT NULL,
  UNIQUE (ip_address, endpoint, window_start)
);

CREATE TABLE IF NOT EXISTS settings (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  transcript_json TEXT NOT NULL DEFAULT '[]',
  prototype_html TEXT,
  prototype_status TEXT NOT NULL DEFAULT 'none'
    CHECK (prototype_status IN ('none', 'generated', 'approved', 'changes_requested')),
  client_comment TEXT,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  admin_seen INTEGER NOT NULL DEFAULT 0,
  ready_for_prototype INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_feedback ON chat_sessions (prototype_status, admin_seen);

CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  cover_image_path TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_sort ON blog_posts (is_published, sort_order);

CREATE TABLE IF NOT EXISTS webhook_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  slack_sent INTEGER NOT NULL DEFAULT 0,
  email_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_links (
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
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  customer_name TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  description TEXT,
  source TEXT NOT NULL DEFAULT 'tier_checkout' CHECK (source IN ('tier_checkout', 'payment_link')),
  payment_link_id INTEGER NULL REFERENCES payment_links(id) ON DELETE SET NULL,
  tos_accepted INTEGER,
  tos_accepted_at TEXT,
  tos_version TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  reviewed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_status_created ON payments (status, created_at);

CREATE TABLE IF NOT EXISTS proposals (
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
);
CREATE INDEX IF NOT EXISTS idx_proposals_status_created ON proposals (status, created_at);

CREATE TABLE IF NOT EXISTS proposal_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id INTEGER NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  payment_link_id INTEGER NULL REFERENCES payment_links(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  due_note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_proposal_milestones_proposal ON proposal_milestones (proposal_id, sort_order);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed')),
  unsubscribe_token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Deliberately minimal: path + referrer + date only. No IP address, no
-- cookie/visitor ID, no cross-site tracking — just enough to see which
-- pages get read, not who's reading them.
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  referrer TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_page_views_path_created ON page_views (path, created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views (created_at);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments (appointment_date, status);
-- Partial unique index: a cancelled booking frees the slot for someone else,
-- but two active (confirmed/completed) bookings can never share a slot.
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_slot_active
  ON appointments (appointment_date, appointment_time) WHERE status != 'cancelled';

-- A client-facing review pipeline: admin requests a testimonial (generates a
-- token + emails a link), the client submits a quote+rating via that token,
-- then admin approves before it's shown publicly. Separate from the static
-- testimonial_1/2/3 homepage CMS fields, which stay admin-authored.
CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  project_reference TEXT,
  rating INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  quote TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'submitted', 'approved', 'rejected')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_testimonials_status_sort ON testimonials (status, sort_order);

-- Internal outreach tool: admin adds a target business, runs a real
-- technical audit of its site (SSL, viewport meta, title/description,
-- response time — genuinely verifiable, never fabricated), then drafts an
-- AI pitch grounded only in the actual findings. Sending stays a deliberate,
-- one-at-a-time action (opens the admin's own mail client) rather than a
-- bulk auto-send, since these are unsolicited contacts. website_url is
-- nullable: a business with no site yet is a valid, arguably stronger lead
-- (the pitch is just a generic "let's build your first site" intro instead
-- of audit findings).
CREATE TABLE IF NOT EXISTS marketing_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name TEXT NOT NULL,
  website_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  -- Which outreach channel the current pitch_subject/pitch_body were
  -- drafted for: 'email' (subject + body) or 'phone' (body holds call
  -- talking points, subject stays NULL). NULL until a pitch is generated.
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
);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_status ON marketing_leads (status, created_at);

-- Social posts/comments Beacon has judged worth a reply. source distinguishes
-- leads the automated draft() pipeline logged deterministically (qualified
-- === true in its JSON output), ones found by the scheduled discovery cron
-- (run_beacon_discovery.php), and ones logged via the log_qualified_lead
-- tool during a direct chat() conversation.
CREATE TABLE IF NOT EXISTS beacon_social_leads (
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
);
CREATE INDEX IF NOT EXISTS idx_beacon_social_leads_created ON beacon_social_leads (created_at);

-- URLs run_beacon_discovery.php has already evaluated (qualified or not) —
-- dedupes so the same search result isn't re-scored (and re-billed, both
-- Serper and the AI call) on every cron run.
--
-- It also records the decision, not just the fact of it: beacon_social_leads
-- only keeps the leads that qualified, so without this there'd be no record of
-- what Beacon rejected or why, and no way to tell an over-strict rule from a
-- keyword that genuinely returns no prospects. qualified is 1/0, or NULL when
-- the scoring call itself failed (which is why it's nullable, and why the
-- columns can't be NOT NULL — rows predating this also have no decision).
CREATE TABLE IF NOT EXISTS beacon_scan_seen (
  url TEXT PRIMARY KEY,
  scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
  qualified INTEGER,
  confidence_score INTEGER,
  reasoning TEXT
);

-- Client portal accounts. Rows are provisioned by an admin invite (from a
-- proposal), never self-signup — password_hash stays NULL until the client
-- completes /client/setup.html?token=..., mirroring how proposals.token
-- grants one-time access before an account exists at all.
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT,
  token_version INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  invite_token TEXT UNIQUE,
  invite_expires_at TEXT,
  reset_token TEXT UNIQUE,
  reset_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS client_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  proposal_id INTEGER NULL REFERENCES proposals(id) ON DELETE SET NULL,
  uploaded_by TEXT NOT NULL CHECK (uploaded_by IN ('admin', 'client')),
  file_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_client_files_client ON client_files (client_id, created_at);

CREATE TABLE IF NOT EXISTS client_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('admin', 'client')),
  body TEXT NOT NULL,
  read_by_admin INTEGER NOT NULL DEFAULT 0,
  read_by_client INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_client_messages_client ON client_messages (client_id, created_at);

-- Backs the Make.com integration's pull fallback: every event MakeWebhook
-- pushes gets logged here too (whether or not the push itself succeeded),
-- so a Make.com scenario that missed the live webhook — paused, down,
-- URL not yet configured — can catch up later via GET
-- /api/v1/integrations/events?since_id=... instead of losing the event.
CREATE TABLE IF NOT EXISTS integration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  data TEXT NOT NULL,
  push_delivered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_integration_events_created ON integration_events (created_at);

-- AI-drafted social posts, generated on a schedule (see
-- database/generate_social_drafts.php) from the most recent published
-- content not yet drafted (blog post, project, or approved testimonial),
-- falling back to an original evergreen post when nothing new exists.
-- Admin reviews/edits before approving; approval fires a Make.com event
-- (sent_to_makecom guards against firing twice) so the actual publishing
-- is handled by Make.com's platform connectors, not built here.
CREATE TABLE IF NOT EXISTS social_post_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK (source_type IN ('blog', 'project', 'testimonial', 'general')),
  source_id INTEGER,
  content TEXT NOT NULL,
  short_content TEXT,
  hashtags TEXT,
  image_url TEXT,
  -- 'gemini', or the exact configured openrouter_model string (e.g.
  -- 'anthropic/claude-haiku-4.5') — not a fixed enum, since the admin can
  -- point openrouter_model at any model OpenRouter offers.
  ai_provider TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  sent_to_makecom INTEGER NOT NULL DEFAULT 0,
  -- Set when an external publishing integration actually published this draft
  -- on approval, publish_error holds the reason when that attempt failed, so
  -- the admin can see why nothing went out.
  published_at TEXT,
  publish_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_social_post_drafts_status ON social_post_drafts (status, created_at);

-- Self-hosted URL shortener, mainly so AI-drafted social posts can link back
-- to a blog post/case study without burning half of X/Twitter's character
-- budget on a long querystring URL. One row per distinct target_url —
-- ShortLink::getOrCreate() reuses an existing code rather than minting a
-- new one every time the same page is referenced.
CREATE TABLE IF NOT EXISTS short_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  target_url TEXT UNIQUE NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_short_links_code ON short_links (code);

-- Audit trail of admin actions (deletes, status changes, price edits, etc.),
-- written via ActivityLog::log(). entity_label is a denormalized snapshot
-- (e.g. a client name or slug) so the log stays readable after the record
-- itself is deleted or renamed.
CREATE TABLE IF NOT EXISTS admin_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_created ON admin_activity_log (created_at);

-- Client invoices. Amounts live on invoice_items in subunits (pesewas/kobo),
-- same convention as payments — the invoice total is always derived by
-- summing its items, never stored. token grants tokened public access to
-- /invoice.html (like proposals); payment_link_id ties the invoice to a
-- Paystack payment link so a successful charge flips it to paid and sends
-- the receipt (see PaymentController::verifyAndRecord).
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  client_id INTEGER NULL REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  issue_date TEXT NOT NULL DEFAULT (date('now')),
  due_date TEXT,
  notes TEXT,
  payment_link_id INTEGER NULL REFERENCES payment_links(id) ON DELETE SET NULL,
  sent_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices (status, created_at);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_amount INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items (invoice_id, sort_order);

-- Uptime monitoring for client sites, checked by database/check_uptime.php
-- on a cron. last_status/last_checked_at are denormalized onto the monitor
-- so list views never scan the checks table; alert_sent guards the
-- down-alert email the same way reminder_sent does elsewhere (reset on
-- recovery so the next outage alerts again).
CREATE TABLE IF NOT EXISTS uptime_monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  client_id INTEGER NULL REFERENCES clients(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_status TEXT CHECK (last_status IS NULL OR last_status IN ('up', 'down')),
  last_checked_at TEXT,
  last_status_changed_at TEXT,
  alert_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uptime_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL REFERENCES uptime_monitors(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('up', 'down')),
  http_status INTEGER,
  response_time_ms INTEGER,
  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uptime_checks_monitor ON uptime_checks (monitor_id, checked_at);

-- Recurring billing (e.g. monthly maintenance retainers) via Paystack
-- subscription plans. The admin creates a row, which creates a Paystack
-- plan + checkout link; the client authorizing that checkout is what
-- actually starts the subscription, reported back via webhook events
-- (subscription.create / charge.success / invoice.payment_failed).
-- Recurring charges land in subscription_charges rather than payments —
-- their references are minted by Paystack, not by this app.
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NULL REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  billing_interval TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'quarterly', 'biannually', 'annually')),
  paystack_plan_code TEXT,
  paystack_subscription_code TEXT,
  paystack_email_token TEXT,
  checkout_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'past_due', 'cancelled')),
  next_payment_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscription_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  reference TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  paid_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscription_charges_sub ON subscription_charges (subscription_id, paid_at);

-- Drip email sequence: a single global sequence of steps sent N days after
-- enrollment by database/send_drip_emails.php. Steps ship inactive by
-- default so nothing goes out until the admin has reviewed the copy.
-- {{name}} in subject/body is replaced per-recipient at send time.
CREATE TABLE IF NOT EXISTS drip_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_offset INTEGER NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One enrollment per email address. drip_sends records exactly which steps
-- an enrollment has received (unique per pair) so a step edited to a new
-- day_offset can never re-send, and a stopped/unsubscribed enrollment
-- simply stops matching the cron's query.
CREATE TABLE IF NOT EXISTS drip_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'marketing_lead')),
  lead_id INTEGER NULL REFERENCES marketing_leads(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'stopped')),
  unsubscribe_token TEXT UNIQUE NOT NULL,
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Opt-in per enrollment: when set, send_nurturer_emails.php also sends
  -- this lead the AI-personalized sequence 2/3 follow-ups (see
  -- nurturer_sends below), alongside whatever fixed drip_steps it gets.
  -- lead_industry/last_action feed straight into Nurturer's prompt inputs.
  nurturer_enabled INTEGER NOT NULL DEFAULT 0,
  lead_industry TEXT,
  last_action TEXT
);
CREATE INDEX IF NOT EXISTS idx_drip_enrollments_status ON drip_enrollments (status, enrolled_at);

CREATE TABLE IF NOT EXISTS drip_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id INTEGER NOT NULL REFERENCES drip_enrollments(id) ON DELETE CASCADE,
  step_id INTEGER NOT NULL REFERENCES drip_steps(id) ON DELETE CASCADE,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (enrollment_id, step_id)
);

-- Nurturer's AI-generated sends, kept separate from drip_sends (which only
-- stores a step_id reference back to a fixed template — wrong shape for
-- content that's unique per send). Only ever sequence_number 2 or 3 — that's
-- all Nurturer's own prompt defines; sequence 1 stays whatever fixed
-- drip_steps step (if any) the enrollment also receives.
CREATE TABLE IF NOT EXISTS nurturer_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id INTEGER NOT NULL REFERENCES drip_enrollments(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  subject_line TEXT NOT NULL,
  email_body TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (enrollment_id, sequence_number)
);
