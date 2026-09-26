"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import { Save, ShieldCheck, ShieldOff, Send, Activity, Zap } from "lucide-react";
import {
  PageHeader, Card, Button, Field, Input, Textarea, Select, Tabs,
} from "@/components/admin/ui";
import { ComposioAccounts } from "@/components/admin/ComposioAccounts";

type CapabilityRow = { label: string; available: boolean; used_by: string[] };

/** One Lisa WhatsApp template, as WhatsAppTemplateCatalogController::index() reports it. */
type CatalogTemplate = {
  key: string;
  label: string;
  description: string;
  content_sid: string | null;
  /** "not_created" until it exists, then Meta's verdict: pending/approved/rejected. */
  status: string;
  template_name: string;
  language: string;
  category: string;
  body: string;
  provider: string;
  /** Meta's stated reason, when the template was rejected and Twilio reported one. */
  rejection_reason?: string | null;
  status_url: string;
  create_url: string;
  refresh_url: string;
  delete_url: string | null;
  send_url: string;
  /** Extra request-body field name => human label, for the send form in Marketing Leads. */
  fields: Record<string, string>;
};

type TemplateTally = { approved: number; pending: number; rejected: number; notCreated: number };

/** Buckets template statuses for the tracking cards; anything Meta reports that isn't approved/rejected counts as pending. */
function tallyTemplates(statuses: string[]): TemplateTally {
  const tally: TemplateTally = { approved: 0, pending: 0, rejected: 0, notCreated: 0 };
  for (const status of statuses) {
    if (status === "approved") tally.approved++;
    else if (status === "rejected") tally.rejected++;
    else if (status === "not_created") tally.notCreated++;
    else tally.pending++;
  }
  return tally;
}

function TemplateTallyCards({ tally }: { tally: TemplateTally }) {
  const cards = [
    { label: "Approved", value: tally.approved, tone: "text-green-500" },
    { label: "Pending", value: tally.pending, tone: "text-text" },
    { label: "Rejected", value: tally.rejected, tone: "text-red-400" },
    { label: "Not created", value: tally.notCreated, tone: "text-text-2" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-hairline p-3">
          <div className={`text-2xl font-semibold ${c.tone}`}>{c.value}</div>
          <div className="text-xs text-text-3">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/** A MARKETING template idea not built yet — reference only. */
type PlannedMarketing = { label: string; description: string; sample: string };

type AiTestResult = {
  curl_available?: boolean;
  hint?: string;
  providers?: { name: string; configured: boolean; ok: boolean; detail: string }[];
};

export type EmailTemplateDefaults = Record<
  string,
  { subject?: string; html?: string; text?: string }
>;

/** [settings-key suffix, human label] for every overridable transactional email. */
const EMAIL_TEMPLATES: [string, string][] = [
  ["payment_success", "Payment success"],
  ["invoice_send", "Invoice send"],
  ["invoice_receipt", "Invoice receipt"],
  ["manual_payment_receipt", "Manual payment receipt"],
  ["subscription_receipt", "Subscription receipt"],
  ["proposal_send", "Proposal send"],
  ["booking_client_confirmation", "Booking confirmation (client)"],
  ["booking_internal_notification", "Booking notification (internal)"],
  ["appointment_reminder", "Appointment reminder"],
  ["client_invite", "Client portal invite"],
  ["client_password_reset", "Client password reset"],
  ["client_portal_message", "Client portal message"],
  ["project_request_confirmation", "Project request confirmation"],
  ["testimonial_request", "Testimonial request"],
  ["milestone_reminder", "Milestone reminder"],
  ["inquiry_internal_notification", "Inquiry notification (internal)"],
];

type Tab =
  | "account" | "ai" | "voice" | "messaging" | "integrations"
  | "content-sources" | "lisa-decisions" | "lisa-quoting" | "agent-decisions" | "payments" | "email" | "site" | "booking";

/** Every settings key this page owns, grouped by the tab that edits it. */
const GROUPS: Record<Exclude<Tab, "account" | "email">, string[]> = {
  ai: [
    "deepseek_api_key", "deepseek_model", "gemini_api_key", "gemini_model",
    "anthropic_api_key", "anthropic_model", "openai_api_key", "openai_model",
    "groq_api_key", "groq_model", "openrouter_api_key", "openrouter_model",
  ],
  voice: [
    "elevenlabs_api_key", "elevenlabs_tts_enabled", "elevenlabs_tts_model",
    "elevenlabs_voice_id", "chloe_elevenlabs_voice_id", "wendy_elevenlabs_voice_id",
    "allie_elevenlabs_voice_id", "rocco_elevenlabs_voice_id",
    "elevenlabs_webhook_secret",
    "elevenlabs_postcall_signing_secret", "liveavatar_enabled", "liveavatar_api_key",
    "liveavatar_avatar_id", "liveavatar_voice_id", "liveavatar_context_id",
    "liveavatar_llm_bridge_secret", "liveavatar_llm_configuration_id",
    "liveavatar_sandbox_enabled",
  ],
  messaging: [
    "whatsapp_provider", "whapi_api_token", "whapi_webhook_secret",
    "wati_api_endpoint", "wati_api_token", "wati_webhook_secret",
    "twilio_account_sid", "twilio_auth_token", "twilio_whatsapp_number", "twilio_webhook_url",
    "twilio_intro_content_sid",
    "elevenlabs_whatsapp_agent_id", "elevenlabs_whatsapp_phone_number_id",
    "elevenlabs_whatsapp_intro_template_name", "elevenlabs_whatsapp_intro_template_lang",
    "elevenlabs_whatsapp_alert_template_name", "elevenlabs_whatsapp_alert_template_lang",
    "elevenlabs_whatsapp_alert_template_params",
    "owner_whatsapp_number", "owner_voice_number", "elevenlabs_phone_agent_id",
    "elevenlabs_phone_number_id", "elevenlabs_phone_webhook_secret",
    "elevenlabs_phone_postcall_signing_secret",
  ],
  integrations: [
    "serper_api_key", "hunter_api_key", "apify_api_key", "typesafe_api_key", "typesafe_gate_mode",
    "typesafe_score_threshold", "typesafe_competitor_cutoff",
    "typesafe_cost_per_call_usd", "beacon_full_call_cost_usd", "pagespeed_api_key", "dataforseo_login",
    "dataforseo_password", "slack_webhook_url", "integration_api_key",
    "notification_email", "google_client_id", "composio_api_key",
    "google_places_api_key", "google_place_id",
    "composio_google_calendar_auth_config_id", "composio_gmail_auth_config_id",
    "composio_slack_auth_config_id", "composio_linkedin_auth_config_id",
    "composio_google_calendar_booking_tool", "composio_google_calendar_id",
    "composio_gmail_booking_tool", "composio_gmail_booking_to",
    "composio_slack_booking_tool", "composio_slack_channel",
    "composio_linkedin_post_tool", "composio_linkedin_author_urn",
    "composio_linkedin_stats_tool",
    "model_agnostic_memory_url", "model_agnostic_memory_token", "model_agnostic_memory_key",
    "model_agnostic_agent_token",
  ],
  "agent-decisions": [
    "agent_jev_owner_mode", "agent_jev_customer_mode", "agent_jev_decisions_mode",
    "agent_digest_times", "agent_owner_immediate_daily_cap", "agent_customer_max_defer_days",
  ],
  "lisa-decisions": [
    "lisa_jev_mode", "lisa_followup_mode",
    "lisa_followup_first_silence_hours", "lisa_followup_second_silence_hours",
    "lisa_followup_max_days", "lisa_followup_max_per_episode",
    "lisa_quiet_start", "lisa_quiet_end", "lisa_owner_alert_daily_cap",
  ],
  "lisa-quoting": [
    "lisa_quote_mode", "lisa_quote_summary_after_hours",
    "quote_max_reduction_percent", "quote_owner_review_above_ghs",
    "quote_addon_booking_ghs", "quote_addon_payments_ghs", "quote_addon_accounts_ghs",
    "quote_addon_cms_ghs", "quote_addon_multilanguage_ghs", "quote_addon_integrations_ghs",
    "quote_addon_custom_design_ghs",
  ],
  "content-sources": [
    "radar_tracked_pages_enabled", "radar_tracked_pages_frequency",
    "radar_tracked_pages_posts_per_profile", "radar_tracked_pages",
  ],
  payments: ["paystack_public_key", "paystack_secret_key"],
  site: [
    "default_theme", "animation_style", "splash_screen_enabled", "maintenance_mode",
    "live_chat_enabled", "whatsapp_button_enabled", "chat_hours_enabled",
    "chat_hours_days", "chat_hours_start", "chat_hours_end", "chat_timezone",
    "chat_persona", "social_draft_enabled", "social_draft_frequency",
    "social_draft_auto_approve",
    "allie_discovery_enabled", "allie_discovery_frequency", "allie_news_sources",
    "wendy_review_enabled", "wendy_review_frequency",
    "rocco_review_enabled", "rocco_review_frequency",
  ],
  booking: [
    "booking_enabled", "booking_days", "booking_start_time", "booking_end_time",
    "booking_timezone", "booking_slot_minutes", "booking_lead_days",
    "booking_min_notice_hours",
  ],
};

const EMAIL_KEYS = [
  "smtp_host", "smtp_port", "imap_host", "smtp_gmail_address", "smtp_app_password",
  "mail_from", "mail_from_name", "email_brand_logo_url", "email_site_url",
];

const TABS: { value: Tab; label: string }[] = [
  { value: "account", label: "Account" },
  { value: "ai", label: "AI providers" },
  { value: "voice", label: "Voice & avatar" },
  { value: "messaging", label: "WhatsApp & phone" },
  { value: "integrations", label: "Integrations" },
  { value: "content-sources", label: "Content sources" },
  { value: "lisa-decisions", label: "Lisa decisions" },
  { value: "agent-decisions", label: "Agent decisions" },
  { value: "payments", label: "Payments" },
  { value: "email", label: "Email" },
  { value: "site", label: "Site" },
  { value: "booking", label: "Bookings" },
];

/** Keys rendered as an on/off switch rather than a text input. */
const BOOLEAN_KEYS = new Set([
  "elevenlabs_tts_enabled", "liveavatar_enabled", "liveavatar_sandbox_enabled",
  "splash_screen_enabled", "maintenance_mode", "live_chat_enabled",
  "whatsapp_button_enabled", "chat_hours_enabled", "booking_enabled",
  "social_draft_enabled", "social_draft_auto_approve",
  "allie_discovery_enabled", "wendy_review_enabled", "rocco_review_enabled",
  "radar_tracked_pages_enabled",
]);

/** Keys whose value is a credential — masked with a password input. */
const SECRET_KEYS = new Set([
  "deepseek_api_key", "gemini_api_key", "groq_api_key", "openrouter_api_key",
  "anthropic_api_key", "openai_api_key",
  "elevenlabs_api_key", "elevenlabs_webhook_secret", "elevenlabs_postcall_signing_secret",
  "liveavatar_api_key", "liveavatar_llm_bridge_secret", "whapi_api_token",
  "whapi_webhook_secret", "wati_api_token", "wati_webhook_secret", "twilio_auth_token", "elevenlabs_phone_webhook_secret",
  "elevenlabs_phone_postcall_signing_secret", "serper_api_key", "hunter_api_key",
  "apify_api_key", "typesafe_api_key", "pagespeed_api_key", "dataforseo_password", "integration_api_key", "composio_api_key",
  "google_places_api_key",
  "model_agnostic_memory_token",
  "model_agnostic_agent_token",
  "paystack_secret_key", "smtp_app_password",
]);

/** Allie's built-in news outlets, shown as the placeholder. Keep in step with AllieNewsSources::DEFAULTS in PHP. */
const ALLIE_NEWS_DEFAULTS = ["venturebeat.com", "techcrunch.com", "headsupai.io"];

/** Short help under a field. */
const FIELD_HINTS: Record<string, string> = {
  agent_jev_owner_mode: "What your agents send to you. Jev rates each message: routine ones wait for one digest, important ones go out at once, and anything critical (an outage, a customer who needs you) is never held. Shadow records what it would do and changes nothing.",
  agent_jev_customer_mode: "What your agents send to customers on their own (Nurturer follow-ups, drip email and drip WhatsApp). Jev can skip a message that would be pushy, or stop the sequence for someone who has lost interest. Shadow only records.",
  agent_jev_decisions_mode: "The agents' own judgment calls: Nurturer's reply classification, Chloe raising an escalation, Chief's ordering of what waits on you, Allie's evidence check, Sage's spam check. Shadow only records.",
  agent_digest_times: "When held routine messages go out together, site time, comma separated (e.g. 09:00,17:00). Never in quiet hours.",
  agent_owner_immediate_daily_cap: "Most non-critical messages sent to you immediately per 24 hours. Beyond it, only time-critical ones interrupt. Default 12.",
  agent_customer_max_defer_days: "How many days a message can keep being judged not appropriate before it is abandoned. Default 3.",
  lisa_jev_mode: "Jev reads every customer message before Lisa replies (wants a person, upset, opting out, hot lead, urgent). Shadow records what it would do and changes nothing. Live acts and steers Lisa.",
  lisa_followup_mode: "Follow-ups to WhatsApp conversations that went cold. Shadow lists who it would message and what it would send, and sends nothing. Live sends.",
  lisa_followup_first_silence_hours: "Hours of silence before the first free-text nudge. Default 3.",
  lisa_followup_second_silence_hours: "Hours of silence before the last free-text nudge, still inside WhatsApp's 24 hour window. Default 20.",
  lisa_followup_max_days: "Stop following up this many days after the customer last wrote. Default 7.",
  lisa_followup_max_per_episode: "Most follow-ups per silence. A reply from the customer resets it. Default 3.",
  lisa_quiet_start: "Nothing is sent to customers, and hot-lead pings wait, from this time (24 hour, e.g. 21:00). Uses the chat timezone.",
  lisa_quiet_end: "Quiet hours end at this time (e.g. 08:00).",
  lisa_owner_alert_daily_cap: "Most WhatsApp alerts to you per 24 hours from Lisa's decisions. Default 8.",
  lisa_quote_mode: "Prices from your own Pricing page. Shadow records what Lisa would quote and tells you, but Lisa says nothing new. Live lets Lisa share the figure. Needs Lisa decisions not switched off.",
  lisa_quote_summary_after_hours: "Hours a conversation must be quiet before you get one summary of the quote. Default 2.",
  quote_max_reduction_percent: "The most Lisa may take off your listed price for a smaller project, in percent. Leave blank or 0 and she never reduces.",
  quote_owner_review_above_ghs: "Any figure above this (GHS) is never quoted by Lisa. You are alerted instead. Blank means no limit.",
  quote_addon_booking_ghs: "Added to your listed price when the project also needs this. Leave blank if unpriced: Lisa then uses a flagged estimate and tells you.",
  quote_addon_payments_ghs: "Added when the project needs online payments. Blank means unpriced.",
  quote_addon_accounts_ghs: "Added when the project needs user accounts and logins. Blank means unpriced.",
  quote_addon_cms_ghs: "Added when the project needs a content management system. Blank means unpriced.",
  quote_addon_multilanguage_ghs: "Added when the project needs more than one language. Blank means unpriced.",
  quote_addon_integrations_ghs: "Added when the project needs third-party integrations. Blank means unpriced.",
  quote_addon_custom_design_ghs: "Added when the project needs fully custom design. Blank means unpriced.",
  typesafe_gate_mode: "Shadow judges and logs but rejects nothing. Enforce skips the expensive AI call for rejects. Rocco can recommend when.",
  typesafe_score_threshold: "Candidates scoring below this are rejected. 0.25 to 1.75, default 1.0, higher is stricter.",
  typesafe_competitor_cutoff: "Candidates at or above this competitor probability are rejected. 0.2 to 0.9, default 0.5, lower is stricter.",
  typesafe_cost_per_call_usd: "What one TypeSafe call costs in US dollars, from your TypeSafe plan. Leave blank if unknown, Rocco will not guess.",
  beacon_full_call_cost_usd: "Your estimate of what one full Beacon AI scoring call costs in US dollars. Leave blank if unknown.",
};

const CHOICES: Record<string, string[]> = {
  whatsapp_provider: ["elevenlabs", "whapi", "wati", "twilio"],
  typesafe_gate_mode: ["shadow", "enforce", "off"],
  lisa_jev_mode: ["shadow", "live", "off"],
  agent_jev_owner_mode: ["shadow", "live", "off"],
  agent_jev_customer_mode: ["shadow", "live", "off"],
  agent_jev_decisions_mode: ["shadow", "live", "off"],
  lisa_followup_mode: ["shadow", "live", "off"],
  lisa_quote_mode: ["shadow", "live", "off"],
  default_theme: ["dark", "light", "midnight", "paper"],
  animation_style: ["full", "subtle", "off"],
  social_draft_frequency: ["daily", "weekly", "monthly"],
  allie_discovery_frequency: ["hourly", "daily", "weekly"],
  wendy_review_frequency: ["hourly", "daily", "weekly"],
  rocco_review_frequency: ["hourly", "daily", "weekly"],
  radar_tracked_pages_frequency: ["hourly", "daily", "weekly"],
};

function labelFor(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\bapi\b/gi, "API")
    .replace(/\burn\b/gi, "URN")
    .replace(/\bid\b/gi, "ID")
    .replace(/\burl\b/gi, "URL")
    .replace(/\bsmtp\b/gi, "SMTP")
    .replace(/\bimap\b/gi, "IMAP")
    .replace(/\bpagespeed\b/gi, "PageSpeed")
    .replace(/\btypesafe\b/gi, "TypeSafe")
    .replace(/\busd\b/gi, "(USD)")
    .replace(/\bghs\b/gi, "(GHS)")
    .replace(/\bjev\b/gi, "Jev")
    .replace(/\bquote addon\b/gi, "Add-on price:")
    .replace(/\bwati\b/gi, "WATI")
    .replace(/\bsid\b/gi, "SID")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export default function SettingsClient({
  initialSettings,
  account,
  templateDefaults,
  loadFailed = false,
}: {
  initialSettings: Record<string, string>;
  account: { email?: string; twofa_enabled?: boolean };
  templateDefaults: EmailTemplateDefaults;
  /** True when the server couldn't read the settings. Blocks every group's
   *  Save, because posting the resulting blanks would erase real secrets. */
  loadFailed?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(initialSettings);
  const [tab, setTab] = useState<Tab>("account");
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [email, setEmail] = useState(account.email || "");
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "" });

  const [twofaEnabled, setTwofaEnabled] = useState(!!account.twofa_enabled);
  const [twofaSecret, setTwofaSecret] = useState<string | null>(null);
  const [twofaCode, setTwofaCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");

  const [testStatus, setTestStatus] = useState<Record<string, string>>({});
  const [capabilities, setCapabilities] = useState<CapabilityRow[]>([]);
  const [aiTest, setAiTest] = useState<{ text: string; ok: boolean } | null>(null);
  const [aiProviders, setAiProviders] = useState<NonNullable<AiTestResult["providers"]>>([]);
  const [testingAi, setTestingAi] = useState(false);

  const [catalog, setCatalog] = useState<CatalogTemplate[]>([]);
  const [plannedMarketing, setPlannedMarketing] = useState<PlannedMarketing[]>([]);
  const [catalogMsg, setCatalogMsg] = useState<Record<string, { text: string; ok: boolean }>>({});
  const [catalogBusyKey, setCatalogBusyKey] = useState<string | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && TABS.some((item) => item.value === requested)) {
      setTab(requested as Tab);
    }
  }, []);

  // Capability status is a convenience panel: a failure here should stay quiet
  // rather than surface as a settings error.
  useEffect(() => {
    adminApi
      .get<{ capabilities?: Record<string, CapabilityRow> }>("/api/v1/admin/agent-capabilities")
      .then((data) => setCapabilities(Object.values(data.capabilities ?? {})))
      .catch(() => {});
  }, []);

  // Same deal — the template catalog reports its own errors on demand, so a
  // failed initial read just leaves the status showing as unknown.
  useEffect(() => {
    void loadCatalog();
  }, []);

  const loadCatalog = () =>
    adminApi
      .get<{ templates?: CatalogTemplate[]; planned_marketing?: PlannedMarketing[] }>(
        "/api/v1/admin/whatsapp-templates"
      )
      .then((data) => {
        setCatalog(data.templates ?? []);
        setPlannedMarketing(data.planned_marketing ?? []);
      })
      .catch(() => {});

  /** Shared by every row's Create & submit / Refresh status buttons. */
  const runCatalogAction = async (
    key: string,
    url: string,
    done: (t: CatalogTemplate) => string
  ) => {
    setCatalogBusyKey(key);
    setCatalogMsg((m) => ({ ...m, [key]: { text: "", ok: true } }));
    try {
      const t = await adminApi.post<CatalogTemplate>(url);
      setCatalog((list) => list.map((x) => (x.key === key ? { ...x, ...t } : x)));
      setCatalogMsg((m) => ({ ...m, [key]: { ok: t.status !== "rejected", text: done(t) } }));
    } catch (err) {
      setCatalogMsg((m) => ({
        ...m,
        [key]: { ok: false, text: err instanceof Error ? err.message : "Twilio rejected the request." },
      }));
    } finally {
      setCatalogBusyKey(null);
    }
  };

  const createCatalogTemplate = (t: CatalogTemplate) =>
    runCatalogAction(t.key, t.create_url, (r) => `Submitted to Meta — currently ${r.status}.`);

  const refreshCatalogTemplate = (t: CatalogTemplate) =>
    runCatalogAction(t.key, t.refresh_url, (r) =>
      r.status === "approved" ? "Approved — ready to send from Marketing Leads." : `Still ${r.status}.`
    );

  /** Deletes the rejected/broken Content resource on Twilio, then resubmits it fresh. */
  const deleteAndRebuildTemplate = async (t: CatalogTemplate) => {
    if (!t.delete_url) return;
    setCatalogBusyKey(t.key);
    setCatalogMsg((m) => ({ ...m, [t.key]: { text: "", ok: true } }));
    try {
      await adminApi.del<CatalogTemplate>(t.delete_url);
      const created = await adminApi.post<CatalogTemplate>(t.create_url);
      setCatalog((list) => list.map((x) => (x.key === t.key ? { ...x, ...created } : x)));
      setCatalogMsg((m) => ({
        ...m,
        [t.key]: {
          ok: created.status !== "rejected",
          text: `Deleted the old template and resubmitted — currently ${created.status}.`,
        },
      }));
    } catch (err) {
      setCatalogMsg((m) => ({
        ...m,
        [t.key]: { ok: false, text: err instanceof Error ? err.message : "Could not rebuild the template." },
      }));
    } finally {
      setCatalogBusyKey(null);
    }
  };

  /** Asks the server to make one real call to every AI provider that has a key. */
  const testAi = async () => {
    setTestingAi(true);
    setAiTest(null);
    setAiProviders([]);
    try {
      const r = await adminApi.get<AiTestResult>("/api/v1/admin/ai-test");
      const providers = r.providers ?? [];
      const configured = providers.filter((p) => p.configured);
      if (r.curl_available === false) {
        setAiTest({ ok: false, text: r.hint || "The PHP curl extension is not enabled on this host." });
      } else if (configured.length === 0) {
        setAiTest({ ok: false, text: "No AI provider key is set yet." });
      } else {
        const working = configured.filter((p) => p.ok).length;
        setAiTest({
          ok: working === configured.length,
          text: `${working} of ${configured.length} configured providers working.`,
        });
        setAiProviders(providers);
      }
    } catch (err) {
      setAiTest({ ok: false, text: err instanceof Error ? err.message : "Could not run the test." });
    } finally {
      setTestingAi(false);
    }
  };

  const set = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const saveKeys = async (keys: string[], groupLabel: string) => {
    // Refuse rather than post the blanks a failed read left in the form.
    if (loadFailed) {
      setMessage({
        ok: false,
        text: "Settings could not be loaded, so saving is disabled. Reload the page first.",
      });
      return;
    }
    setSavingGroup(groupLabel);
    setMessage(null);
    try {
      await adminApi.put(
        "/api/v1/admin/settings",
        Object.fromEntries(keys.map((k) => [k, (values[k] ?? "").trim()]))
      );
      setMessage({ ok: true, text: `${groupLabel} saved.` });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setSavingGroup(null);
    }
  };

  const saveEmailAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await adminApi.patch<{ email: string }>("/api/v1/admin/account", { email });
      setMessage({ ok: true, text: `Login email updated to ${result.email}.` });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not update." });
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.patch("/api/v1/admin/account/password", passwords);
      setPasswords({ current_password: "", new_password: "" });
      setMessage({ ok: true, text: "Password updated." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not update." });
    }
  };

  const startTwofa = async () => {
    try {
      const res = await adminApi.post<{ secret: string }>("/api/v1/admin/2fa/setup");
      setTwofaSecret(res.secret);
      setBackupCodes(null);
      setTwofaCode("");
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not start setup." });
    }
  };

  const confirmTwofa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await adminApi.post<{ backup_codes: string[] }>("/api/v1/admin/2fa/confirm", {
        secret: twofaSecret,
        code: twofaCode.trim(),
      });
      setBackupCodes(res.backup_codes);
      setTwofaSecret(null);
      setTwofaEnabled(true);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not confirm." });
    }
  };

  const disableTwofa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.post("/api/v1/admin/2fa/disable", { password: disablePassword });
      setDisablePassword("");
      setTwofaEnabled(false);
      setBackupCodes(null);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not disable." });
    }
  };

  const sendTest = async (key: string) => {
    setTestStatus((prev) => ({ ...prev, [key]: "Sending…" }));
    try {
      await adminApi.post("/api/v1/admin/settings/test-email", {
        key,
        subject: values[`email_tpl_${key}_subject`] ?? "",
        html: values[`email_tpl_${key}_html`] ?? "",
        text: values[`email_tpl_${key}_text`] ?? "",
      });
      setTestStatus((prev) => ({ ...prev, [key]: "Sent to your inbox." }));
    } catch (err) {
      setTestStatus((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Could not send.",
      }));
    }
  };

  const saveTemplates = async () => {
    setSavingGroup("Email templates");
    try {
      const payload: Record<string, string> = {};
      EMAIL_TEMPLATES.forEach(([key]) => {
        (["subject", "html", "text"] as const).forEach((part) => {
          const field = `email_tpl_${key}_${part}`;
          payload[field] = (values[field] ?? "").trim();
        });
      });
      await adminApi.put("/api/v1/admin/settings", payload);
      setMessage({ ok: true, text: "Email templates saved." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setSavingGroup(null);
    }
  };

  /** Renders one settings key using the right control for its type. */
  const renderField = (key: string) => {
    if (BOOLEAN_KEYS.has(key)) {
      return (
        <label key={key} className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent w-4 h-4"
            checked={values[key] === "1"}
            onChange={(e) => set(key, e.target.checked ? "1" : "0")}
          />
          {labelFor(key)}
        </label>
      );
    }

    if (CHOICES[key]) {
      return (
        <Field key={key} label={labelFor(key)} hint={FIELD_HINTS[key]}>
          <Select value={values[key] ?? ""} onChange={(e) => set(key, e.target.value)}>
            <option value="">Default</option>
            {CHOICES[key].map((choice) => (
              <option key={choice} value={choice}>{choice}</option>
            ))}
          </Select>
        </Field>
      );
    }

    if (key === "chat_persona") {
      return (
        <Field
          key={key}
          label="Lisa custom instructions"
          hint="Applies from Lisa's next response. Leave blank for her standard behaviour."
        >
          <Textarea
            rows={6}
            maxLength={4000}
            value={values[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
          />
        </Field>
      );
    }

    if (key === "allie_news_sources") {
      return (
        <Field
          key={key}
          label="Allie news sources"
          hint="News sites Allie can search on purpose, one per line (just the domain, like techcrunch.com). This adds to her open web search and never limits it. Leave it blank to use the built-in list of tech and AI outlets."
        >
          <Textarea
            rows={8}
            value={values[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
            placeholder={ALLIE_NEWS_DEFAULTS.join("\n")}
          />
        </Field>
      );
    }

    if (key === "radar_tracked_pages") {
      return (
        <Field
          key={key}
          label="LinkedIn profiles and company pages"
          hint="One full LinkedIn profile or company URL per line. Their recent posts ground the LinkedIn entries in Content Ideas."
        >
          <Textarea
            rows={8}
            value={values[key] ?? ""}
            onChange={(e) => set(key, e.target.value)}
            placeholder={"https://www.linkedin.com/in/example\nhttps://www.linkedin.com/company/example"}
          />
        </Field>
      );
    }

    return (
      <Field key={key} label={labelFor(key)} hint={FIELD_HINTS[key]}>
        <Input
          type={SECRET_KEYS.has(key) ? "password" : "text"}
          autoComplete={SECRET_KEYS.has(key) ? "new-password" : "off"}
          value={values[key] ?? ""}
          onChange={(e) => set(key, e.target.value)}
        />
      </Field>
    );
  };

  const groupCard = (tabKey: Exclude<Tab, "account" | "email">, title: string) => {
    const keys = GROUPS[tabKey];
    return (
      <Card title={title} bodyClassName="p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">{keys.map(renderField)}</div>
        <Button
          variant="primary"
          onClick={() => saveKeys(keys, title)}
          disabled={savingGroup === title}
        >
          <Save className="w-4 h-4" />
          {savingGroup === title ? "Saving…" : "Save"}
        </Button>
      </Card>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="System"
        title="Everything the site runs on."
        description="Credentials, integrations, email delivery and the switches that change how the public site behaves."
      />

      {loadFailed && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <strong className="font-semibold">Settings could not be loaded.</strong> The fields
          below are showing empty because the request to the API failed — these are not your real
          values. Saving is disabled so blanks can&apos;t overwrite your credentials and API keys.
          Reload the page; if it keeps failing, check that you are still signed in.
        </div>
      )}

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.ok
              ? "border-green-500/30 bg-green-500/10 text-green-500"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <Tabs<Tab> value={tab} onChange={setTab} options={TABS} />
      </div>

      {tab === "account" && (
        <div className="space-y-4">
          <Card title="Login email" bodyClassName="p-5 space-y-4">
            <form onSubmit={saveEmailAddress} className="space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button type="submit" variant="primary">
                <Save className="w-4 h-4" />
                Update email
              </Button>
            </form>
          </Card>

          <Card title="Password" bodyClassName="p-5 space-y-4">
            <form onSubmit={savePassword} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Current password">
                  <Input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={passwords.current_password}
                    onChange={(e) =>
                      setPasswords({ ...passwords, current_password: e.target.value })
                    }
                  />
                </Field>
                <Field label="New password">
                  <Input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={passwords.new_password}
                    onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
                  />
                </Field>
              </div>
              <Button type="submit" variant="primary">
                <Save className="w-4 h-4" />
                Change password
              </Button>
            </form>
          </Card>

          <Card title="Two-factor authentication" bodyClassName="p-5 space-y-4">
            {backupCodes ? (
              <>
                <p className="text-sm text-text-2">
                  Two-factor is on. Save these backup codes somewhere safe — each one works once,
                  and they are the only way back in if you lose your authenticator.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-sm">
                  {backupCodes.map((c) => (
                    <div key={c} className="rounded bg-bg-3 px-3 py-1.5">{c}</div>
                  ))}
                </div>
                <Button variant="outline" onClick={() => setBackupCodes(null)}>Done</Button>
              </>
            ) : twofaSecret ? (
              <form onSubmit={confirmTwofa} className="space-y-4">
                <p className="text-sm text-text-2">
                  Add this secret to your authenticator app, then enter the six-digit code it shows.
                </p>
                <code className="block rounded bg-bg-3 px-3 py-2 font-mono text-sm break-all">
                  {twofaSecret}
                </code>
                <Field label="Six-digit code">
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={twofaCode}
                    onChange={(e) => setTwofaCode(e.target.value)}
                  />
                </Field>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setTwofaSecret(null)}>Cancel</Button>
                  <Button type="submit" variant="primary">Confirm</Button>
                </div>
              </form>
            ) : twofaEnabled ? (
              <form onSubmit={disableTwofa} className="space-y-4">
                <p className="inline-flex items-center gap-2 text-sm text-green-500">
                  <ShieldCheck className="w-4 h-4" />
                  Two-factor authentication is on.
                </p>
                <Field label="Confirm your password to turn it off">
                  <Input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                  />
                </Field>
                <Button type="submit" variant="danger">
                  <ShieldOff className="w-4 h-4" />
                  Disable two-factor
                </Button>
              </form>
            ) : (
              <>
                <p className="inline-flex items-center gap-2 text-sm text-text-2">
                  <ShieldOff className="w-4 h-4" />
                  Two-factor authentication is off.
                </p>
                <Button variant="primary" onClick={startTwofa}>
                  <ShieldCheck className="w-4 h-4" />
                  Set up two-factor
                </Button>
              </>
            )}
          </Card>
        </div>
      )}

      {tab === "ai" && (
        <div className="space-y-4">
          {groupCard("ai", "AI providers")}

          <Card title="Connection test" bodyClassName="p-5 space-y-3">
            <p className="text-sm text-text-2">
              Makes one real call to every AI provider that has a key and reports what came back.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={testAi} disabled={testingAi}>
                <Zap className="w-4 h-4" />
                {testingAi ? "Testing…" : "Test AI connection"}
              </Button>
              {aiTest && (
                <span className={`text-sm ${aiTest.ok ? "text-green-500" : "text-red-400"}`}>
                  {aiTest.text}
                </span>
              )}
            </div>
            {aiProviders.length > 0 && (
              <ul className="space-y-1 text-sm">
                {aiProviders.map((p) => (
                  <li key={p.name} className={p.ok ? "text-green-500" : p.configured ? "text-red-400" : "text-text-3"}>
                    {p.name}: {p.detail}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {capabilities.length > 0 && (
            <Card title="Capability status" bodyClassName="p-5 space-y-3">
              {capabilities.map((cap) => (
                <div key={cap.label} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                      cap.available
                        ? "bg-green-500/10 text-green-500"
                        : "bg-bg-3 text-text-2"
                    }`}
                  >
                    <Activity className="w-3 h-3" />
                    {cap.available ? "Ready" : "Not configured"}
                  </span>
                  <div>
                    <div className="text-sm">{cap.label}</div>
                    <div className="text-xs text-text-3">Used by: {cap.used_by.join(", ")}</div>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
      {tab === "voice" && groupCard("voice", "Voice & avatar")}
      {tab === "messaging" && (
        <div className="space-y-4">
          {groupCard("messaging", "WhatsApp & phone")}

          <Card title="WhatsApp templates" bodyClassName="p-5 space-y-4">
            <p className="text-sm text-text-2">
              Every business-initiated template Lisa can send — WhatsApp only allows
              one of these as the first message to someone who hasn&apos;t written in.
              Create & submit builds it on Twilio and sends it to Meta for approval
              (usually minutes, sometimes up to a day — check back with Refresh).
              Once a template shows <span className="text-green-500">approved</span>,
              send it to a specific contact from Marketing Leads.
            </p>

            {catalog.length > 0 && (
              <TemplateTallyCards tally={tallyTemplates(catalog.map((t) => t.status))} />
            )}

            <div className="space-y-3">
              {catalog.length === 0 && (
                <p className="text-sm text-text-3">Loading templates…</p>
              )}
              {catalog.map((t) => {
                const msg = catalogMsg[t.key];
                const busy = catalogBusyKey === t.key;
                return (
                  <div key={t.key} className="rounded-lg border border-hairline p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-text">{t.label}</div>
                        <div className="text-xs text-text-3">{t.description}</div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${
                          t.status === "approved"
                            ? "bg-green-500/10 text-green-500"
                            : t.status === "rejected"
                              ? "bg-red-500/10 text-red-400"
                              : "bg-bg-3 text-text-2"
                        }`}
                      >
                        <Activity className="w-3 h-3" />
                        {t.status}
                      </span>
                    </div>

                    {t.content_sid && <code className="text-xs text-text-3">{t.content_sid}</code>}

                    {t.status === "rejected" && (
                      <div className="text-xs text-red-400">
                        Meta&apos;s reason: {t.rejection_reason || "not reported. Press Refresh status to fetch it."}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        variant="outline"
                        onClick={() => createCatalogTemplate(t)}
                        disabled={busy || !!t.content_sid}
                      >
                        <Send className="w-4 h-4" />
                        {busy ? "Working…" : "Create & submit"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => refreshCatalogTemplate(t)}
                        disabled={busy || !t.content_sid}
                      >
                        Refresh status
                      </Button>
                      {t.delete_url && (
                        <Button
                          variant="ghost"
                          onClick={() => deleteAndRebuildTemplate(t)}
                          disabled={busy || !t.content_sid}
                        >
                          {busy ? "Working…" : "Delete & rebuild"}
                        </Button>
                      )}
                      {msg?.text && (
                        <span className={`text-sm ${msg.ok ? "text-green-500" : "text-red-400"}`}>
                          {msg.text}
                        </span>
                      )}
                    </div>

                    {t.body && (
                      <pre className="whitespace-pre-wrap rounded-lg bg-bg-3 p-3 text-xs text-text-2">
                        {t.body}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="MARKETING templates" bodyClassName="p-5 space-y-3">
            <p className="text-sm text-text-2">
              Promotional/re-engagement ideas — worth more Meta scrutiny and need an
              opt-in trail, so these are reference only until actually needed for this
              business or a client&apos;s. Say the word and one gets built the same way
              as the templates above.
            </p>
            <TemplateTallyCards
              tally={tallyTemplates([
                ...catalog.filter((t) => t.category === "MARKETING").map((t) => t.status),
                ...plannedMarketing.map(() => "not_created"),
              ])}
            />
            {catalog.some((t) => t.category === "MARKETING") && (
              <div className="rounded-lg border border-hairline p-3 text-sm space-y-1">
                <div className="text-xs text-text-3">
                  Built marketing templates. Their Create, Refresh and other buttons are on their
                  own cards in the list above.
                </div>
                {catalog
                  .filter((t) => t.category === "MARKETING")
                  .map((t) => (
                    <div key={t.key} className="flex items-center justify-between gap-2">
                      <span className="text-text">{t.label}</span>
                      <span className={t.status === "approved" ? "text-green-500" : t.status === "rejected" ? "text-red-400" : "text-text-2"}>
                        {t.status}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            <div className="space-y-3">
              {plannedMarketing.map((m) => (
                <div key={m.label} className="rounded-lg border border-hairline p-4 space-y-1">
                  <div className="font-medium text-text">{m.label}</div>
                  <div className="text-xs text-text-3">{m.description}</div>
                  <pre className="whitespace-pre-wrap rounded-lg bg-bg-3 p-3 text-xs text-text-2 mt-2">
                    {m.sample}
                  </pre>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      {tab === "integrations" && (
        <div className="space-y-4">
          {/* Live connection state, above the credentials that configure it. */}
          <ComposioAccounts onAuthorUrn={(urn) => set("composio_linkedin_author_urn", urn)} />
          {groupCard("integrations", "Integrations")}
        </div>
      )}
      {tab === "agent-decisions" && (
        <div className="space-y-4">
          <Card title="What these do" bodyClassName="p-5 space-y-2">
            <p className="text-sm text-text-2">
              Jev is the decision layer across every agent, and the AI providers only write words afterwards. All three start in shadow
              mode: they record what they would do and change nothing, so you can review it on the Agent Decisions page before switching
              any of them to live. Lisa has her own settings under Lisa decisions. Quiet hours are shared and set there.
            </p>
          </Card>
          {groupCard("agent-decisions", "Agent decisions")}
        </div>
      )}

      {tab === "lisa-decisions" && (
        <div className="space-y-4">
          <Card title="What these do" bodyClassName="p-5 space-y-2">
            <p className="text-sm text-text-2">
              Jev makes the decisions and the AI providers only write Lisa&apos;s words afterwards. Everything here starts in
              shadow mode: it records what it would do and sends nothing, so you can review it on the Lisa Decisions page first.
            </p>
          </Card>
          {groupCard("lisa-decisions", "Decisions, follow-ups and alerts")}
          {groupCard("lisa-quoting", "Quoting from your price list")}
        </div>
      )}

      {tab === "content-sources" && (
        <div id="linkedin-content-sources" className="space-y-4">
          <Card title="How LinkedIn Content Ideas are sourced" bodyClassName="p-5 space-y-2">
            <p className="text-sm text-text-2">
              Radar refreshes recent posts from the LinkedIn pages below. Content Ideas uses those cached,
              real posts to produce its LinkedIn recommendations instead of inventing topics.
            </p>
            {values.radar_tracked_pages_last_run && (
              <p className="text-xs text-text-3">Last refresh: {values.radar_tracked_pages_last_run}</p>
            )}
            {values.radar_tracked_pages_last_status && (
              <p className="text-xs text-text-3">Status: {values.radar_tracked_pages_last_status}</p>
            )}
          </Card>
          {groupCard("content-sources", "LinkedIn content sources")}
        </div>
      )}
      {tab === "payments" && groupCard("payments", "Payments")}
      {tab === "site" && groupCard("site", "Site behaviour")}
      {tab === "booking" && groupCard("booking", "Bookings")}

      {tab === "email" && (
        <div className="space-y-4">
          <Card title="Email delivery" bodyClassName="p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">{EMAIL_KEYS.map(renderField)}</div>
            <Button
              variant="primary"
              onClick={() => saveKeys(EMAIL_KEYS, "Email delivery")}
              disabled={savingGroup === "Email delivery"}
            >
              <Save className="w-4 h-4" />
              {savingGroup === "Email delivery" ? "Saving…" : "Save"}
            </Button>
          </Card>

          <Card
            title="Transactional email templates"
            actions={
              <Button
                variant="primary"
                onClick={saveTemplates}
                disabled={savingGroup === "Email templates"}
              >
                <Save className="w-4 h-4" />
                {savingGroup === "Email templates" ? "Saving…" : "Save templates"}
              </Button>
            }
            bodyClassName="p-4 space-y-2"
          >
            <p className="text-sm text-text-3 px-1">
              Each field&apos;s placeholder shows the built-in copy. A blank field keeps using the
              built-in template on send.
            </p>

            {EMAIL_TEMPLATES.map(([key, label]) => {
              const defaults = templateDefaults[key] ?? {};
              return (
                <details key={key} className="rounded-lg border border-hairline">
                  <summary className="px-4 py-3 cursor-pointer text-sm font-medium select-none hover:bg-bg-3 rounded-lg">
                    {label}
                  </summary>
                  <div className="p-4 pt-0 space-y-3">
                    <Field label="Subject">
                      <Input
                        placeholder={defaults.subject}
                        value={values[`email_tpl_${key}_subject`] ?? ""}
                        onChange={(e) => set(`email_tpl_${key}_subject`, e.target.value)}
                      />
                    </Field>
                    <Field label="HTML body">
                      <Textarea
                        rows={6}
                        placeholder={defaults.html}
                        value={values[`email_tpl_${key}_html`] ?? ""}
                        onChange={(e) => set(`email_tpl_${key}_html`, e.target.value)}
                      />
                    </Field>
                    <Field label="Plain-text body">
                      <Textarea
                        rows={4}
                        placeholder={defaults.text}
                        value={values[`email_tpl_${key}_text`] ?? ""}
                        onChange={(e) => set(`email_tpl_${key}_text`, e.target.value)}
                      />
                    </Field>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" onClick={() => sendTest(key)}>
                        <Send className="w-4 h-4" />
                        Send test to my inbox
                      </Button>
                      {testStatus[key] && (
                        <span className="text-sm text-text-3">{testStatus[key]}</span>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}
