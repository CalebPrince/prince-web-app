// Typed fetch client for the PHP backend's public /api/v1/* surface.
// Confirmed none of these routes require cookies/auth, so this is a plain
// stateless wrapper — no credentials, no refresh logic (that's admin-only
// in the PHP site's own public/js/api.js, which this does not need).

export type Tag = { id: number; name: string; slug: string };

export type Project = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  is_featured: boolean;
  tags: Tag[];
  category?: string;
  outcome_metrics?: string;
  is_embeddable?: boolean;
  live_url?: string;
  repo_url?: string;
  cover_image_path?: string;
  gallery?: string[];
  case_study_body?: string;
  testimonial?: { quote: string; client_name: string; rating?: number } | null;
  // Public showcase fields backing the Systems pages. All optional — the
  // admin fills them in per project and the UI omits what is missing.
  tagline?: string;
  showcase_category?: string;
  result_headline?: string;
  metrics?: { value: string; label: string }[];
  client_name?: string;
  role?: string;
  timeline?: string;
  project_year?: string;
  challenge?: string;
  solution?: string;
  stack?: { name: string; icon: string }[];
  created_at?: string;
  [key: string]: unknown;
};

export type BlogPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  reading_time?: number;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
  category?: string;
  body?: string;
  [key: string]: unknown;
};

export type SiteContent = Record<string, string> & { default_theme?: string };

export type Testimonial = {
  id: number;
  quote: string;
  client_name: string;
  rating?: number;
  project_slug?: string;
  project_title?: string;
  project_reference?: string;
  outcome_metrics?: string;
};

export type BuilderOsAgent = {
  key: string;
  name: string;
  role: string;
  status: string;
  capabilities: string[];
  url?: string;
};

export type SearchResult = {
  type: "project" | "blog";
  url: string;
  image: string;
  title: string;
  snippet: string;
};

export type PaymentConfig = {
  public_key?: string;
  currency?: string;
  tier_1_amount?: number;
};

export type PaymentPrepared = {
  reference: string;
  email: string;
  amount: number;
  currency: string;
};

export type PaymentVerified = { status: string };

export type ChatTurn = { role: string; text: string };

export type ChatStatus = {
  online: boolean;
  greeting: string;
  intro: string;
  offline_message: string;
  assistant_name: string;
  voice: { gender: string; accent: string; rate: number; pitch: number };
};

export type ChatMessageResult = {
  token: string;
  reply: string;
  mode: string;
  provider: string | null;
  can_prototype: boolean;
};

export type ChatSession = {
  token: string;
  transcript: ChatTurn[];
  can_build: boolean;
  has_prototype: boolean;
  prototype_status: string | null;
  prototype_url: string | null;
};

// Server-side fetch (generateMetadata, Server Components) has no implicit
// origin the way a browser's relative fetch does, so it needs an absolute
// URL. Client-side, the relative path is fine and preferred (works
// regardless of domain/port). Dev target matches next.config.ts's rewrite
// destination for the PHP dev server; production is the real domain,
// since /api/* there is routed to PHP by Apache/LiteSpeed.
function apiUrl(path: string): string {
  if (typeof window !== "undefined") return path;
  const base = process.env.NODE_ENV === "development" ? "http://localhost:8017" : "https://princecaleb.dev";
  return `${base}${path}`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? body?.errors?.join(" ") ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function postJson<T>(path: string, data: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? body?.errors?.join(" ") ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  projects: (tag?: string) => get<Project[]>(`/api/v1/projects${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`),
  project: (slug: string) => get<Project>(`/api/v1/projects/${encodeURIComponent(slug)}`),
  blog: () => get<BlogPost[]>("/api/v1/blog"),
  blogPost: (slug: string) => get<BlogPost>(`/api/v1/blog/${encodeURIComponent(slug)}`),
  content: () => get<SiteContent>("/api/v1/content"),
  testimonials: () => get<Testimonial[]>("/api/v1/testimonials"),
  search: (q: string) => get<{ results: SearchResult[] }>(`/api/v1/search?q=${encodeURIComponent(q)}`),
  builderOsTeam: () => get<{ system: string; status: string; agents: BuilderOsAgent[] }>("/api/v1/builder-os/team"),
  sageChat: (data: { message: string; transcript: { role: string; text: string }[]; token: string | null }) =>
    postJson<{ reply: string; token?: string }>("/api/v1/agents/sage/chat", data),
  tags: () => get<Tag[]>("/api/v1/tags"),
  submitInquiry: (data: {
    name: string;
    email: string;
    message: string;
    website: string;
    source_project_id: number | null;
    attribution: Record<string, unknown>;
  }) => postJson<{ id: number }>("/api/v1/inquiries", data),
  paymentConfig: () => get<PaymentConfig>("/api/v1/payments/config"),
  preparePayment: (data: { tier: string; name: string; email: string; tos_accepted: true }) =>
    postJson<PaymentPrepared>("/api/v1/payments/prepare", data),
  verifyPayment: (reference: string) => postJson<PaymentVerified>("/api/v1/payments/verify", { reference }),
  subscribeNewsletter: (data: { email: string; website: string; attribution: Record<string, unknown> }) =>
    postJson<{ id: number }>("/api/v1/newsletter/subscribe", data),
  chatStatus: () => get<ChatStatus>("/api/v1/chat/status"),
  chatMessage: (data: { message: string; token: string | null }) =>
    postJson<ChatMessageResult>("/api/v1/chat/message", data),
  chatSession: (token: string) => get<ChatSession>(`/api/v1/chat/session/${encodeURIComponent(token)}`),
  chatInquiry: (data: {
    token: string | null;
    name: string;
    email: string;
    phone: string;
    message: string;
    attribution: Record<string, unknown>;
  }) => postJson<{ status: string }>("/api/v1/chat/inquiry", data),
};

/** Same classifier as the PHP site's window.navPlatformOf (nav-dropdowns.js),
 * kept as one shared util instead of being duplicated per-component. */
export function platformOf(p: Project): "ecommerce" | "mobile" | "webapp" {
  const hay = (
    (p.tags ?? []).map((t) => t.name).join(" ") +
    " " +
    (p.title ?? "") +
    " " +
    (p.summary ?? "")
  ).toLowerCase();
  if (/e-?commerce|storefront|shopfront|\bshop\b|\bstore\b|paystack|woocommerce|checkout/.test(hay)) return "ecommerce";
  if (/mobile|android|\bios\b|react native|flutter/.test(hay)) return "mobile";
  return "webapp";
}
