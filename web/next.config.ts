import path from "node:path";
import type { NextConfig } from "next";

/**
 * Routes still served by the legacy PHP/HTML site. Production runs two apps
 * behind one domain: OpenLiteSpeed serves any real file (and every PHP
 * route) first, and only hands what's left to this Node app. So
 * `/pricing.html` already resolves on its own — but `/pricing` matches no
 * file, falls through to here, and would 404 without these redirects.
 *
 * Delete an entry as its page is ported into this app.
 */
const LEGACY_HTML_ROUTES = [
  "marketing-brain",
  "ai-voice-agents-for-clinics",
  "growth-roadmap",
  "agent",
];

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
      // Not yet ported — hand these back to the legacy page. Temporary
      // (308-free) so the redirect isn't cached once the real route exists.
      ...LEGACY_HTML_ROUTES.map((route) => ({
        source: `/${route}`,
        destination: `/${route}.html`,
        permanent: false,
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
    ];
  },
};

export default nextConfig;
