# Prince Caleb — Portfolio Platform

A premium, zero-bloat portfolio and client-acquisition site for a web & mobile
app developer: a fast static/vanilla-JS public site backed by a custom PHP
REST API, a full admin CRUD panel (projects, blog, inquiries, quote requests,
payments), a Paystack-powered checkout/invoicing flow, and a secondary
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
  blog.html, blog-post.html, pricing.html, request.html, pay.html
  admin/                  # admin panel (static HTML + JS, JWT-protected API calls)
    payments.html, quote-requests.html, blog.html, inquiries.html, ...
  css/app.css             # public site design system
  css/admin.css           # admin panel styling
  js/                     # api.js (fetch wrapper), render/page scripts, ai-widget
  uploads/                # project covers, blog cover art, project-request attachments
src/
  Controllers/            # ProjectController, BlogController, TagController,
                            InquiryController, ProjectRequestController,
                            PaymentController, AuthController, AiChatController
  Middleware/              # AuthMiddleware (JWT), RateLimitMiddleware
  Support/                 # Database (PDO singleton), Jwt, Validator, Response, Mailer
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
   (all editable homepage/pricing copy), and account settings.
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
   if the browser never calls back.
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
12. **Project estimation calculator** on `/pricing.html` is pure client-side
    JS (project type + feature checkboxes + timeline → a rounded price
    range) — no backend call, since it's explicitly a rough estimate, not
    a quote. Links out to `/request.html` for an exact number.
13. **Career timeline** and **GitHub activity feed** on `/about.html` are
    both admin-configurable and hidden until set: the timeline's five
    stages are editable text (Admin → Site Content), and the GitHub feed
    fetches directly from `api.github.com` in the visitor's browser (no
    backend call, no API key needed) once a `github_username` is set.
14. **Blog code snippets**: post bodies support ` ```lang ` fenced code
    blocks (plain text otherwise), rendered with highlight.js. Fence
    content is HTML-escaped even though surrounding prose isn't (prose is
    admin-authored and trusted; code often contains `<`/`>`/`&` that must
    render literally).
15. **Accessibility**: every public page has a skip-to-content link
    (`.skip-link`, visible on keyboard focus) targeting a landmark at the
    start of the page's main content.
16. **Analytics** (`/admin/analytics.html`) is first-party and deliberately
    minimal — `page_views` stores only path, referrer, and timestamp, no
    IP address or cookie/visitor ID, via a tiny fire-and-forget beacon
    (`js/analytics.js`) on every public page (never on `/admin/*`).
    Disclosed in the Privacy Policy.

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
5. Confirm AutoSSL has issued a certificate — `.dev` domains are
   HSTS-preloaded and will not load over plain HTTP.
6. In Admin → Settings → Payments (Paystack), paste in your Paystack public
   and secret keys (start with the `pk_test_`/`sk_test_` pair), plus the
   currency and Starter-tier checkout amount. Nothing payment-related is
   reachable until these are set — `paystack_public_key` gates the checkout
   button on `/pricing.html`, and `pricing_tier_1_amount` gates the button's
   visibility. In the Paystack dashboard, add
   `https://princecaleb.dev/api/v1/payments/webhook` under Settings → API
   Keys & Webhooks so payments still reconcile even if a customer closes the
   tab before the in-browser verify call fires.

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
