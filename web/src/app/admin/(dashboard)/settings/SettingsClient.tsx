"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import { Save, ShieldCheck, ShieldOff, Send, Activity, Zap } from "lucide-react";
import {
  PageHeader, Card, Button, Field, Input, Textarea, Select, Tabs,
} from "@/components/admin/ui";
import { ComposioAccounts } from "@/components/admin/ComposioAccounts";

type CapabilityRow = { label: string; available: boolean; used_by: string[] };

type AiTestResult = {
  key_loaded?: boolean;
  curl_available?: boolean;
  http_status?: number;
  curl_error?: string;
  response_snippet?: string;
  hint?: string;
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
  | "payments" | "email" | "site" | "booking";

/** Every settings key this page owns, grouped by the tab that edits it. */
const GROUPS: Record<Exclude<Tab, "account" | "email">, string[]> = {
  ai: [
    "deepseek_api_key", "deepseek_model", "gemini_api_key", "gemini_model",
    "groq_api_key", "groq_model", "openrouter_api_key", "openrouter_model",
  ],
  voice: [
    "elevenlabs_api_key", "elevenlabs_tts_enabled", "elevenlabs_tts_model",
    "elevenlabs_voice_id", "scout_elevenlabs_voice_id", "elevenlabs_webhook_secret",
    "elevenlabs_postcall_signing_secret", "liveavatar_enabled", "liveavatar_api_key",
    "liveavatar_avatar_id", "liveavatar_voice_id", "liveavatar_context_id",
    "liveavatar_llm_bridge_secret", "liveavatar_llm_configuration_id",
    "liveavatar_sandbox_enabled",
  ],
  messaging: [
    "whatsapp_provider", "whapi_api_token", "whapi_webhook_secret",
    "elevenlabs_whatsapp_agent_id", "elevenlabs_whatsapp_phone_number_id",
    "elevenlabs_whatsapp_intro_template_name", "elevenlabs_whatsapp_intro_template_lang",
    "owner_whatsapp_number", "owner_voice_number", "elevenlabs_phone_agent_id",
    "elevenlabs_phone_number_id", "elevenlabs_phone_webhook_secret",
    "elevenlabs_phone_postcall_signing_secret",
  ],
  integrations: [
    "serper_api_key", "hunter_api_key", "apify_api_key", "dataforseo_login",
    "dataforseo_password", "slack_webhook_url", "integration_api_key",
    "notification_email", "google_client_id", "composio_api_key",
    "composio_google_calendar_auth_config_id", "composio_gmail_auth_config_id",
    "composio_slack_auth_config_id", "composio_linkedin_auth_config_id",
    "composio_google_calendar_booking_tool", "composio_google_calendar_id",
    "composio_gmail_booking_tool", "composio_gmail_booking_to",
    "composio_slack_booking_tool", "composio_slack_channel",
    "composio_linkedin_post_tool", "composio_linkedin_author_urn",
    "composio_linkedin_stats_tool",
  ],
  payments: ["paystack_public_key", "paystack_secret_key"],
  site: [
    "default_theme", "animation_style", "splash_screen_enabled", "maintenance_mode",
    "live_chat_enabled", "whatsapp_button_enabled", "chat_hours_enabled",
    "chat_hours_days", "chat_hours_start", "chat_hours_end", "chat_timezone",
    "chat_persona", "social_draft_enabled", "social_draft_frequency",
    "social_draft_auto_approve",
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
]);

/** Keys whose value is a credential — masked with a password input. */
const SECRET_KEYS = new Set([
  "deepseek_api_key", "gemini_api_key", "groq_api_key", "openrouter_api_key",
  "elevenlabs_api_key", "elevenlabs_webhook_secret", "elevenlabs_postcall_signing_secret",
  "liveavatar_api_key", "liveavatar_llm_bridge_secret", "whapi_api_token",
  "whapi_webhook_secret", "elevenlabs_phone_webhook_secret",
  "elevenlabs_phone_postcall_signing_secret", "serper_api_key", "hunter_api_key",
  "apify_api_key", "dataforseo_password", "integration_api_key", "composio_api_key",
  "paystack_secret_key", "smtp_app_password",
]);

const CHOICES: Record<string, string[]> = {
  whatsapp_provider: ["elevenlabs", "whapi"],
  default_theme: ["dark", "light", "midnight", "paper"],
  animation_style: ["full", "subtle", "off"],
  social_draft_frequency: ["daily", "weekly", "monthly"],
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
    .replace(/^\w/, (c) => c.toUpperCase());
}

export default function SettingsClient({
  initialSettings,
  account,
  templateDefaults,
}: {
  initialSettings: Record<string, string>;
  account: { email?: string; twofa_enabled?: boolean };
  templateDefaults: EmailTemplateDefaults;
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
  const [testingAi, setTestingAi] = useState(false);

  // Capability status is a convenience panel: a failure here should stay quiet
  // rather than surface as a settings error.
  useEffect(() => {
    adminApi
      .get<{ capabilities?: Record<string, CapabilityRow> }>("/api/v1/admin/agent-capabilities")
      .then((data) => setCapabilities(Object.values(data.capabilities ?? {})))
      .catch(() => {});
  }, []);

  /** Asks the server to make one real call to the AI provider. */
  const testAi = async () => {
    setTestingAi(true);
    setAiTest(null);
    try {
      const r = await adminApi.get<AiTestResult>("/api/v1/admin/ai-test");
      if (!r.key_loaded || r.curl_available === false) {
        setAiTest({ ok: false, text: r.hint || "The AI provider is not configured." });
      } else if (r.http_status === 200) {
        setAiTest({ ok: true, text: "Gemini is working — live chat is fully AI-powered." });
      } else if (r.curl_error) {
        setAiTest({
          ok: false,
          text: `Connection problem: ${r.curl_error} — the host may be blocking outbound requests.`,
        });
      } else {
        setAiTest({
          ok: false,
          text: `Gemini rejected the key (HTTP ${r.http_status}): ${r.response_snippet ?? ""}`,
        });
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
      await adminApi.post("/api/v1/admin/settings/test-email", { template: key });
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
        <Field key={key} label={labelFor(key)}>
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

    return (
      <Field key={key} label={labelFor(key)}>
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
              Makes one real call to the provider and reports exactly what came back.
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
      {tab === "messaging" && groupCard("messaging", "WhatsApp & phone")}
      {tab === "integrations" && (
        <div className="space-y-4">
          {/* Live connection state, above the credentials that configure it. */}
          <ComposioAccounts onAuthorUrn={(urn) => set("composio_linkedin_author_urn", urn)} />
          {groupCard("integrations", "Integrations")}
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
