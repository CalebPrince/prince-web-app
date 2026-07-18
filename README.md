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

## Current look and feel

The public site now positions Prince Caleb as a lean technical partner rather
than a generic agency portfolio. The homepage is organized around four
client-facing sections:

1. **Asymmetric Value Hero** - direct positioning around building useful web
   products "without platform bloat or agency overhead."
2. **Technical Archive** - the former blog surface has been reframed as
   engineering deep-dives and case-study notes, with text-first entries,
   metrics, domains, and clean typography instead of image thumbnails.
3. **Production Logs Registry** - the former project grid now reads like a
   development record: text-only project entries, performance badges, stack
   tags, delivery notes, and outcome metrics.
4. **Live Demonstration Arena** - the homepage closes with an interactive
   client-facing section for AI context, booking/scheduling, and immediate
   project next steps.

Pricing is consistent across the homepage and `/pricing.html`: Starter,
Growth, and Custom / Enterprise use the same tier names, amounts, summaries,
and feature lists. The visible navigation no longer links to a generic Blog
label; archive-style content remains available where the page itself is used.

The hero can carry an optional WebGL depth layer (see #35) behind the copy,
and UI chrome stays strictly monochrome throughout — e.g. the multi-step
form progress bar on `/request.html` uses the ink accent, not a stock
Bootstrap blue.

The admin styling was refreshed to match the public site: restrained
monochrome surfaces, tighter cards, clearer section grouping, and a more
technical editorial feel. New homepage content groups are editable from
Admin -> Site Content, including the value hero panel, homepage pricing copy,
technical archive entries, production log headings, and live demo arena copy.
These edits use the existing settings/content API and `settings` table; no
database schema, migrations, seed data, or stored records were changed for
this redesign.

## Setup

Requires PHP 8.1+ with the `pdo_sqlite` extension. No Composer, no Node, no
build step.

```bash
# 1. Apply the schema (safe to re-run any time schema.sql changes)
php database/migrate.php

# 2. Seed an admin user + sample projects/tags
php database/seed.php [admin-email] [admin-password]
# defaults: admin@princecaleb.dev / change-me-now-123 — change this in production

# 3. Optional: seed the 52 blog posts + generate their visible SVG covers
php database/generate_blog_covers.php
php database/seed_blog_posts.php

# 4. Regenerate the sitemap after adding/publishing content
php database/generate_sitemap.php

# Social share images are separate from visible blog covers. The committed
# PNGs under public/uploads/og/blog/ are only for Open Graph/Twitter previews
# and social draft image URLs. Regenerate them on a dev machine with Pillow
# after adding/editing seeded posts or changing brand art:
#   python scripts/generate_og_image.py
#   python scripts/generate_blog_og_images.py

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
  archive.html, archive-post.html, pricing.html, request.html, pay.html, payment-success.html
  admin/                  # admin panel (static HTML + JS, JWT-protected API calls)
    payments.html, quote-requests.html, blog.html, inquiries.html, ...
  css/app.css             # public site design system
  css/admin.css           # admin panel styling
  js/                     # api.js (fetch wrapper), render/page scripts, ai-widget,
                          #   hero-3d.js (WebGL hero) + vendor/ (self-hosted Three.js)
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
                            ContentAgentController, ContentStudioController,
                            ReportController, TeamController,
                            and more
  Middleware/              # AuthMiddleware (admin JWT), ClientAuthMiddleware
                            (client portal JWT, isolated via a `type` claim —
                            see #27), RateLimitMiddleware
  Support/                 # Database (PDO singleton), Jwt, Settings, Validator,
                            Response, Mailer, AiText (Gemini/OpenRouter/Groq
                            fallback, can report which provider succeeded), MakeWebhook
                            (push + log every automation event), ShortLink
                            (getOrCreate/resolve for the /s/{code} redirector),
                            AiImage (Gemini "Nano Banana" image generation for
                            Canvas's flyers, GD cover-crop to an exact size)
  Router.php                # tiny hand-rolled router — no framework dependency
  autoload.php               # minimal PSR-4-style autoloader for the App\ namespace
config/config.php         # env-based settings, memoized via appConfig()
database/
  schema.sql               # SQLite schema
  migrate.php               # applies schema.sql (+ guarded ALTER TABLE for existing DBs)
  seed.php                  # admin user + sample projects/tags
  seed_real_projects.php     # real project case studies
  blog_posts_data.php, generate_blog_covers.php, seed_blog_posts.php
                              # the 52 blog posts + their generated SVG cover art
  generate_sitemap.php       # regenerates public/sitemap.xml
  process_webhooks.php      # drains webhook_queue → Slack/email (run via cron/Task Scheduler)
  send_appointment_reminders.php  # ~24h-before booking reminder emails (cron)
  send_milestone_reminders.php    # unpaid proposal milestone nudges (cron)
  send_stale_lead_alerts.php      # Make.com event for quote requests stuck in New/Reviewing (cron)
  generate_social_drafts.php      # AI social post drafts on a daily/weekly cadence (cron)
  check_uptime.php                # pings uptime monitors, alerts on status change (cron, ~5 min)
  send_drip_emails.php            # sends due drip-sequence steps (cron, hourly)
  send_nurturer_emails.php        # Nurturer's AI-written sequence 2/3 follow-ups (cron, hourly)
  run_beacon_discovery.php        # Serper keyword search -> Beacon scoring -> qualified-lead digest (cron, hourly)
  backup_db.php                   # consistent SQLite snapshot -> storage/backups/, prunes old ones (cron, daily)
  reset_admin_password.php        # CLI escape hatch: reset admin password / disable 2FA
storage/
  backups/                  # dated SQLite snapshots written by backup_db.php (gitignored)
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
   your published projects if no `GEMINI_API_KEY` is configured. The
   assistant's **name and persona are admin-configurable** from Site Content →
   Live Chat (defaults to *Lisa*): the name drives the widget header, its
   accessibility labels, and how the bot introduces itself when a visitor asks
   who they're speaking to (all served from `/api/v1/chat/status` and baked
   into the server-side system prompt), and the presented gender is derived
   from the read-aloud voice gender below — so choosing a male name + male
   voice makes the whole persona male in one step, no redeploy. Each of the
   assistant's replies plays a short chime and carries a speaker button that reads
   that message aloud on demand via the browser's Web Speech API (emoji are
   stripped from the spoken copy so the voice reads words only, and the
   message that's already talking toggles off on a second tap). A header
   toggle switches on **auto read-aloud** (session-remembered) so every reply
   is spoken hands-free, and the composer has a **voice-input mic** that lets
   visitors dictate their message (Web Speech recognition, accent-matched to
   the voice setting). The voice is admin-configurable from Site Content →
   Live Chat — gender (female/male/auto), accent (UK/US/auto English),
   speaking speed, and pitch, with a live "Preview voice" button. The browser
   owns the actual voices, so these are preferences the widget matches against
   whatever the visitor's device offers (delivered in `/api/v1/chat/status`,
   matched with graceful fallback: accent+gender → gender → accent → any
   English → device default). The header avatar (`agent-face.js`, shared with
   the admin agent console below) animates alongside all this — two staggered
   rings expand outward while a reply is pending, and the avatar breathes
   gently while it's actually being read aloud — so read-aloud and auto-speak
   read as a face reacting rather than a static icon; like every other
   animation on the site it disables under `prefers-reduced-motion`. Replies
   land with an animated typing indicator and then reveal word-by-word (a client-side typewriter — it animates an
   already-received reply and honors `prefers-reduced-motion`; it does not
   change how long the model takes). When a visitor explicitly asks for a code
   example, the assistant returns a short fenced ` ```lang ` snippet, and the
   widget renders it as a **Carbon-style code card** — dark window frame with
   the three traffic-light dots, a language tag, a copy-to-clipboard button
   (`navigator.clipboard` with an `execCommand` fallback), and a light,
   dependency-free syntax highlighter (comments/strings/numbers/keywords). All
   code is HTML-escaped before it's rendered, so bot output is never treated as
   markup; read-aloud reads only the prose around the card, not the code. The
   widget is screen-reader aware
   (`role=dialog`, the message list is an `aria-live` log, and the typewriter
   sets `aria-busy` so the reply is announced once), and an exit-intent trigger
   opens it if a visitor moves to leave before it has auto-shown. Every one of
   these — chime, read-aloud, voice input, typewriter, code cards — is a progressive
   enhancement; the chat still works without Web Audio / speech support.
5. **Admin panel** (`/admin/*`) is plain static HTML + JS calling the same
   JWT-protected `/api/v1/admin/*` endpoints — projects CRUD, blog CRUD
   (with cover image upload), an inquiries inbox (read/flag/archive) split
   into general contact vs. quote requests, a payments section (Paystack
   transaction log + generate-a-payment-link), tag management, site content
   (editable homepage value hero, pricing, technical archive, production log,
   live demo, and pricing copy), and account settings. Includes contextual SVG tooltips for quick help on forms and cards.
   The **Chat Leads** page also shows a lead-gen funnel (`/api/v1/admin/chats/stats`):
   conversations, leads captured, conversion %, and prototype outcomes; and the
   **dashboard** folds in a last-24h rate-limit / abuse card (top offending
   IP/endpoint pairs from the `rate_limits` table). A public
   **`/api/v1/health`** probe reports DB connectivity, webhook-queue backlog,
   and which AI providers are configured (503 when the DB is unreachable) for
   external uptime monitoring. The homepage estimator carries a social-proof
   testimonial by the lead-capture CTA, revealed only when one is configured.
6. **Technical Archive** (`/archive.html`, `/archive-post.html`) still uses the
   existing blog CRUD resource (`blog_posts` table), category filtering,
   pagination (10/page), reading-time estimates, share buttons, and per-post
   OG/Twitter meta + JSON-LD structured data for SEO. The public presentation
   is now text-first and case-study-like, with no thumbnail grid on archive
   or related-entry cards. Posts are ordered newest-first everywhere they
   surface — the archive list, the About mega-menu's featured card, the RSS
   feed, and the homepage Technical Archive section, which now renders the
   three most recent posts live from `/api/v1/blog` (the static HTML entries
   are the API-down fallback). A newly published post automatically takes the
   top slot: `BlogController` orders by `sort_order DESC`, and a post created
   from the admin gets `MAX(sort_order)+1` unless an explicit position is set.
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
10. **Newsletter** signup lives on `/archive.html` (honeypot + rate-limited,
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
12. **Pricing content** is editable from Admin -> Pricing and reused on both
    the homepage and `/pricing.html`. Tier names, displayed prices, taglines,
    feature lists, the public currency, and the Starter checkout amount are
    stored in the `settings` table and hydrate the static public pages. Admin
    -> Settings still holds the Paystack keys.
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
    business (one at a time, or via "Find leads by niche" — see below), run
    a real technical audit of its site (SSL, mobile viewport meta tag,
    title/meta description, response time, HTTP error status, and common
    broken-page signatures like a WordPress DB-connection error or an
    unresolvable domain — genuinely verifiable, never fabricated), then
    draft an AI pitch that only references the actual findings. There is
    deliberately no bulk-send path — "Approve & Send" opens the admin's own
    mail client with the draft prefilled (`mailto:`), and the lead is only
    marked `sent` after that. The audit fetch has an SSRF guard
    (`SharedAgentTools::isSafeUrl`, shared with Dossier's site fetch)
    blocking loopback/private/reserved
    IP targets — a domain that simply fails to resolve is let through,
    though, since that's not an SSRF risk and is itself a real, useful
    finding. `website_url` is optional — a business with no site yet is a
    valid lead too, and skips straight to a generic (not fabricated-findings)
    pitch instead of an audit. The generated body is instructed to avoid
    invented statistics, false urgency, and unverifiable financial-harm
    claims; the sign-off and contact channels (WhatsApp/phone from Settings,
    portfolio URL) are appended in PHP from real data, never left for the
    model to guess at.

    "Find leads by niche" (`MarketingLeadController::discover()`) searches
    for real candidate businesses (e.g. "plumbers in Accra") via Serper's
    Google Places search API — name, real website if one exists, address,
    phone, rating — and shows them as a checklist for the admin to hand-pick
    which to add (`bulkStore()`), flagging ones already tracked by URL so
    nothing gets double-added. This is deliberately a real search API call,
    not an AI-generated list: an LLM "finding" businesses for a niche would
    just be hallucinating plausible-looking fake names/URLs, which is
    exactly what this whole tool is built to avoid elsewhere. Needs a Serper
    API key in Admin → Settings → Integrations; each hand-picked lead still
    goes through the normal audit/pitch/review/send pipeline individually.

    Outreach isn't email-only, either: a lead with a `contact_phone` but no
    `contact_email` gets a call script instead of an email pitch
    (`generatePitch()` picks the channel — email when possible, phone only
    when there's no email to write to; either can be forced via `channel`
    in the request body). A call script is short talking points, not a
    script to read verbatim, grounded in the exact same real findings as an
    email pitch (`findingsContext()` is shared by both, so the two channels
    can't quietly drift in what they claim is true). The Review modal swaps
    Subject/email fields out for a phone field and relabels the body
    "Call script"; the send button becomes "Mark as called" and opens a
    `tel:` link as a convenience (it can't confirm a call actually
    happened, so `markSent()` still requires the admin's explicit
    confirmation either way). Serper's Places search already returns phone
    numbers for most listings, so a niche-discovered lead is often
    call-ready immediately even with no website on file at all.

    **Dossier** (`DossierController::research()`, the "Research"/"View
    dossier" button per lead) is the recon step that sits one stage *before*
    the audit/pitch flow: given a lead it builds a short internal briefing —
    never sent to the business — from three real inputs. (1) A tech-stack
    fingerprint pattern-matched out of the lead's actual homepage HTML and
    response headers (WordPress, Shopify, Wix, React/Next.js, Google
    Analytics, Cloudflare, etc.), each signal carrying the concrete evidence
    it matched on, so it's defensible rather than guessed; the fetch reuses
    the same `SharedAgentTools::isSafeUrl` SSRF guard as the audit. (2) A real
    Serper *news* search on the business name — real results only, AI kept out
    of this step for the same reason it's kept out of "Find leads by niche": a
    model "recalling" news is just inventing it. (3) A single AI summary that
    reasons *only* over (1), (2), and the stored audit findings, producing an
    outreach angle told to invent no pain point the evidence doesn't support.
    Both external calls degrade gracefully — no Serper key just drops the news
    section, no AI provider just drops the summary — so the always-available
    tech read means research never comes back empty-handed. The brief is
    stored on the lead row (`research_findings` JSON + `researched_at`) and
    never changes the lead's pitch-pipeline status. Dossier also appears as
    the sixth agent on the Team page (Lead Research Analyst).
23. **Gemini → OpenRouter → Groq fallback** (`src/Support/AiText.php`): every
    plain single-shot "prompt in, text out" AI call (pitch drafting,
    prototype generation, the secondary AI assistant) tries Gemini first
    and, if that fails for any reason (quota, outage, bad response), retries
    against OpenRouter, then against Groq — using whichever keys/models are
    set in Admin → Settings → Integrations (OpenRouter defaults to
    `openrouter/free`, Groq to `llama-3.3-70b-versatile`, if no model is
    given). The third leg exists because Gemini and OpenRouter running out
    of quota/credit at the same time isn't hypothetical — it's happened —
    and Groq has its own independent quota. Centralized in one class rather
    than duplicated per controller, since the Gemini call itself has already
    been the source of several subtle bugs this project had to debug.

    Live Chat's tool-calling conversation
    (`LiveChatController::chatWithGemini`/`chatWithOpenRouter`/`chatWithGroq`)
    gets the full three-way Gemini → OpenRouter → Groq fallback too, but as a
    second, independent implementation rather than a shared one: Gemini's
    `functionCall`/`functionResponse` shape (with a `thoughtSignature` that
    must round-trip verbatim) and the OpenAI-style `tools`/`tool_calls`
    (matched by `tool_call_id`) that both OpenRouter and Groq speak are
    different enough that there's no safe way to hand off *mid-round* — a
    failed turn is retried as a whole fresh turn on the next provider, each
    rebuilding its own native wire format from a provider-neutral transcript
    stored as plain role/text. Groq keeps its own method rather than reusing
    the OpenRouter one even though both speak the OpenAI dialect, since the
    two can drift in header/quirk requirements over time. All three share one
    source of truth for the system prompt (`buildSystemPrompt`) and the tool
    declarations (`toolDeclarations`, translated to OpenAI's schema by
    `toolDeclarationsOpenAiFormat`) so the providers can't drift into
    inconsistent behavior. Each turn is bounded to two model↔tool round-trips
    (tools are dropped on the last round so the model must produce text), with
    per-provider curl timeouts and a raised `set_time_limit` so the worst-case
    chain can't be killed mid-request on shared hosting. If all three fail,
    the conversation still works via keyword/booking-intent fallback, just
    without the AI-driven tool calls. This whole design is written up in the
    "How I Used Three LLMs to Power One Live Chat" archive post.
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
28. **Production Logs / case study CMS improvements** (`/admin/projects.html`): projects can
    now carry a `outcome_metrics` results section, link to one approved
    `testimonials` row (rendered as a quote on the case study page — HTML
    escaped, since a testimonial's quote text originates from a public
    client-submission form, unlike the rest of a project's admin-authored
    fields), and an `is_featured` flag. Public project surfaces now render as
    text-only production logs with metrics and stack badges instead of static
    image boxes. The homepage hero previously always showed whichever project
    had the lowest `sort_order`; it now prefers the explicitly featured one,
    falling back to the old behavior if none is set. Each project also carries
    an internal-only `delivery_status` (On track / Needs attention / At risk /
    Due this month, hand-set from the admin form) and a `progress_percent`
    (0-100, shown as a filled bar per row) — both independent of
    `is_published`, which is about public visibility, not build progress. The
    admin project list shows four live count cards (one per delivery status)
    above the table, recomputed client-side from the same fetch that renders
    the rows.
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
    which provider (`ai_provider`: `gemini`, `openrouter`, or `groq`)
    actually generated it, shown in the admin list and review modal —
    useful for noticing if Gemini's quota is exhausted and everything is
    quietly falling back further down the chain. Blog/case-study links in the drafted text
    go through a self-hosted shortener (`src/Support/ShortLink.php`,
    `princecaleb.dev/s/{code}`, public redirect via `ShortLinkController`)
    rather than the full `/archive-post.html?slug=...` URL, since every
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
    from the same Settings form. **Status: Google Calendar, Gmail, and
    Slack booking actions all confirmed working end-to-end against a live
    Composio account (2026-07) — a Live Chat booking correctly created a
    calendar event, sent the Gmail notification, and posted to Slack.
    Slack required inviting Composio's connected app into the target
    channel first (`/invite @Composio` or Channel → Integrations → Add an
    App) and approving it in workspace App Management if the workspace
    restricts unapproved third-party apps — without that, the message is
    silently dropped with no error surfaced anywhere. WhatsApp connect flow
    built, not yet exercised live.**
34. **Client-side error capture** (`ClientErrorController::log()`,
    `public/js/error-log.js`) — a small script, loaded first thing in
    `<head>` on every page across the whole site (public and admin alike),
    that catches uncaught JS errors (`window.onerror`) and unhandled
    promise rejections and POSTs them to `/api/v1/client-error`, which
    writes them through the same `error_log()` every PHP error already
    uses — so a frontend bug (a broken button, a rendering exception in an
    admin page) shows up in Admin -> Error Logs exactly like a backend one
    does, instead of being invisible to anyone without devtools open at the
    time. Deliberately unauthenticated (errors happen for anonymous
    visitors too) and rate-limited per IP (30/hour) to bound log growth
    from a page looping on one broken error.
35. **WebGL hero constellation** (`public/js/hero-3d.js`, self-hosted Three.js
    r0.180 in `public/js/vendor/three-0.180.0/`): an optional particle-and-line
    constellation with a slow wireframe icosahedron drifting behind the
    homepage headline, tinted with the theme's `--ink` color (it follows the
    light/dark toggle live via a `MutationObserver` on `data-theme`). It is
    deliberately gated so the library (~170KB gzipped) never loads where it
    can't earn its cost: desktop fine-pointer only, `prefers-reduced-motion`
    respected, WebGL required, and the module is dynamically `import()`-ed on
    idle (with a timeout, since this page animates continuously and a
    no-timeout `requestIdleCallback` can be starved forever) rather than in
    the critical path. The render loop pauses whenever the hero scrolls
    off-screen (`IntersectionObserver`) or the tab is hidden
    (`visibilitychange`), and `devicePixelRatio` is capped at 1.75 so high-DPI
    screens don't multiply GPU cost. It defers to the admin-configured hero
    background video (`hero_video_url`, Admin → Site Content): if a video is
    set the scene never mounts, and it tears itself down if the video appears
    later, so the two background treatments never stack. Three.js is vendored
    in a *versioned* directory (an upgrade bumps the folder name — the module
    build internally imports `./three.core.min.js`, so both files ship
    together) and served with a long `immutable` cache header via
    `public/js/vendor/.htaccess`, unlike the app's own unhashed 1-hour-cached
    JS; `.htaccess` also gzips the module pair.
36. **Social share images** (Open Graph / Twitter cards): every page carries a
    default 1200×630 share image (`public/uploads/og-image.png`, regenerated by
    `scripts/generate_og_image.py` in the monochrome brand palette). Blog posts
    and projects show their *own* preview when shared, rendered **server-side**
    so real crawlers see it — `public/og-render.php` (Apache rewrites
    `project.html`/`archive-post.html` through it, see `.htaccess`) reads the
    static HTML template and injects the per-item `og:image`/`title`/
    `description`/`url` for the requested `slug`. It's deliberately fail-open:
    any error (bad slug, missing row, DB hiccup) serves the untouched template,
    so these pages can never break — the handler only ever improves the crawler
    preview. This is necessary because the pages' own per-item meta swap is
    client-side JS, which social crawlers don't execute. Blog posts don't use
    their SVG cover for sharing (crawlers don't reliably render SVG); instead
    `scripts/generate_blog_og_images.py` pre-generates a raster card per post
    (`public/uploads/og/blog/{slug}.png`, palette-quantized) from the canonical
    `database/blog_posts_data.php`, so the cards match what's seeded to
    production. These PNG cards are not rendered inside the article UI; they
    are only for Open Graph/Twitter previews and generated social draft image
    URLs. Projects use their real raster cover when one exists (with
    server-read dimensions so platforms don't mis-crop), falling back to the
    default otherwise. The two Python generators are dev-machine tools (Pillow);
    their output is committed and deploys as static files, so the server needs
    no Python — re-run them after editing `blog_posts_data.php` or the brand
    imagery, same cadence as `generate_blog_covers.php` and
    `seed_blog_posts.php`.
37. **Beacon, Nurturer & Ledger growth agents** (`/admin/agent-chat.html`):
    three AI agents that run through `AiAgentEngine`, so all three ground
    themselves in real facts via `get_site_info`/`search_content` (shared with
    Lisa through `SharedAgentTools`) rather than inventing them. The same
    console also reaches **Lisa** herself, via `LiveChatController::adminChat()`
    — her exact public-widget brain, but run in owner mode so she drops the
    lead-capture/sales script (no asking for name/email, no quote pitch) while
    keeping her useful tools (`check_availability`, `get_site_info`,
    `search_content`, `audit_website`); her tab shows a **Recent visitor
    conversations** panel (reusing `GET /api/v1/admin/chats`, the same data as
    the Chat Leads page) for context while talking to her. A fifth agent,
    **Canvas**, handles content creation and is documented separately below
    (#38). Beacon and
    Nurturer each have two entry points: a `draft()` HTTP endpoint for
    external automation (Bearer-authed on `integration_api_key`, like
    `IntegrationController`) and a `chat()` mode for talking to them directly
    from the admin page (session-authed). Ledger skips the Bearer-authed
    `draft()` entirely — a proposal always starts from an admin action, never
    external automation — in favor of an admin-session-authed `generate()`
    plus the same `chat()` pattern. Every `chat()` drops the rigid JSON
    contract in favor of tools of its own: Beacon's chat gets
    `log_qualified_lead`, so a post judged worth a reply mid-conversation is
    saved the same way a `qualified: true` draft() result is (`source` on
    `beacon_social_leads` distinguishes `chat`/`draft`/`cron`); Nurturer's
    chat gets `find_lead` (look up a real `drip_enrollments`/`marketing_leads`
    record by name or email — industry, last action, nurturer send history,
    audit findings, pitch status — so a draft grounds in what's actually on
    file instead of Caleb retyping it) and `check_availability` (Lisa's real
    bookable slots, for talking through a Sequence 3 close); Ledger's chat
    gets `find_inquiry` (a real `project_request` by name/email),
    `find_proposal` (an existing proposal's status and payment progress), and
    `draft_proposal` (a read-only wrapper around the same generation logic
    `generate()` uses, for narrating numbers mid-conversation). Ledger's
    controller has no write path anywhere — every tool and both entry points
    only read or return JSON, deliberately stricter than Beacon's
    `log_qualified_lead` (which does write, once Caleb confirms), since a
    proposal commits to real payment terms a client may pay against. The
    admin console shows the same animated `agent-face.js` avatar Lisa's
    widget uses (a circular avatar per agent — Beacon a radar/broadcast mark,
    Nurturer a mail icon, Ledger a file/contract mark on its own navy-blue-gold
    gradient) that thinks while a reply is pending and talks while a reply is
    being read aloud, and each agent's read-aloud voice is admin-configurable
    the same way Lisa's is — gender (female/male/auto) and accent (UK/US/auto
    English) from Site Content, with a live "Preview voice" button; only
    speaking speed/pitch stay Lisa-only.
    **Beacon** scores a social post as a lead and drafts a reply.
    `database/run_beacon_discovery.php` (cron) is the automated feed: it
    searches the keywords set under Admin -> Talk to Agents -> Beacon via
    Serper, runs new results through Beacon, and digests qualified ones to
    Slack/`notification_email`. `beacon_scan_seen` dedupes by URL so a repeat
    search result isn't re-scored and re-billed each run. It can't post
    replies back — each platform needs its own developer API and OAuth app,
    deliberately not built — so the digest is something to act on by hand, and
    since Serper returns a search snippet rather than the full post, Beacon
    judges on less context than a real scrape would give it.
    `run_beacon_discovery.php` also best-effort extracts the poster's real
    Reddit username from the snippet/title (a `u/username` pattern Google
    often preserves) instead of always passing `'unknown'`, so a
    business-sounding handle is visible to the qualification prompt as a
    signal. Every qualified lead in "Recent qualified leads" can be **flagged
    as a false positive** with an optional note — this deletes the lead the
    same as a plain delete, but first records it in `beacon_lead_feedback`,
    and the next several qualification calls (draft, chat, and cron alike)
    prepend Caleb's most recent corrections as concrete examples of mistakes
    to avoid, so a correction actually changes future scoring instead of
    being a one-off rule tweak.
    **Nurturer** writes personalized follow-up emails from a lead's industry
    and last action, both captured per-enrollment in `/admin/drip.html`.
    `database/send_nurturer_emails.php` (cron) sends them to enrollments with
    `nurturer_enabled`, on the day offsets under Drip -> AI Sends -> Send
    timing. It only ever writes sequences 2 and 3 — sequence 1 stays whichever
    fixed `drip_steps` template the lead also gets, since the first touch is
    the one you least want improvised. Sends are recorded in `nurturer_sends`
    (not `drip_sends`, which only references a fixed template — wrong shape
    for per-send unique content), UNIQUE per (enrollment, sequence) so
    overlapping runs can't double-send. `send_drip_emails.php` won't complete
    an enrollment while a Nurturer send is still outstanding; completing on
    the fixed steps alone would strand it, as only active enrollments are
    picked up. Pick offsets that don't collide with your active step days, or
    an opted-in lead gets two emails in one day.
    **Ledger** drafts a project proposal — scope, timeline, terms, and a
    payment milestone breakdown — from a real `project_request` inquiry
    and/or a short brief typed on the fly, in the exact shape
    `ProposalController::store()`/`update()` already expect as input
    (milestone amounts are decimals, not subunits, so the AI output needs no
    translation layer). It grounds every number in `get_site_info`'s
    `engineering_tiers` (the real published pricing tiers) rather than
    inventing one, falling back to the inquiry's own stated budget if tiers
    aren't set, and says so plainly in a `grounding_note` before Caleb touches
    anything. `/admin/proposals.html` gets a **Draft with AI** button next to
    "Start from quote request" that calls `POST /api/v1/admin/proposals/generate`
    and fills the existing form — Caleb still has to review and click
    Create/Save; nothing is ever created or sent automatically. The chat tab
    additionally shows a "Proposals awaiting a decision" panel (sent, not yet
    accepted or declined), reusing the existing `GET /api/v1/admin/proposals`
    with a client-side status filter rather than a dedicated endpoint. No
    schema changes were needed for any of this — Ledger only reads existing
    `inquiries`/`proposals`/`proposal_milestones` columns, and its assistant
    name/voice/accent settings ride the same generic `settings` key-value
    store every other admin-configurable setting already uses.
38. **Canvas & Content Studio** (`/admin/agent-chat.html` "Content" tab,
    `/admin/content-studio.html`): a content-creation agent, also running
    through `AiAgentEngine` and grounded via the shared `get_site_info`/
    `search_content` tools, but with no automated cron side — it exists only
    as a live `chat()` in the "Talk to Agents" console
    (`ContentAgentController`). Unlike the pipeline agents it can stage real,
    reviewable output via four tools: `get_brand_info`
    (`SharedAgentTools::getBrandInfo()`) returns the real primary/accent
    colors, font, a style note, and the two real logo files — named for the
    mark's own color, not the background it goes on: a dark-colored mark for
    white/light backgrounds, a white-colored mark for black/dark backgrounds
    — sourced from `Settings` (`brand_primary_color`, `brand_accent_color`,
    `brand_font`, `brand_style_note`, `brand_logo_dark_url`,
    `brand_logo_white_url`, editable from Site Content → Brand) and
    defaulting to the site's actual monochrome editorial system and the two
    logo files committed at `public/uploads/brand/logo-{dark,white}.png` when
    unset, so Canvas is grounded even before an admin ever opens Settings;
    `create_flyer` generates an actual social graphic with
    Gemini's image model ("Nano Banana", `src/Support/AiImage.php`) at a real
    platform size (square 1080×1080, portrait 1080×1350, story 1080×1920, or
    landscape 1200×630) — every call is grounded in `get_brand_info`'s colors/
    font/style automatically (not left to the model remembering to ask), and
    the matching real logo file is attached to the Gemini request as a second
    reference image (a `background: dark|light` param on the tool picks which
    variant), so the model works from Caleb's actual logo rather than
    inventing a mark from a text description — it still won't reproduce it
    pixel-perfect, so this is a faithful reference, not exact compositing. The
    model also returns whatever aspect ratio it likes regardless of the
    reference, so the result is always center-cropped with GD to the exact
    requested pixel size and normalized to PNG; `save_social_draft` and
    `save_blog_draft` write a caption or full post to a new
    `content_studio_items` table. Nothing it makes goes live: blog
    drafts land `is_published = 0`, and every item starts `status = 'draft'`.
    The Content Studio admin page lists everything Canvas has made, lets
    Caleb correct the copy/notes inline (PATCH) or delete an item, or
    **promote** a reviewed item into the real pipeline — a blog item becomes
    an actual (still unpublished) `blog_posts` row reachable from the
    existing Blog page, and a social/flyer item becomes a
    `social_post_drafts` row (`ai_provider = 'content-agent'`) reachable from
    the existing Social Drafts page; the studio item is then marked `used`.
    A flyer generated without a caption yet is recorded standalone and gets
    folded into the same row in place if a caption naming that image arrives
    later, so Caleb never ends up with a duplicate bare-image row plus a
    separate captioned one. Canvas's assistant name/voice settings (default
    name "Canvas") ride the same generic `settings` store every other agent
    persona uses. The "Talk to Agents" console's Content tab also shows a
    **Recent content drafts** panel (reusing `GET /api/v1/admin/content-studio`)
    as a quick glance while chatting, linking out to the full Content Studio
    page for anything more.
39. **Reports** (`/admin/reports.html`, `ReportController`): business/CRM
    reporting, distinct from Analytics' web-traffic view — revenue
    (all-time/30-day/by-month/by-source/by-currency), the sales funnel and
    win rate, per-automation email performance, bookings, lead sources, and
    top clients by revenue, all computed live from existing tables in one
    request. A date-range picker (with This month/Last month/This
    quarter/YTD presets) drives a separate "period" section — revenue and
    average-accepted-deal-size cards showing % change against the
    immediately-preceding period of equal length — plus a revenue-mix-by-
    service breakdown backed by a `proposals.service_category` field
    (Websites/Mobile apps/Brand systems/Strategy/Other, set on the proposal
    form), joined back through `proposal_milestones` to whichever payment it
    funded; a payment with no linked proposal (e.g. Starter-tier direct
    checkout) lands in "Uncategorized" rather than being dropped or
    misattributed. Gross margin and utilization are shown as flat,
    explicitly-badged **estimates** (`is_estimate` in the API response) since
    the app has no cost/expense or hours/time-tracking data anywhere to
    compute them for real — every other figure on the page is a genuine
    query, never a placeholder. A six-month revenue+margin chart and a
    client-side CSV export (built from the already-loaded report, no extra
    endpoint) round it out.
40. **Team** (`/admin/team.html`, `TeamController`): an admin-only,
    read-only roster of the studio — Caleb himself plus the six AI agents
    (Lisa, Nurturer, Beacon, Dossier, Ledger, Canvas) — each card showing its
    real role, a live headline stat pulled from its own table (e.g. Ledger
    shows proposals drafted, Canvas shows drafts created from
    `content_studio_items`, Dossier shows leads researched via
    `researched_at`), and a live status (Nurturer shows
    "Sending"/"On standby" based on whether any automation actually has it
    enabled and active; Beacon shows "Scouting"/"Paused" from the discovery
    toggle). Agent display names stay admin-configurable via the same
    `settings` keys the rest of the app already uses.

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
   php database/seed_blog_posts.php        # seeds/updates the 52 blog posts
   php database/generate_sitemap.php
   ```
   Social preview PNGs (`public/uploads/og/blog/{slug}.png`) are generated on
   a dev machine with `python scripts/generate_blog_og_images.py`, then
   committed and deployed as static files; the production server does not need
   Python/Pillow for them.
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
4f. Add a sixth cron job (every 5 minutes) for the uptime monitors
    (`/admin/uptime.html` shows no data without it):
    `/usr/local/bin/php /home/<cpanel-user>/database/check_uptime.php > /dev/null`
4g. Add a seventh cron job (hourly) for drip email sequences (no-op until
    a sequence is created in `/admin/drip.html`):
    `/usr/local/bin/php /home/<cpanel-user>/database/send_drip_emails.php > /dev/null`
4h. Add an eighth cron job (hourly) for Nurturer's AI-written sequence 2/3
    follow-ups (no-op until a lead is enrolled with "AI-personalize via
    Nurturer" ticked in `/admin/drip.html`):
    `/usr/local/bin/php /home/<cpanel-user>/database/send_nurturer_emails.php > /dev/null`
4i. Add a ninth cron job (hourly) for Beacon's social lead discovery (no-op
    until enabled, with keywords, under Admin -> Talk to Agents -> Beacon).
    Hourly is deliberate even for a daily/weekly cadence: the script checks
    the configured frequency itself, so a less frequent cron would cap the
    setting rather than honour it. Also needs `serper_api_key` in
    Admin -> Settings:
    `/usr/local/bin/php /home/<cpanel-user>/database/run_beacon_discovery.php > /dev/null`
4j. Add a tenth cron job (once a day) for database backups — snapshots
    the SQLite file to `storage/backups/` and keeps the last 14:
    `/usr/local/bin/php /home/<cpanel-user>/database/backup_db.php > /dev/null`
    Periodically download a snapshot somewhere off the server too — an
    on-host backup doesn't survive losing the hosting account itself.
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
7. Optional integrations, all in Admin -> Settings -> Integrations: a Gemini,
   OpenRouter, and/or Groq API key powers Live Chat, Marketing Leads pitch
   drafting, and AI social post drafts (all degrade gracefully — keyword
   fallback, generic pitch, or a clear "could not generate" error — if
   none is configured). A Make.com webhook URL + a generated integration
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
- Locked out (forgotten password, lost 2FA device *and* backup codes)? There
  is deliberately no public forgot-password flow — run
  `php database/reset_admin_password.php <email> <new-password> [--disable-2fa]`
  from the server (cPanel Terminal or SSH). It also invalidates every
  outstanding session.
- `schema.sql` changes don't apply themselves — after any deploy that
  touches it, re-run `php database/migrate.php` on the server (it's
  idempotent: `CREATE TABLE IF NOT EXISTS` for new tables, guarded
  `ALTER TABLE ADD COLUMN` checks for columns added to existing tables).
