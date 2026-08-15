import path from "node:path";
import type { NextConfig } from "next";

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
  // Dev-only: forward /api/* to the local PHP dev server (see
  // .claude/launch.json's "php-dev" config, localhost:8017) so pages that
  // fetch real content (projects, blog, search) have live data to test
  // against. In production this never applies — the plan has Apache route
  // /api/* straight to PHP before it ever reaches the Node process.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/api/:path*", destination: "http://localhost:8017/api/:path*" }];
  },
};

export default nextConfig;
