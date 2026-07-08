# Prince Caleb — Portfolio Platform

A premium, zero-bloat portfolio and client-acquisition site for a web & mobile
app developer: a fast static/vanilla-JS public site backed by a custom PHP
REST API, a full admin CRUD panel (projects, blog, inquiries, quote requests,
proposals, payments, clients), a Paystack-powered checkout/invoicing flow, a
password-protected client portal, an AI-assisted marketing pipeline (pitch
drafting, social post drafts, Make.com automation events), and a secondary
opt-in AI assistant widget.

Backend: plain PHP (no framework), PDO + SQLite.
Frontend: static HTML + vanilla JS (fetch-based hydration) + Bootstrap 5 for
layout/utilities only — no build step, no bundler.

Live at [princecaleb.dev](https://princecaleb.dev).

## Setup

Requires PHP 8.1+ with the `pdo_sqlite` extension. No Composer, no Node, no
build step.

```bash
# 1. Apply the schema (safe to re-run any time schema.sql changes)
php database/migrate.php

# 2. Seed an admin user + sample projects/tags
php database/seed.php [admin-email] [admin-password]
# defaults: admin@princecaleb.dev / change-me-now-123 — change this in production

# 3. Optional: seed the 50 blog posts + generate their cover art
php database/generate_blog_covers.php
php database/seed_blog_posts.php

# 4. Regenerate the sitemap after adding/publishing content
php database/generate_sitemap.php

# 5. Run the dev server
php -S localhost:8010 -t public public/index.php
```

Visit `http://localhost:8010` for the public site and
`http://localhost:8010/admin/login.html` for the admin panel.

## Project layout

```
public/                  # web root — only this folder is web-exposed
  index.php               # front controller: routes /api/v1/* only
  .htaccess               # Apache rewrite rules for production
  index.html, services.html, projects.html, project.html, contact.html
  blog.html, blog-post.html, pricing.html, request.html, pay.html, payment-success.html
  admin/                  # admin panel (static HTML + JS, JWT-protected API calls)
    payments.html, quote-requests.html, blog.html, inquiries.html, ...
  css/app.css             # public site design system
  css/admin.css           # admin panel styling
  js/                     # api.js (fetch wrapper), render/page scripts, ai-widget
  uploads/                # project covers, blog cover art, project-request attachments
src/
  Controllers/            # ProjectController, BlogController, TagController,
                            InquiryController, ProjectRequestController,
                            ProposalController, PaymentController, ClientController,
                            ClientAuthController, ClientPortalController,
                            SocialDraftController, ShortLinkController,
                            IntegrationController, MarketingLeadController,
                            TestimonialController, NewsletterController,
                            AppointmentController, SettingsController,
                            AuthController, AiChatController, LiveChatController,
                            and more
  Middleware/              # AuthMiddleware (admin JWT), ClientAuthMiddleware
                            (client portal JWT, isolated via a `type` claim —
                            see #27), RateLimitMiddleware
  Support/                 # Database (PDO singleton), Jwt, Settings, Validator,
                            Response, Mailer, AiText (Gemini/OpenRouter fallback,
                            can report which provider succeeded), MakeWebhook
                            (push + log every automation event), ShortLink
                            (getOrCreate/resolve for the /s/{code} redirector)
  Router.php                # tiny hand-rolled router — no framework dependency
  autoload.php               # minimal PSR-4-style autoloader for the App\ namespace
config/config.php         # env-based settings, memoized via appConfig()
database/
  schema.sql               # SQLite schema
  migrate.php               # applies schema.sql (+ guarded ALTER TABLE for existing DBs)
  seed.php                  # admin user + sample projects/tags
  seed_real_projects.php     # real project case studies
  blog_posts_data.php, generate_blog_covers.php, seed_blog_posts.php
                              # the 50 blog posts + their generated SVG cover art
  generate_sitemap.php       # regenerates public/sitemap.xml
  process_webhooks.php      # drains webhook_queue → Slack/email (run via cron/Task Scheduler)
  send_appointment_reminders.php  # ~24h-before booking reminder emails (cron)
  send_milestone_reminders.php    # unpaid proposal milestone nudges (cron)
  send_stale_lead_alerts.php      # Make.com event for quote requests stuck in New/Reviewing (cron)
  generate_social_drafts.php      # AI social post drafts on a daily/weekly cadence (cron)
storage/
  db/portfolio.sqlite       # SQLite database file (gitignored)
  logs/
```

## How it fits together

1. **Public pages are static HTML** that fetch from `/api/v1/*` on load — no
   server-side templating, so they're as fast as any static file plus one
   small JSON round-trip.
2. **Auth** is JWT (hand-rolled HS256, no dependency) in httponly cookies,
   with a `token_version` column on `users` so changing a password/logging
   out everywhere invalidates all outstanding tokens instantly.
3. **Contact form** is honeypot-protected, rate-limited (5/hour/IP by
   default), and queues a `webhook_queue` row instead of calling Slack inline
   — run `php database/process_webhooks.php` on a schedule to drain it, so a
   slow third-party API never slows down the form response.
4. **AI assistant** is fully optional infrastructure: its JS
   (`ai-widget.js`) only loads the first time a visitor clicks the toggle
   button, and the backend falls back to simple keyword matching against
   your published projects if no `GEMINI_API_KEY` is configured.
5. **Admin panel** (`/admin/*`) is plain static HTML + JS calling the same
   JWT-protected `/api/v1/admin/*` endpoints — projects CRUD, blog CRUD
   (with cover image upload), an inquiries inbox (read/flag/archive) split
   into general contact vs. quote requests, a payments section (Paystack
   transaction log + generate-a-payment-link), tag management, site content
   (all editable homepage/pricing copy), and account settings. Includes contextual SVG tooltips for quick help on forms and cards.
6. **Blog** (`/blog.html`, `/blog-post.html`) is a normal CRUD resource
   (`blog_posts` table) with category filtering, pagination (10/page),
   reading-time estimates, share buttons, and per-post OG/Twitter meta +
   JSON-LD structured data for SEO.
7. **Project requests** (`/request.html`) are a richer, honeypot + rate
   limited alternative to the plain contact form — project type, budget,
   timeline, feature checkboxes, and up to 5 file attachments (validated by
   extension *and* file signature, not just the extension string). They land
   in the same `inquiries` table (`type = 'project_request'`) but get their
   own admin page (`/admin/quote-requests.html`), and trigger both the usual
   admin Slack/email notification *and* a best-effort confirmation email
   back to the requester.
8. **Payments** use Paystack. The public key/checkout amount are fetched by
   the browser from `/api/v1/payments/config`; the secret key never leaves
   the server. Two flows share one `payments` ledger table: a fixed-price
   "pay deposit to start" button on `/pricing.html` for the bounded-scope
   Starter tier, and admin-generated one-off payment links
   (`/pay.html?token=...`) for custom-quoted work. Every charge is confirmed
   server-side against Paystack's verify API (never trusted from the
   client-side popup alone), with the webhook endpoint
   (`/api/v1/payments/webhook`, HMAC-SHA512 signature checked) as a backstop
   if the browser never calls back. Once the browser-side verification
   returns `success`, both checkout flows redirect to
   `/payment-success.html`, which shows a confirmation message and the
   Paystack reference.
9. **Site widgets** (Live Chat, WhatsApp) are on by default and can be
   switched off independently from Admin → Settings without touching the
   underlying contact details — disabling Live Chat also cancels its
   auto-open popup, not just the button.
10. **Newsletter** signup lives on `/blog.html` (honeypot + rate-limited,
    same pattern as the other public forms). Subscribers land in
    `newsletter_subscribers` and get a one-click unsubscribe link
    (`/api/v1/newsletter/unsubscribe?token=...`) — re-subscribing an
    unsubscribed address just reactivates the existing row instead of
    erroring. Admin view/export/remove at `/admin/newsletter.html`.
11. **PWA**: `public/manifest.json` + `public/sw.js` make the site
    installable. The app icons (`public/icons/`) are hand-encoded PNGs
    written directly with PHP's zlib functions — no GD/Imagick dependency —
    via `database/generate_pwa_icons.php` (re-run it if the icon design
    ever changes). The service worker deliberately never caches `/api/*`
    or `/admin/*`, only the static app shell, so nothing stale is ever
    served for content or admin data.
12. **Pricing content** is editable from Admin -> Pricing. Tier names,
    displayed prices, taglines, feature lists, the public currency, and the
    Starter checkout amount are stored in the `settings` table and hydrate
    the static public pages. Admin -> Settings still holds the Paystack keys.
13. **Project estimation calculator** on `/pricing.html` is pure client-side
    JS (project type + feature checkboxes + timeline → a rounded price
    range) — no backend call, since it's explicitly a rough estimate, not
    a quote. Links out to `/request.html` for an exact number.
14. **Career timeline** and **GitHub activity feed** on `/about.html` are
    both admin-configurable and hidden until set: the timeline's five
    stages are editable text (Admin → Site Content), and the GitHub feed
    fetches directly from `api.github.com` in the visitor's browser (no
    backend call, no API key needed) once a `github_username` is set.
15. **Blog code snippets**: post bodies support ` ```lang ` fenced code
    blocks (plain text otherwise), rendered with highlight.js. Fence
    content is HTML-escaped even though surrounding prose isn't (prose is
    admin-authored and trusted; code often contains `<`/`>`/`&` that must
    render literally).
16. **Accessibility**: every public page has a skip-to-content link
    (`.skip-link`, visible on keyboard focus) targeting a landmark at the
    start of the page's main content.
17. **Analytics** (`/admin/analytics.html`) is first-party and deliberately
    minimal — `page_views` stores only path, referrer, and timestamp, no
    IP address or cookie/visitor ID, via a tiny fire-and-forget beacon
    (`js/analytics.js`) on every public page (never on `/admin/*`).
    Disclosed in the Privacy Policy.
18. **Appointment booking** (`/book.html`) uses an internal availability
    model, not an external calendar account — the admin sets bookable
    weekdays/hours/slot length in Settings (same pattern as Live Chat
    hours), and slots are generated on the fly and checked against
    existing bookings. A partial unique index
    (`idx_appointments_slot_active`, `WHERE status != 'cancelled'`) is the
    real source of truth for conflict prevention — a cancelled booking
    frees its slot, but two active bookings can never collide even under
    a race. Admin view/cancel at `/admin/appointments.html`. A separate
    cron script (`database/send_appointment_reminders.php`) emails a
    reminder ~24h before each confirmed booking, guarded by a
    `reminder_sent` flag so it only ever sends once per booking.
19. **Testimonials** are a client-facing review pipeline, separate from the
    hand-authored `testimonial_1/2/3` homepage CMS fields: admin sends a
    request (`/admin/testimonials.html`) which emails a one-time link
    (`/testimonial.html?token=...`), the client submits a quote + star
    rating through that link, and admin approves it before it appears on
    the public `/testimonials.html` page.
20. **Site-wide search** (`/search.html`, reachable via the 🔍 icon next to
    the theme toggle on every public page) does simple keyword scoring
    across published projects and blog posts server-side
    (`/api/v1/search?q=`) — no external search service, consistent with
    the rest of the app's zero-dependency approach.
21. **Two-factor authentication** for the admin login is a hand-rolled RFC
    6238 TOTP implementation (`src/Support/Totp.php`, no dependency —
    verified against the RFC 4226 reference test vectors), compatible with
    Google Authenticator/Authy. Enable/disable from Admin → Settings; once
    on, login is a two-step flow (`requires_2fa` from `/auth/login`, then
    `/auth/verify-2fa` with a code or one of 8 single-use backup codes
    issued at setup time). A short-lived `pending_2fa` cookie (5 min) links
    the two steps — no full session exists until the second factor checks
    out.
22. **Marketing Leads** (`/admin/marketing-leads.html`, admin-only — no
    public routes at all) is an internal outreach tool: add a target
    business, run a real technical audit of its site (SSL, mobile viewport
    meta tag, title/meta description, response time — genuinely verifiable,
    never fabricated), then draft an AI pitch that only references the
    actual findings. There is deliberately no bulk-send path — "Approve &
    Send" opens the admin's own mail client with the draft prefilled
    (`mailto:`), and the lead is only marked `sent` after that. The audit
    fetch has an SSRF guard (`MarketingLeadController::isSafeUrl`) blocking
    loopback/private/reserved IP targets. `website_url` is optional — a
    business with no site yet is a valid lead too, and skips straight to a
    generic (not fabricated-findings) pitch instead of an audit. The
    generated body is instructed to avoid invented statistics, false
    urgency, and unverifiable financial-harm claims; the sign-off and
    contact channels (WhatsApp/phone from Settings, portfolio URL) are
    appended in PHP from real data, never left for the model to guess at.
23. **OpenRouter fallback** (`src/Support/AiText.php`): every plain
    single-shot "prompt in, text out" AI call (pitch drafting, prototype
    generation, the secondary AI assistant) tries Gemini first and, if that
    fails for any reason (quota, outage, bad response), retries once
    against OpenRouter using whichever key/model is set in Admin →
    Settings → Integrations (defaults to `openrouter/free` if no model is
    given). Centralized in one class rather than duplicated per controller,
    since the Gemini call itself has already been the source of several
    subtle bugs this project had to debug.

    Live Chat's tool-calling conversation
    (`LiveChatController::chatWithGemini`/`chatWithOpenRouter`) gets the same
    fallback, but as a second, independent implementation rather than a
    shared one: Gemini's `functionCall`/`functionResponse` shape (with a
    `thoughtSignature` that must round-trip verbatim) and OpenAI-style
    `tools`/`tool_calls` (matched by `tool_call_id`) are different enough
    that there's no safe way to hand off *mid-round* — a failed turn is
    retried as a whole fresh turn on the other provider instead. Both
    implementations share one source of truth for the system prompt
    (`buildSystemPrompt`) and the tool declarations (`toolDeclarations`,
    translated to OpenAI's schema by `toolDeclarationsOpenAiFormat`) so the
    two providers can't drift into inconsistent behavior.
24. **Proposals & payment milestones** (`/admin/proposals.html`): admin turns
    a quote request into a formal proposal — scope, timeline, currency, and
    a list of payment milestones, each auto-generating its own
    `payment_links` row. The client reviews at `/proposal.html?token=...`
    and must type their name and check an agreement box before accepting
    (`proposals.accepted_by_name`/`accepted_ip`/`accepted_user_agent` record
    the audit trail); only then do the milestone "Pay now" buttons unlock.
    Accepted proposals can't be edited, nor can any proposal with a paid
    milestone. `database/send_milestone_reminders.php` (cron) nudges the
    client once, 3 days after acceptance, for any milestone still unpaid,
    guarded by `proposal_milestones.reminder_sent` so it only ever fires once.
25. **Payment reconciliation** (`/admin/payments.html`): beyond the Paystack
    transaction log, admin can mark a transaction `reviewed`, leave a note,
    and re-ask Paystack to verify a `pending` *or* `failed` charge (reuses
    the same public verify endpoint the checkout page itself calls).
26. **Quote request pipeline** (`/admin/quote-requests.html`): a
    `pipeline_stage` column (New → Reviewing → Proposal Sent → Won → Lost)
    separate from the existing read/unread mailbox `status`, since those are
    different concepts. Stage auto-advances to Proposal Sent when a proposal
    is linked and Won when that proposal is accepted; everything else is a
    manual dropdown, with a matching filter.
27. **Client portal** (`/client/*`): password-protected client accounts,
    provisioned by an admin "Invite to portal" action (never self-signup),
    showing a client's proposal/milestone status, a file exchange
    (`client_files`, admin- or client-uploaded, same extension + magic-byte
    validation as the project-request attachments), and two-way messaging
    (`client_messages`). Client auth mirrors the admin JWT-cookie system in
    `ClientAuthMiddleware`/`ClientAuthController` almost line for line, but
    is fully isolated from it: separate cookies (`client_access_token` vs
    `access_token`) and a distinct `type` claim in the JWT payload, so a
    stolen/replayed client token is rejected by admin routes and vice versa
    even though both share the same signing secret.
28. **Case study CMS improvements** (`/admin/projects.html`): projects can
    now carry a `outcome_metrics` results section, link to one approved
    `testimonials` row (rendered as a quote on the case study page — HTML
    escaped, since a testimonial's quote text originates from a public
    client-submission form, unlike the rest of a project's admin-authored
    fields), and an `is_featured` flag. The homepage hero previously always
    showed whichever project had the lowest `sort_order`; it now prefers the
    explicitly featured one, falling back to the old behavior if none is set.
29. **Make.com automation events** (`src/Support/MakeWebhook.php`): a single
    configurable webhook URL (Admin → Settings → Integrations) receives a
    JSON event for proposal acceptance, content publishing, testimonial
    approval, newsletter signups, and stale quote requests — one Make.com
    scenario routes all of them with a Router module keyed on the `event`
    field. Every event is also logged to `integration_events` regardless of
    whether the live push succeeded, and `GET /api/v1/integrations/events`
    (Bearer-authenticated with a key generated in Settings) lets a scheduled
    Make.com poller catch up on anything the webhook missed — it defaults to
    only undelivered events, so the poller can run continuously alongside
    the push webhook with no double-processing.
30. **AI social post drafts** (`/admin/social-drafts.html`): a scheduled
    (daily/weekly, Admin → Settings) or manually-triggered job drafts a
    social post — a LinkedIn/Facebook-length version, an X/Twitter-length
    version, and hashtags — from the most recently published blog post,
    case study, or approved testimonial that hasn't already been drafted,
    falling back to an original evergreen post (rotated across a few angles)
    when there's nothing new to spotlight. Reuses `AiText::generate()` (the
    same Gemini/OpenRouter fallback as Marketing Leads pitch drafting) and
    the same "grounded prompt → JSON out" pattern. A blog/case-study draft
    also carries that source's cover image (`image_url`, editable/clearable
    in the review modal); evergreen and testimonial drafts have none by
    default since there's no natural image to attach. Admin reviews/edits
    before approving; approval fires the `social_post_approved` Make.com
    event above — actual publishing to social platforms happens in Make.com
    via its platform connectors, not in this app. Each draft also records
    which provider (`ai_provider`: `gemini` or `openrouter`) actually
    generated it, shown in the admin list and review modal — useful for
    noticing if Gemini's quota is exhausted and everything is quietly
    falling back to OpenRouter. Blog/case-study links in the drafted text
    go through a self-hosted shortener (`src/Support/ShortLink.php`,
    `princecaleb.dev/s/{code}`, public redirect via `ShortLinkController`)
    rather than the full `/blog-post.html?slug=...` URL, since every
    character counts on the X/Twitter-length version — `getOrCreate()`
    reuses the same code if the same page is ever linked again.
31. **Automated onboarding email**: `PaymentController::verifyAndRecord()`
    sends a "payment received — next steps" email (via `Mailer::send()`)
    right after the genuine pending → success transition for a payment. It's
    naturally guarded against firing twice — both the client-side `/verify`
    call and the Paystack webhook route through the same method, and its
    existing idempotency check (`if ($payment['status'] === 'success') return
    'success';`) short-circuits every call after the first for a given
    reference. The email covers what happens next, a link to `/book.html` for
    a kickoff call, and what to have ready (brand assets, references,
    must-have features).
32. **Admin activity log** (`/admin/activity-log.html`): an audit trail of
    admin actions, written via `src/Support/ActivityLog.php` and stored in
    `admin_activity_log` (never throws — a logging failure never blocks the
    action that triggered it). Covers every admin DELETE endpoint (projects,
    blog posts, tags, payments, client files, newsletter subscribers,
    testimonials, marketing leads, social drafts), payment link creation,
    pricing settings changes, testimonial approve/reject, and inquiry
    status/pipeline-stage changes. The viewer page filters by entity type and
    paginates 50 rows at a time — each row shows who acted, what action, on
    which record (with a denormalized label so the entry stays readable even
    after the underlying record is deleted or renamed), and JSON-encoded
    extra details where relevant (e.g. changed pricing keys).
33. **Composio connected accounts** (Admin -> Settings -> Connected Accounts,
    `src/Support/Composio.php`, `ComposioController.php`): lets the app take
    real actions in third-party apps (Google Calendar, Gmail, Slack, WhatsApp
    Business - extendable via `ComposioController::TOOLKITS`) on the admin's
    behalf, via Composio's OAuth-managed tool-calling API. Each toolkit
    needs an Auth Config ID (created once in the Composio dashboard) pasted
    into Settings, then a one-time Connect flow that opens Composio's OAuth
    authorization in a new tab. Booking actions can be configured per tool
    from the same Settings form. **Status: Calendar/Gmail/Slack/WhatsApp
    connect flow built, not yet exercised against a live Composio account.**

## Deployment (Namecheap cPanel)

The live site runs on Namecheap shared hosting. The layout keeps everything
except the web root out of reach of the browser:

```
/home/<cpanel-user>/
  src/  config/  database/  storage/   # uploaded as-is, above the web root
  .env                                  # production secrets (never committed)
  public_html/                          # the CONTENTS of public/
```

Deploys are automatic: pushing to `main` triggers
`.github/workflows/deploy.yml`, which FTPS-syncs `public/` into
`public_html/` and `src/`, `config/`, `database/` into the home directory.
It needs three repository secrets — `FTP_SERVER`, `FTP_USERNAME`,
`FTP_PASSWORD` — for an FTP account rooted at the cPanel home directory.
`public/index.php` resolves the app via `dirname(__DIR__)`, so this split
works unchanged. (Manual upload via cPanel File Manager still works too.)

One-time setup on a new host:

1. Create `.env` from `.env.example` with `APP_ENV=production` and a strong
   `JWT_SECRET` (`php -r "echo bin2hex(random_bytes(48));"`).
2. In cPanel → Select PHP Version, pick PHP 8.1+ and enable `pdo_sqlite`.
3. Run from the home directory (cPanel Terminal or SSH):
   ```
   php database/migrate.php
   php database/seed.php <email> <password>
   php database/generate_blog_covers.php   # only needed once, or after editing blog_posts_data.php
   php database/seed_blog_posts.php        # seeds/updates the 50 blog posts
   php database/generate_sitemap.php
   ```
4. Add a cron job (every 5 minutes):
   `/usr/local/bin/php /home/<cpanel-user>/database/process_webhooks.php > /dev/null`
4b. Add a second cron job (every 30 minutes) for booking reminders:
    `/usr/local/bin/php /home/<cpanel-user>/database/send_appointment_reminders.php > /dev/null`
4c. Add a third cron job (once a day) for unpaid milestone reminders:
    `/usr/local/bin/php /home/<cpanel-user>/database/send_milestone_reminders.php > /dev/null`
4d. Add a fourth cron job (once a day) for stale quote-request alerts (only
    fires if a Make.com webhook URL is set in Admin -> Settings):
    `/usr/local/bin/php /home/<cpanel-user>/database/send_stale_lead_alerts.php > /dev/null`
4e. Add a fifth cron job (once a day) for AI social post drafts (only
    fires if enabled in Admin -> Settings -> Content):
    `/usr/local/bin/php /home/<cpanel-user>/database/generate_social_drafts.php > /dev/null`
5. Confirm AutoSSL has issued a certificate — `.dev` domains are
   HSTS-preloaded and will not load over plain HTTP.
6. In Admin -> Settings -> Payments (Paystack), paste in your Paystack public
   and secret keys (start with the `pk_test_`/`sk_test_` pair). Then use
   Admin -> Pricing for the currency, displayed tier prices/features, and
   Starter-tier checkout amount. Nothing payment-related is reachable until
   these are set: `paystack_public_key` gates checkout, and
   `pricing_tier_1_amount` gates the Starter deposit button's visibility.
   In the Paystack dashboard, add
   `https://princecaleb.dev/api/v1/payments/webhook` under Settings → API
   Keys & Webhooks so payments still reconcile even if a customer closes the
   tab before the in-browser verify call fires.
7. Optional integrations, all in Admin -> Settings -> Integrations: a Gemini
   and/or OpenRouter API key powers Live Chat, Marketing Leads pitch
   drafting, and AI social post drafts (all degrade gracefully — keyword
   fallback, generic pitch, or a clear "could not generate" error — if
   neither is configured). A Make.com webhook URL + a generated integration
   API key enable the automation events in #29; nothing breaks if these are
   left blank, the relevant code paths just no-op.

## Notes for production

- Switch `db_path` to a proper path outside the web root, or move to
  MySQL/PostgreSQL (the `pdo_mysql`/`pdo_pgsql` extensions are already
  enabled) if traffic grows — the `Database` class is the only place that
  would need to change.
- Serve `/uploads` via a CDN instead of directly from the PHP host.
- Add response caching (APCu/Redis) in front of the three public GET
  endpoints (`/projects`, `/projects/{slug}`, `/tags`) once traffic
  justifies it.
- Schedule `database/process_webhooks.php` via cron (Linux) or Windows Task
  Scheduler — it's designed to run standalone, decoupled from requests.
- Change the seeded admin password immediately in any non-local environment.
- `schema.sql` changes don't apply themselves — after any deploy that
  touches it, re-run `php database/migrate.php` on the server (it's
  idempotent: `CREATE TABLE IF NOT EXISTS` for new tables, guarded
  `ALTER TABLE ADD COLUMN` checks for columns added to existing tables).
