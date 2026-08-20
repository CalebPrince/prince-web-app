import path from "node:path";
import type { NextConfig } from "next";

/**
 * The legacy `.html` pages this app replaced. All 78 of them were deleted
 * from `public/` once every page had been ported, so these paths no longer
 * resolve to a file and now fall through to this app.
 *
 * They still need to resolve, because links to them are already out in the
 * world: `/pay.html` in invoice and proposal emails, `/book.html` in booking
 * confirmations, `/project.html?slug=…` in anything a crawler or a client
 * saved. Each one permanently redirects to the route that replaced it.
 */
const RETIRED_HTML_PAGES: Record<string, string> = {
  home: "/",
  about: "/about",
  agent: "/agent",
  "ai-adoption-ladder": "/ai-adoption-ladder",
  "ai-safety": "/ai-safety",
  "ai-voice-agents-for-clinics": "/ai-voice-agents-for-clinics",
  archive: "/archive",
  book: "/book",
  "builder-os": "/builder-os",
  chat: "/chat",
  contact: "/contact",
  cookies: "/cookies",
  "growth-roadmap": "/growth-roadmap",
  invoice: "/invoice",
  "lisa-ai-assistant": "/lisa-ai-assistant",
  maintenance: "/maintenance",
  "marketing-brain": "/marketing-brain",
  "newsletter-unsubscribed": "/newsletter-unsubscribed",
  pay: "/pay",
  "payment-success": "/payment-success",
  pricing: "/pricing",
  privacy: "/privacy",
  // The showcase became /systems when the Figma design landed.
  projects: "/systems",
  proposal: "/proposal",
  request: "/request",
  search: "/search",
  services: "/services",
  terms: "/terms",
  testimonial: "/testimonial",
  testimonials: "/testimonials",
  // Client portal. Invite and reset links carry a ?token=, which Next passes
  // through to the destination automatically, so an invite sent before the
  // cutover still completes setup instead of dead-ending.
  "client/dashboard": "/client/dashboard",
  "client/forgot-password": "/client/forgot-password",
  "client/login": "/client/login",
  "client/reset-password": "/client/reset-password",
  "client/setup": "/client/setup",
};

/**
 * The two legacy pages that carried their item in a `?slug=` query rather
 * than the path. Next matches the query and rebuilds it as a real segment,
 * so a saved or shared `/archive-post.html?slug=foo` lands on `/archive/foo`
 * instead of the index.
 */
const RETIRED_SLUG_PAGES: Record<string, string> = {
  "archive-post": "/archive",
  project: "/systems",
};

const nextConfig: NextConfig = {
  // The repo root has its own package-lock.json (the separate Tailwind CLI
  // build for the surviving PHP pages) which Turbopack otherwise mistakes
  // for a monorepo root — pin resolution to this app instead.
  turbopack: {
    root: path.join(__dirname),
  },
  // Minimal self-contained server bundle for the cPanel Passenger deploy —
  // .next/standalone/ ships its own server.js and only the node_modules
  // actually used at runtime, instead of syncing the full (dev-dependency-
  // laden) node_modules over FTP. See .github/workflows/deploy.yml.
  output: "standalone",

  async redirects() {
    return [
      // The project showcase moved to /systems when the Figma design landed.
      { source: "/projects", destination: "/systems", permanent: true },
      { source: "/projects/:slug", destination: "/systems/:slug", permanent: true },
      // Retired .html pages. Permanent, because they are never coming back.
      ...Object.entries(RETIRED_HTML_PAGES).map(([page, destination]) => ({
        source: `/${page}.html`,
        destination,
        permanent: true,
      })),
      // Slug-carrying pages: keep the item, not just the index.
      ...Object.entries(RETIRED_SLUG_PAGES).map(([page, base]) => ({
        source: `/${page}.html`,
        has: [{ type: "query" as const, key: "slug", value: "(?<slug>.*)" }],
        destination: `${base}/:slug`,
        permanent: true,
      })),
      // Same two without a slug — send them to the index rather than 404.
      ...Object.entries(RETIRED_SLUG_PAGES).map(([page, base]) => ({
        source: `/${page}.html`,
        destination: base,
        permanent: true,
      })),
    ];
  },

  // Dev-only: forward /api/* to the local PHP dev server so pages that fetch
  // real content (systems, testimonials, search) have live data to test
  // against. In production /api/* resolves to a real PHP route before it
  // ever reaches this process, so no rewrite is needed there.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      { source: "/api/:path*", destination: "http://localhost:8017/api/:path*" },
      // Cover images and gallery shots are stored by the PHP side and come
      // back as /uploads/* paths, so they need the same passthrough.
      { source: "/uploads/:path*", destination: "http://localhost:8017/uploads/:path*" },
      // Allow Next.js to proxy legacy HTML pages and assets to the PHP backend during local dev
      { source: "/admin/:path*.html", destination: "http://localhost:8017/admin/:path*.html" },
      { source: "/css/:path*", destination: "http://localhost:8017/css/:path*" },
      { source: "/js/:path*", destination: "http://localhost:8017/js/:path*" },
    ];
  },
};

export default nextConfig;
