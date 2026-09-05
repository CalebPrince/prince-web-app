import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { api } from "@/lib/api";
import { getSystems } from "@/lib/systems";

/**
 * Replaces the hand-written public/sitemap.xml, which had drifted: three of
 * its /work/ entries were placeholder slugs that had never existed and
 * returned 404 on the live site. A sitemap that points at its own 404s
 * undercuts the one thing it is for - describing the site's real shape - so
 * the project and post URLs are now read from the same API the pages are.
 *
 * Only pages worth a search result are listed. The transactional ones
 * (/pay, /invoice, /proposal, /payment-success, /testimonial) are reached
 * from a link someone was sent, /maintenance and /newsletter-unsubscribed
 * are states rather than pages, and /search, /chat and /agent are tools.
 */

/** Rendered whether or not the API answers, so a backend blip can never
 *  publish an empty sitemap. Ordered roughly by how much each matters, which
 *  is also the order the nav offers them in. */
const STATIC_PATHS: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, changeFrequency: "daily" },
  { path: "/services", priority: 0.9, changeFrequency: "monthly" },
  { path: "/website-design", priority: 0.9, changeFrequency: "monthly" },
  { path: "/work", priority: 0.9, changeFrequency: "weekly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/working-together", priority: 0.8, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.8, changeFrequency: "monthly" },
  { path: "/archive", priority: 0.7, changeFrequency: "weekly" },
  { path: "/lisa-ai-assistant", priority: 0.7, changeFrequency: "monthly" },
  { path: "/ai-voice-agents-for-clinics", priority: 0.7, changeFrequency: "monthly" },
  { path: "/ai-adoption-ladder", priority: 0.6, changeFrequency: "monthly" },
  { path: "/marketing-brain", priority: 0.6, changeFrequency: "monthly" },
  { path: "/growth-roadmap", priority: 0.6, changeFrequency: "monthly" },
  { path: "/builder-os", priority: 0.6, changeFrequency: "monthly" },
  { path: "/lab", priority: 0.6, changeFrequency: "monthly" },
  { path: "/ai-safety", priority: 0.5, changeFrequency: "yearly" },
  { path: "/testimonials", priority: 0.5, changeFrequency: "monthly" },
  { path: "/request", priority: 0.5, changeFrequency: "yearly" },
  { path: "/book", priority: 0.5, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/cookies", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
];

// Rendered per request. Prerendered at build, the project and post URLs would
// be frozen until the next deploy, and both are published from the admin panel
// rather than from a commit. `revalidate` is deliberately not used instead:
// this project's FTP deploys race ISR's on-disk artifacts (see the note in
// app/page.tsx), and force-dynamic writes no artifact to go stale.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Each source is caught on its own: a failure in one should cost its own
  // URLs and nothing else, rather than dropping the whole sitemap back to
  // the static pages.
  const [projects, posts] = await Promise.all([
    getSystems().catch(() => []),
    api.blog().catch(() => []),
  ]);

  return [
    ...STATIC_PATHS.map(({ path, priority, changeFrequency }) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency,
      priority,
    })),
    ...projects.map((project) => ({
      url: `${SITE_URL}/work/${project.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...posts.map((post) => ({
      url: `${SITE_URL}/archive/${post.slug}`,
      lastModified: post.published_at ? new Date(post.published_at) : now,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
