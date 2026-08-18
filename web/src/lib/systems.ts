import { api, type Project } from "@/lib/api";

export interface SystemMetric {
  value: string;
  label: string;
}

export interface SystemStackItem {
  name: string;
  /** react-icons key, e.g. "SiReact". Empty when the tag has no glyph. */
  icon: string;
}

/**
 * View model for the Systems pages. The PHP API carries every field the
 * design needs; this normalises the raw row and supplies the layout rhythm.
 * Fields the admin hasn't filled in yet come back empty and the UI omits
 * that block rather than showing a placeholder.
 */
export interface SystemView {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  desc: string;
  overview: string;
  result: string;
  metrics: SystemMetric[];
  year: string;
  client: string;
  role: string;
  timeline: string;
  challenge: string;
  solution: string;
  /** Engineering write-up paragraphs, shown when challenge/solution are unset. */
  body: string[];
  stack: SystemStackItem[];
  live: string;
  repo: string;
  isEmbeddable: boolean;
  img: string;
  gallery: string[];
  testimonial: { quote: string; client_name: string; rating?: number } | null;
  /** Ticked as "Display on homepage" in the admin Projects form. */
  featured: boolean;
  /** Layout rhythm — alternating wide/tall cards, as in the design. */
  span: string;
  ratio: string;
}

const str = (value: unknown): string => String(value ?? "").trim();

/** Only http(s) URLs survive — guards against javascript: and friends. */
function safeUrl(value: unknown): string {
  const raw = str(value);
  if (!raw) return "";
  try {
    const url = new URL(raw, "https://princecaleb.dev");
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

/** Falls back to the legacy category column when showcase_category is unset. */
function categoryOf(p: Project): string {
  const showcase = str(p.showcase_category);
  if (showcase) return showcase;
  const legacy = str(p.category).replaceAll("_", " ");
  if (!legacy) return "Deployed system";
  return legacy.charAt(0).toUpperCase() + legacy.slice(1).toLowerCase();
}

export function toSystemView(p: Project, index = 0): SystemView {
  const metrics = Array.isArray(p.metrics) ? (p.metrics as SystemMetric[]) : [];
  const outcomeLines = str(p.outcome_metrics)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const wide = index % 4 === 0 || index % 4 === 3;

  return {
    slug: p.slug,
    name: p.title,
    tagline: str(p.tagline),
    category: categoryOf(p),
    desc: p.summary,
    overview: p.summary,
    // Prefer the curated headline, else the first free-text outcome line.
    result: str(p.result_headline) || outcomeLines[0] || "",
    metrics: metrics.filter((m) => str(m?.value) || str(m?.label)),
    year: str(p.project_year) || str(p.created_at).slice(0, 4),
    client: str(p.client_name),
    role: str(p.role),
    timeline: str(p.timeline),
    challenge: str(p.challenge),
    solution: str(p.solution),
    body: str(p.case_study_body)
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean),
    stack: (Array.isArray(p.stack) ? (p.stack as SystemStackItem[]) : []).filter((s) => str(s?.name)),
    live: safeUrl(p.live_url),
    repo: safeUrl(p.repo_url),
    isEmbeddable: Boolean(p.is_embeddable),
    img: str(p.cover_image_path),
    gallery: (p.gallery ?? []).filter(Boolean),
    testimonial: p.testimonial ?? null,
    featured: Boolean(p.is_featured),
    span: wide ? "lg:col-span-7" : "lg:col-span-5",
    ratio: wide ? "aspect-[16/10]" : "aspect-[4/5]",
  };
}

/**
 * The homepage showcase: the first three projects ticked "Display on
 * homepage" in the admin, in sort order (the API already returns them
 * sorted). Falls back to the first three published projects so the section
 * is never empty before anything has been ticked.
 */
export async function getFeaturedSystems(limit = 3): Promise<SystemView[]> {
  const all = await getSystems();
  const featured = all.filter((s) => s.featured);
  return (featured.length ? featured : all).slice(0, limit);
}

export async function getSystems(): Promise<SystemView[]> {
  const projects = await api.projects();
  return projects.map(toSystemView);
}

export async function getSystem(slug: string): Promise<SystemView> {
  return toSystemView(await api.project(slug));
}

/** Category filter chips, derived from whatever the API actually returned. */
export function categoriesOf(systems: SystemView[]): string[] {
  return [...new Set(systems.map((s) => s.category).filter(Boolean))].sort();
}
