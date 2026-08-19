import { api, BlogPost } from "@/lib/api";

/**
 * The Technical Archive renders the blog posts managed in the admin, which the
 * API returns as a flat `BlogPost`. This adapts one into the shape the archive
 * pages display, so the mapping — category to topic, a stored timestamp to a
 * display date, a text body to paragraphs — lives in one place rather than
 * being repeated by the index and the detail page.
 */
export type ArchiveEntry = {
  slug: string;
  title: string;
  excerpt: string;
  topic: string;
  /** Display date, e.g. "19 Aug 2026". */
  date: string;
  /** Sortable ISO date. */
  iso: string;
  readingTime: string;
  paragraphs: string[];
};

const UNCATEGORISED = "General";

function displayDate(value?: string): { date: string; iso: string } {
  if (!value) return { date: "", iso: "" };
  // Stored as naive UTC ("2026-08-19 09:41:13"), so mark it as such rather than
  // letting the runtime read it as local time.
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (isNaN(parsed.getTime())) return { date: value, iso: value };
  return {
    date: parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    iso: parsed.toISOString(),
  };
}

/** Bodies are stored as plain text with blank lines between paragraphs. */
function toParagraphs(body?: string): string[] {
  if (!body) return [];
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function toArchiveEntry(post: BlogPost): ArchiveEntry {
  const { date, iso } = displayDate(post.published_at || post.created_at);
  const minutes = Number(post.reading_time) || 0;
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt ?? "",
    topic: post.category?.trim() || UNCATEGORISED,
    date,
    iso,
    readingTime: minutes > 0 ? `${minutes} min` : "",
    paragraphs: toParagraphs(post.body),
  };
}

/** Every published post, newest first, already adapted for display. */
export async function getArchiveEntries(): Promise<ArchiveEntry[]> {
  try {
    const posts = await api.blog();
    return (Array.isArray(posts) ? posts : []).map(toArchiveEntry);
  } catch {
    // The archive is a public page: an API blip should render an empty list
    // rather than a crashed route.
    return [];
  }
}

export async function getArchiveEntry(slug: string): Promise<ArchiveEntry | null> {
  try {
    return toArchiveEntry(await api.blogPost(slug));
  } catch {
    return null;
  }
}

/** Topic filter options, derived from what is actually published. */
export function topicsOf(entries: ArchiveEntry[]): string[] {
  return ["All", ...Array.from(new Set(entries.map((e) => e.topic))).sort()];
}
