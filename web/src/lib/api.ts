// Typed fetch client for the PHP backend's public /api/v1/* surface.
// Confirmed none of these routes require cookies/auth, so this is a plain
// stateless wrapper - no credentials, no refresh logic (that's admin-only
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
  // Public showcase fields backing the /work pages. All optional - the
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

export type AdminProject = Project & {
  is_published: boolean;
  sort_order: number;
  delivery_status: string;
  progress_percent: number;
  contract_value: number;
  estimated_cost: number;
  actual_cost: number;
  hours_worked: number;
  finance_currency: string;
  deadline?: string;
  assigned_agent_key?: string;
  client_email?: string;
  linked_client_name?: string;
};

export type BlogPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  category?: string;
  cover_image_path?: string;
  body: string;
  published_at?: string;
  created_at: string;
  reading_time?: number;
  [key: string]: unknown;
};

export type AdminBlogPost = BlogPost & {
  is_published: boolean;
  sort_order?: number;
};

export type AdminTestimonial = {
  id: number;
  token: string;
  client_name: string;
  client_email: string;
  project_reference?: string;
  rating?: number;
  quote?: string;
  status: 'requested' | 'submitted' | 'approved' | 'rejected';
  sort_order?: number;
  requested_at?: string;
  submitted_at?: string;
  created_at: string;
  updated_at: string;
};

export type AdminSocialDraft = {
  id: number;
  source_type: string;
  source_id: number;
  content: string;
  short_content?: string;
  hashtags?: string;
  image_url?: string;
  linkedin_post_urn?: string;
  status: 'draft' | 'approved' | 'rejected';
  ai_provider?: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
  publish_error?: string;
};

export type AdminContentIdea = {
  id: number;
  day_number: number;
  platform: 'linkedin' | 'youtube';
  title: string;
  description: string;
  grounded: boolean;
  source_posted_at?: string;
  status: 'idea' | 'used' | 'dismissed';
  generated_at: string;
};

export type AdminContentStudioItem = {
  id: number;
  kind: 'social' | 'flyer' | 'blog';
  title?: string;
  body?: string;
  excerpt?: string;
  hashtags?: string;
  image_url?: string;
  image_size?: string;
  notes?: string;
  status: 'draft' | 'approved' | 'used';
  created_at: string;
  updated_at: string;
};

// Mirrors ReportController::summary() exactly. Every field below was read off
// a live response - the previous shape here was hand-written and had drifted
// from the PHP on almost every key, which TypeScript cannot catch because
// get<T>() only casts. If you change the controller, change this too.
export type AdminReportSummary = {
  currency: string;
  revenue: {
    all_time: number;
    this_month: number;
    last_30_days: number;
    by_month: { month: string; amount: number }[];
    by_source: { label: string; amount: number }[];
    by_currency: { currency: string; total: number }[];
  };
  revenue_target: {
    currency: string;
    target: number;
    actual: number;
    won: number;
    weighted_forecast: number;
    /** Already 0-100, not a 0-1 fraction. */
    actual_pct: number;
    /** (actual + weighted_forecast) / target, 0-100. */
    projected_pct: number;
  };
  pipeline: {
    stages: { stage: string; count: number }[];
    inquiries_total: number;
    proposals_total: number;
    proposals_sent: number;
    proposals_accepted: number;
    proposals_declined: number;
    paying_customers: number;
    win_rate: number | null;
    avg_deal_size: number;
    activity_funnel: { key: string; label: string; count: number; href: string; conversion: number | null }[];
    activity_bottleneck: string | null;
    activity_period: { from: string; to: string };
    funnel: { label: string; count: number }[];
  };
  automations: {
    id: number;
    name: string;
    trigger_event: string;
    /** SQLite boolean: 0 or 1. */
    is_active: number;
    nurturer_enabled: number;
    enrollments: number;
    active_enrollments: number;
    unsubscribed: number;
    steps_sent: number;
    ai_sends: number;
  }[];
  /** An object, not a list - the 12-month series is under `by_month`. */
  bookings: {
    total: number;
    upcoming: number;
    completed: number;
    cancelled: number;
    by_month: { month: string; count: number }[];
  };
  lead_sources: { label: string; count: number }[];
  top_clients: {
    email: string;
    name: string | null;
    payments_count: number;
    total: number;
    currency: string;
    last_paid_at: string;
  }[];
  period: {
    from: string;
    to: string;
    prev_from: string;
    prev_to: string;
    revenue: number;
    revenue_prev: number;
    revenue_change_pct: number | null;
    avg_project: number | null;
    avg_project_prev: number | null;
    avg_project_change_pct: number | null;
    revenue_mix: { category: string; label: string; amount: number }[];
  };
  estimates: {
    /** Already 0-100, not a 0-1 fraction. */
    gross_margin_pct: number;
    gross_margin_is_estimate: boolean;
    /** Already 0-100, not a 0-1 fraction. */
    utilization_pct: number;
    utilization_is_estimate: boolean;
    weekly_billable_hours: number | null;
    is_estimate: boolean;
    note: string;
  };
  six_month_view: { month: string; revenue: number; margin_est: number }[];
};

export type AdminAnalyticsSummary = {
  total_views: number;
  by_day: { day: string; views: number }[];
  top_pages: { path: string; views: number }[];
  top_events: { path: string; views: number }[];
  top_referrers: { referrer: string; views: number }[];
  funnel: {
    calculator_runs?: number;
    request_step_3?: number;
    request_submit_success?: number;
    checkout_failed_open?: number;
  };
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

export type GoogleReview = {
  id: string;
  authorName: string;
  authorUri: string;
  authorPhotoUri: string;
  rating: number;
  text: string;
  relativeTime: string;
  publishTime: string;
  googleMapsUri: string;
  placements?: Array<"landing" | "testimonials">;
};

export type Inquiry = {
  id: number;
  name: string;
  email: string;
  message: string;
  type: string;
  status: "unread" | "read" | "flagged" | "archived";
  pipeline_stage?: string;
  project_type?: string;
  budget?: string;
  timeline?: string;
  features?: string;
  created_at: string;
  [key: string]: unknown;
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

async function get<T>(path: string, customHeaders?: HeadersInit): Promise<T> {
  const res = await fetch(apiUrl(path), { 
    headers: { Accept: "application/json", ...customHeaders } 
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // res.statusText is blank on HTTP/2 (which the live site serves over), so
    // fall back to the numeric status rather than throwing an empty message
    // that renders as a blank alert(). Nullish coalescing alone doesn't catch
    // that case since "" is not null/undefined, hence the || below.
    throw new Error(body?.error ?? body?.errors?.join(" ") ?? (res.statusText || `Request failed (HTTP ${res.status})`));
  }
  return res.json() as Promise<T>;
}

export async function postJson<T>(path: string, data: unknown, method: string = "POST"): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // res.statusText is blank on HTTP/2 (which the live site serves over), so
    // fall back to the numeric status rather than throwing an empty message
    // that renders as a blank alert(). Nullish coalescing alone doesn't catch
    // that case since "" is not null/undefined, hence the || below.
    throw new Error(body?.error ?? body?.errors?.join(" ") ?? (res.statusText || `Request failed (HTTP ${res.status})`));
  }
  return res.json() as Promise<T>;
}

export const api = {
  authMe: (cookieHeader?: string) => get<any>("/api/v1/auth/me", cookieHeader ? { Cookie: cookieHeader } : undefined),
  adminDashboard: (cookieHeader?: string) => get<any>("/api/v1/admin/dashboard", cookieHeader ? { Cookie: cookieHeader } : undefined),
  adminNotifications: (cookieHeader?: string) => get<any>("/api/v1/admin/notifications", cookieHeader ? { Cookie: cookieHeader } : undefined),
  adminInquiries: (query?: { status?: string; type?: string; pipeline_stage?: string }, cookieHeader?: string) => {
    const params = new URLSearchParams();
    if (query?.status) params.append("status", query.status);
    if (query?.type) params.append("type", query.type);
    if (query?.pipeline_stage) params.append("pipeline_stage", query.pipeline_stage);
    const qs = params.toString();
    return get<Inquiry[]>(`/api/v1/admin/inquiries${qs ? `?${qs}` : ""}`, cookieHeader ? { Cookie: cookieHeader } : undefined);
  },
  adminUpdateInquiry: (id: number, data: { status?: string; pipeline_stage?: string }) =>
    postJson<{ status: string }>(`/api/v1/admin/inquiries/${id}`, data, "PATCH"),
  adminDeleteInquiry: (id: number) =>
    postJson<{ status: string }>(`/api/v1/admin/inquiries/${id}`, {}, "DELETE"),
  
  adminProjects: (cookieHeader?: string) => get<AdminProject[]>("/api/v1/admin/projects", cookieHeader ? { Cookie: cookieHeader } : undefined),
  adminCreateProject: (data: any) => postJson<any>("/api/v1/admin/projects", data),
  adminUpdateProject: (id: number, data: any) => postJson<any>(`/api/v1/admin/projects/${id}`, data, "PUT"),
  adminDeleteProject: (id: number) => postJson<{ status: string }>(`/api/v1/admin/projects/${id}`, {}, "DELETE"),
  adminReorderProjects: (ids: number[]) => postJson<{ status: string }>("/api/v1/admin/projects/reorder", { order: ids }, "PATCH"),
  adminReviewBuild: (data: { command: string }) => postJson<{ output: string }>("/api/v1/admin/projects/review-build", data),
  adminUploadFile: async (file: File): Promise<{ path: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(apiUrl("/api/v1/admin/uploads"), { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? body?.errors?.join(" ") ?? res.statusText);
    }
    return res.json();
  },

  adminBlogPosts: (cookieHeader?: string) => get<AdminBlogPost[]>("/api/v1/admin/blog", cookieHeader ? { Cookie: cookieHeader } : undefined),
  adminCreateBlogPost: (data: any) => postJson<any>("/api/v1/admin/blog", data),
  adminUpdateBlogPost: (id: number, data: any) => postJson<any>(`/api/v1/admin/blog/${id}`, data, "PUT"),
  adminDeleteBlogPost: (id: number) => postJson<{ status: string }>(`/api/v1/admin/blog/${id}`, {}, "DELETE"),

  adminTestimonials: (cookieHeader?: string) => get<AdminTestimonial[]>("/api/v1/admin/testimonials", cookieHeader ? { Cookie: cookieHeader } : undefined),
  adminGoogleReviews: (cookieHeader?: string) => get<{ configured: boolean; reviews: GoogleReview[]; ratingPublished?: boolean }>("/api/v1/admin/google-reviews", cookieHeader ? { Cookie: cookieHeader } : undefined),
  adminUpdateGoogleReview: (id: string, placements: Array<"landing" | "testimonials">) =>
    postJson<{ status: string; placements: Array<"landing" | "testimonials"> }>("/api/v1/admin/google-reviews", { id, placements }, "PUT"),
  adminRequestTestimonial: (data: any) => postJson<any>("/api/v1/admin/testimonials", data),
  adminUpdateTestimonial: (id: number, data: any) => postJson<any>(`/api/v1/admin/testimonials/${id}`, data, "PATCH"),
  adminDeleteTestimonial: (id: number) => postJson<{ status: string }>(`/api/v1/admin/testimonials/${id}`, {}, "DELETE"),

  adminSocialDrafts: (cookieHeader?: string) => get<AdminSocialDraft[]>("/api/v1/admin/social-drafts", cookieHeader ? { Cookie: cookieHeader } : undefined),
  adminGenerateSocialDraft: () => postJson<any>("/api/v1/admin/social-drafts/generate", {}),
  adminUpdateSocialDraft: (id: number, data: any) => postJson<any>(`/api/v1/admin/social-drafts/${id}`, data, "PATCH"),
  adminDeleteSocialDraft: (id: number) => postJson<{ status: string }>(`/api/v1/admin/social-drafts/${id}`, {}, "DELETE"),

  adminContentIdeas: (cookieHeader?: string) => get<{ ideas: AdminContentIdea[] }>("/api/v1/admin/content-ideas", cookieHeader ? { Cookie: cookieHeader } : undefined),
  adminGenerateContentIdeas: () => postJson<any>("/api/v1/admin/content-ideas/generate", {}),
  adminUpdateContentIdeaStatus: (id: number, status: 'idea' | 'used' | 'dismissed') => postJson<any>(`/api/v1/admin/content-ideas/${id}`, { status }, "PATCH"),
  adminCreateDraftFromIdea: (id: number) => postJson<any>(`/api/v1/admin/content-ideas/${id}/draft`, {}),

  adminContentStudio: (cookieHeader?: string) => get<AdminContentStudioItem[]>("/api/v1/admin/content-studio", cookieHeader ? { Cookie: cookieHeader } : undefined),
  adminUpdateContentStudioItem: (id: number, data: any) => postJson<AdminContentStudioItem>(`/api/v1/admin/content-studio/${id}`, data, "PATCH"),
  adminPromoteContentStudioItem: (id: number) => postJson<{ promoted: boolean; target: string; id: number }>(`/api/v1/admin/content-studio/${id}/promote`, {}),
  adminDeleteContentStudioItem: (id: number) => postJson<{ deleted: boolean }>(`/api/v1/admin/content-studio/${id}`, {}, "DELETE"),

  adminReportSummary: (cookieHeader?: string, params?: { from?: string; to?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([,v]) => v) as [string, string][]).toString() : '';
    return get<AdminReportSummary>(`/api/v1/admin/reports/summary${qs}`, cookieHeader ? { Cookie: cookieHeader } : undefined);
  },
  adminAnalyticsSummary: (days: number = 30) => get<AdminAnalyticsSummary>(`/api/v1/admin/analytics/summary?days=${days}`),
  adminSaveSettings: (data: Record<string, string>) => postJson<any>("/api/v1/admin/settings", data, "PUT"),

  projects: (tag?: string) => get<Project[]>(`/api/v1/projects${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`),
  project: (slug: string) => get<Project>(`/api/v1/projects/${encodeURIComponent(slug)}`),
  blog: () => get<BlogPost[]>("/api/v1/blog"),
  blogPost: (slug: string) => get<BlogPost>(`/api/v1/blog/${encodeURIComponent(slug)}`),
  content: () => get<SiteContent>("/api/v1/content"),
  googleRating: () => get<{
    configured: boolean;
    rating?: number;
    reviewCount?: number;
    googleMapsUri?: string | null;
  }>("/api/v1/google-rating"),
  testimonials: () => get<Testimonial[]>("/api/v1/testimonials"),
  googleReviews: (placement: "landing" | "testimonials") =>
    get<GoogleReview[]>(`/api/v1/google-reviews?placement=${placement}`),
  getTestimonialToken: (token: string) => get<{ client_name?: string }>(`/api/v1/testimonials/${encodeURIComponent(token)}`),
  submitTestimonial: (token: string, data: { client_name: string; rating: number; quote: string }) =>
    postJson<{ status: string }>(`/api/v1/testimonials/${encodeURIComponent(token)}`, data),
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
  prepareInvoicePayment: (data: { link_token: string }) =>
    postJson<PaymentPrepared>("/api/v1/payments/prepare", data),
  // Starts a monthly Lisa subscription. Returns Paystack's hosted checkout
  // URL; no card details ever pass through this app.
  startLisaSubscription: (data: { tier: 1 | 2 | 3; name: string; email: string; tos_accepted: true }) =>
    postJson<{ checkout_url: string }>("/api/v1/subscriptions/lisa", data),
  verifyPayment: (reference: string) => postJson<PaymentVerified>("/api/v1/payments/verify", { reference }),
  getInvoice: (token: string) => get<any>(`/api/v1/invoices/${encodeURIComponent(token)}`),
  getPaymentLink: (token: string) => get<any>(`/api/v1/payments/link/${encodeURIComponent(token)}`),
  getProposal: (token: string) => get<any>(`/api/v1/proposals/${encodeURIComponent(token)}`),
  acceptProposal: (token: string, data: { accepted_by_name: string; terms_accepted: true; agreement_version: string }) =>
    postJson<{ status: string }>(`/api/v1/proposals/${encodeURIComponent(token)}/accept`, data),
  subscribeNewsletter: (data: { email: string; website: string; attribution: Record<string, unknown> }) =>
    postJson<{ id: number }>("/api/v1/newsletter/subscribe", data),
  chatStatus: () => get<ChatStatus>("/api/v1/chat/status"),

  // Internal-availability booking. `config` gates the whole widget; `availability`
  // returns the real bookable "HH:MM" slots for one date (already minus booked
  // ones and the lead/notice window); `book` writes the appointment. The quarterly
  // intake guard lives server-side in AppointmentController::createBooking.
  appointmentConfig: () => get<{ enabled: boolean; timezone: string; slotMinutes: number }>("/api/v1/appointments/config"),
  appointmentAvailability: (date: string) =>
    get<{ slots: string[] }>(`/api/v1/appointments/availability?date=${encodeURIComponent(date)}`),
  bookAppointment: (data: {
    name: string;
    email: string;
    phone: string;
    date: string;
    time: string;
    topic: string;
    website: string;
    attribution: Record<string, unknown>;
  }) => postJson<{ status: string }>("/api/v1/appointments/book", data),
  
  // Client Portal Auth
  clientLogin: (data: any) => postJson<any>("/api/v1/client/auth/login", data),
  clientSetupPassword: (data: any) => postJson<any>("/api/v1/client/auth/setup-password", data),
  clientForgotPassword: (data: any) => postJson<any>("/api/v1/client/auth/forgot-password", data),
  clientResetPassword: (data: any) => postJson<any>("/api/v1/client/auth/reset-password", data),
  clientLogout: () => postJson<any>("/api/v1/client/auth/logout", {}),
  clientGetMe: () => get<any>("/api/v1/client/auth/me"),
  
  // Client Portal Data
  clientGetDashboard: () => get<any>("/api/v1/client/dashboard"),
  clientGetFiles: () => get<any>("/api/v1/client/files"),
  clientGetMessages: () => get<any>("/api/v1/client/messages"),
  clientSendMessage: (data: { body: string }) => postJson<any>("/api/v1/client/messages", data),
  
  chatMessage: (data: { message: string; token: string | null }) =>
    postJson<ChatMessageResult>("/api/v1/chat/message", data),
  chatSession: (token: string) => get<ChatSession>(`/api/v1/chat/session/${encodeURIComponent(token)}`),
  voiceDemoEvent: (event: string, token: string | null, path: string) =>
    postJson<any>("/api/v1/voice-demo/event", { event, token, path }),
  voiceDemoMessage: (message: string, token: string | null, niche: string) =>
    postJson<any>("/api/v1/voice-demo/message", { message, token, niche }),
  chatInquiry: (data: {
    token: string | null;
    name: string;
    email: string;
    phone: string;
    message: string;
    attribution: Record<string, unknown>;
  }) => postJson<{ status: string }>("/api/v1/chat/inquiry", data),
  archChat: (data: { message: string; transcript: { role: string; text: string }[]; brief: Record<string, string> }) =>
    postJson<{ brief: Record<string, string>; ready: boolean; reply: string; step: number }>("/api/v1/arch/chat.php", data),
  archGenerate: (data: { brief: Record<string, string> }) =>
    postJson<{ preview_url: string; download_url?: string; revisions_remaining: number; has_cms: boolean; admin_password?: string; admin_url?: string; slug: string; revision_token: string }>("/api/v1/arch/generate.php", data),
  archRevise: (data: { slug: string; revision_token: string; feedback: string }) =>
    postJson<{ preview_url: string; download_url?: string; revisions_remaining: number; message: string; brief: Record<string, string> }>("/api/v1/arch/revise.php", data),
  submitProjectRequest: async (formData: FormData) => {
    const res = await fetch(apiUrl("/api/v1/project-requests"), {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? body?.errors?.join(" ") ?? res.statusText);
    }
    return res.json() as Promise<{ id: number; message?: string }>;
  },
};

/* ---------------------------------------------------------------------------
 * Admin data access
 *
 * The admin surface spans ~170 endpoints across 40-odd pages. Rather than hand
 * writing a named wrapper for every one, these generic helpers carry the two
 * things every admin call needs — the absolute-URL resolution `apiUrl` does,
 * and forwarding of the session cookie when the call runs on the server during
 * SSR. Pages stay readable because the endpoint path reads inline at the call
 * site, the same way the legacy `api.get("/api/v1/admin/...")` calls did.
 * ------------------------------------------------------------------------- */

export const adminApi = {
  get: <T>(path: string, cookieHeader?: string) =>
    get<T>(path, cookieHeader ? { Cookie: cookieHeader } : undefined),
  post: <T>(path: string, data: unknown = {}) => postJson<T>(path, data, "POST"),
  put: <T>(path: string, data: unknown = {}) => postJson<T>(path, data, "PUT"),
  patch: <T>(path: string, data: unknown = {}) => postJson<T>(path, data, "PATCH"),
  del: <T>(path: string, data: unknown = {}) => postJson<T>(path, data, "DELETE"),
};

/** Admin list endpoints can answer with an error object or a wrapped payload
 *  instead of the bare array a page expects. The legacy admin guarded every one
 *  of these with `Array.isArray(...) ? ... : []`; this keeps that guarantee so a
 *  surprising shape renders an empty list instead of throwing on `.map`. */
export function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** `ssrAdminGet` for the common list case, with the array-shape guard applied. */
export async function ssrAdminList<T>(path: string, cookieHeader: string): Promise<T[]> {
  try {
    return asList<T>(await adminApi.get<unknown>(path, cookieHeader));
  } catch {
    return [];
  }
}

/** Wraps an SSR admin fetch so one failing panel renders empty rather than
 *  collapsing the whole route into an error boundary. */
export async function ssrAdminGet<T>(path: string, cookieHeader: string, fallback: T): Promise<T> {
  try {
    return await adminApi.get<T>(path, cookieHeader);
  } catch {
    return fallback;
  }
}

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
