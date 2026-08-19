# Figma front-end cutover + project showcase API

Replaces the `web/` Next.js app with the Figma rebuild, extends the projects API to feed it, and drives the homepage showcase from real data.

**Merging this deploys to production.** Read "Deploy steps" before merging — there is a required migration.

---

## What's in it

| Commit | Change |
|---|---|
| `86507e0` | Showcase columns on `projects` + admin form fields |
| `093736a` | Replace `web/` with the Figma rebuild, keep legacy pages on PHP |
| `7f83c47` | Homepage showcase reads from the API |

### 1. Projects API gained public showcase fields

The Figma design presents a project as a *system* — one-line tagline, who it was for, how long it took, the before/after, and headline numbers. The table carried none of that, so the API was extended rather than the design compromised.

11 nullable columns: `tagline`, `showcase_category`, `result_headline`, `metrics_json`, `client_name`, `role`, `timeline`, `project_year`, `challenge`, `solution`, `stack_json`.

`showcase_category` is deliberately separate from `category`, which has a CHECK constraint fixed to the three legacy buckets while the showcase groups work as *AI Agents* / *Automations* / *Websites & Apps*.

`ProjectController` decodes `metrics_json` and `stack_json` into arrays (same treatment `gallery_json` already had) and persists all 11 through `store()`/`update()`. The admin Projects form gained a **Systems showcase** section; metrics are entered as `value | label` per line.

> **Bug fixed in passing:** the admin list query aliased the joined client as `client_name`, which would have shadowed the new column — editing any project with a linked client would have loaded the client's name into the public showcase field and saved it as marketing copy. Now aliased `linked_client_name`.

### 2. `web/` replaced with the Figma rebuild

17 routes: home, about, services, systems (+ `[slug]`), lab, archive (+ `[slug]`), contact, book, privacy, terms, cookies, ai-safety, ai-adoption-ladder, testimonials, search.

**There is no `/projects` route** — Systems *is* the project showcase, reading live from the API. `/projects` and `/projects/:slug` redirect permanently to `/systems`.

**Seven pages are not ported yet** and stay on the legacy PHP/HTML site: pricing, marketing-brain, lisa-ai-assistant, ai-voice-agents-for-clinics, growth-roadmap, builder-os, agent. OpenLiteSpeed resolves real files before handing anything to Node, so their `.html` versions keep serving on their own — but the extension-less URL matches no file and would 404, so each temporarily redirects to its `.html` page. Listed in `LEGACY_HTML_ROUTES` in `next.config.ts`; delete an entry as each page lands.

`next.config.ts` keeps `output: "standalone"` and the `turbopack.root` pin — the deploy depends on both.

### 3. Homepage showcase is API-driven

The landing page listed four invented projects hardcoded in `page.tsx`. It now shows the three ticked **"Display on homepage"** in the admin, in sort order — reusing the existing `is_featured` column, so no schema or form change. Falls back to the first three published projects when nothing is ticked.

---

## Deploy steps

Run **on the server**, in this order:

1. **Migrate first — required.**
   ```
   php database/migrate.php
   ```
   Additive only: 11 `ALTER TABLE ... ADD COLUMN`, all nullable, each guarded by a `PRAGMA table_info` check so re-running is a no-op. No column is dropped, renamed or retyped; no row is rewritten.

   **If the front end deploys before this runs, `/systems` errors on every project query** — it selects columns that don't exist yet.

2. **Backfill the derivable fields.**
   ```
   php database/backfill_project_showcase.php
   ```
   Writes only what can be derived from existing data: showcase grouping, tagline, year, and stack from tags. Deliberately leaves `client_name`, `role`, `timeline`, `result_headline`, `metrics`, `challenge` and `solution` NULL rather than invent commercial facts — those are entered by hand in the admin. Safe to re-run (`COALESCE` unless `--force`).

   Its slug→category map covers the 11 projects known at the time. Any live project outside that list still gets year and stack, but falls back to its legacy category on the grid.

3. **Tick three projects** as "Display on homepage" in the admin Projects form.

### Data safety

The deploy syncs `public/`, `src/`, `config/`, `database/` and the Next standalone bundle. It **never touches `storage/`**, where `portfolio.sqlite` lives — live projects, inquiries, payments and testimonials are not overwritten.

---

## Verification done

- All four CI steps run locally: `php -l` across `src config database public`, `sync:partials:check` ("No partial drift found"), Tailwind build, `web/` standalone build
- Standalone bundle booted the way Passenger runs it — `server.js` starts, `/` and `/systems` return 200, all nine redirects resolve to the right targets
- Bundle size sanity: 19 MB standalone vs 634 MB full `node_modules`
- ESLint clean (0 errors; remaining warnings are deliberate `<img>` use for API-served images)
- Systems grid, detail pages, testimonials and search verified against the live PHP API with real data

## Not included

The seven tool pages, which carry live integrations (Paystack checkout, Sage AI chat, Lisa scenario lab, ROI calculator). They're queued next and are recoverable from `c37344f`.
