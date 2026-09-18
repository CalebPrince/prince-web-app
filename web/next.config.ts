import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only (`next dev` still uses Turbopack — fast, and never hit the issue
  // below). The repo root has its own package-lock.json (the separate
  // Tailwind CLI build for the surviving PHP pages) which Turbopack otherwise
  // mistakes for a monorepo root — pin resolution to this app instead.
  //
  // package.json's "build" script passes --webpack, opting the PRODUCTION
  // build out of Turbopack (the default bundler as of Next 16). Confirmed
  // 2026-09-18: a Turbopack production build of this app intermittently
  // produced a broken SSR module graph for exactly one route
  // (/admin/drip) — "Module N was instantiated because it was required
  // from module M, but the module factory is not available" — reproducible
  // on the CI-built bundle actually deployed to production, but NOT
  // reproducible across several local `next build` reruns of the identical
  // source on a different machine, which points at Turbopack's production
  // module-ID assignment being sensitive to build-environment parallelism/
  // timing rather than anything wrong in the route's own code. --webpack is
  // Next's own documented opt-out for exactly this bundler; do not remove it
  // without first confirming a Turbopack production build survives repeated
  // CI runs of this specific route.
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
      // The project showcase has moved twice: /projects when the Figma
      // design landed, then /systems, and now /work. Both old paths are
      // still linked from elsewhere, so both are kept pointing here.
      { source: "/projects", destination: "/work", permanent: true },
      { source: "/projects/:slug", destination: "/work/:slug", permanent: true },
      { source: "/systems", destination: "/work", permanent: true },
      { source: "/systems/:slug", destination: "/work/:slug", permanent: true },
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
      // Legacy assets the PHP side still owns. There is no .html proxy here
      // any more: those pages are deleted, and a dev-only passthrough would
      // resolve URLs locally that are dead in production.
      { source: "/css/:path*", destination: "http://localhost:8017/css/:path*" },
      { source: "/js/:path*", destination: "http://localhost:8017/js/:path*" },
    ];
  },
};

export default nextConfig;
