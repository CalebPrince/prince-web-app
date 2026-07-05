# Prince Caleb — Portfolio Platform

A premium, zero-bloat portfolio and client-acquisition site for a web & mobile
app developer: a fast static/vanilla-JS public site backed by a custom PHP
REST API, a full admin CRUD panel for projects and inquiries, and a secondary
opt-in AI assistant widget.

Backend: plain PHP (no framework), PDO + SQLite.
Frontend: static HTML + vanilla JS (fetch-based hydration) + Bootstrap 5 for
layout/utilities only — no build step, no bundler.

Live at [princecaleb.dev](https://princecaleb.dev).

## Setup

Requires PHP 8.1+ with the `pdo_sqlite` extension. No Composer, no Node, no
build step.

```bash
# 1. Apply the schema (safe to re-run)
php database/migrate.php

# 2. Seed an admin user + sample projects/tags
php database/seed.php [admin-email] [admin-password]
# defaults: admin@princecaleb.dev / change-me-now-123 — change this in production

# 3. Run the dev server
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
  admin/                  # admin panel (static HTML + JS, JWT-protected API calls)
  css/app.css             # public site design system
  css/admin.css           # admin panel styling
  js/                     # api.js (fetch wrapper), render/page scripts, ai-widget
  uploads/                # project cover images (serve via CDN in production)
src/
  Controllers/            # ProjectController, TagController, InquiryController,
                            AuthController, AiChatController
  Middleware/              # AuthMiddleware (JWT), RateLimitMiddleware
  Support/                 # Database (PDO singleton), Jwt, Validator, Response
  Router.php                # tiny hand-rolled router — no framework dependency
  autoload.php               # minimal PSR-4-style autoloader for the App\ namespace
config/config.php         # env-based settings, memoized via appConfig()
database/
  schema.sql               # SQLite schema
  migrate.php               # applies schema.sql
  seed.php                  # admin user + sample projects/tags
  process_webhooks.php      # drains webhook_queue → Slack (run via cron/Task Scheduler)
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
   JWT-protected `/api/v1/admin/*` endpoints — projects CRUD, an inquiries
   inbox (read/flag/archive), tag management (create/rename/delete), and
   account settings (login email + password; changing the password bumps
   `token_version`, signing out every other session while re-issuing cookies
   for the current one).

## Deployment (Namecheap cPanel)

The live site runs on Namecheap shared hosting. The layout keeps everything
except the web root out of reach of the browser:

```
/home/<cpanel-user>/
  src/  config/  database/  storage/   # uploaded as-is, above the web root
  .env                                  # production secrets (never committed)
  public_html/                          # the CONTENTS of public/
```

Deploys are manual: upload changed files via cPanel File Manager or FTP —
public files into `public_html/`, everything else into the home directory.
`public/index.php` resolves the app via `dirname(__DIR__)`, so this split
works unchanged.

One-time setup on a new host:

1. Create `.env` from `.env.example` with `APP_ENV=production` and a strong
   `JWT_SECRET` (`php -r "echo bin2hex(random_bytes(48));"`).
2. In cPanel → Select PHP Version, pick PHP 8.1+ and enable `pdo_sqlite`.
3. Run `php database/migrate.php` and `php database/seed.php <email> <password>`
   from the home directory (cPanel Terminal or SSH).
4. Add a cron job (every 5 minutes):
   `/usr/local/bin/php /home/<cpanel-user>/database/process_webhooks.php > /dev/null`
5. Confirm AutoSSL has issued a certificate — `.dev` domains are
   HSTS-preloaded and will not load over plain HTTP.

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
