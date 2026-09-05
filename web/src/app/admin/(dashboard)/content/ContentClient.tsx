"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { Save, Upload } from "lucide-react";
import {
  PageHeader, Card, Button, Field, Input, Textarea, Select, Tabs,
} from "@/components/admin/ui";

const FAQ_MAX_ITEMS = 12;

/** Every agent whose display name and voice are editable from this page. */
const AGENTS = [
  "chat", "beacon", "dossier", "nurturer", "proposal", "sketch", "content",
  "arch", "ada", "chief", "scout", "sage", "reel",
];

const AGENT_LABEL: Record<string, string> = {
  chat: "Lisa (site chat)",
  beacon: "Beacon",
  dossier: "Dossier",
  nurturer: "Nurturer",
  proposal: "Proposal",
  sketch: "Sketch",
  content: "Content",
  arch: "Arch",
  ada: "Ada",
  chief: "Chief",
  scout: "Scout",
  sage: "Sage",
  reel: "Reel",
};

type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "color" | "select";
  /** For type "select". Some keys (e.g. quarterly_next_open_date) build their
   *  options at render time instead — see renderField. */
  options?: { value: string; label: string }[];
  hint?: string;
};

const t = (key: string, label: string): FieldSpec => ({ key, label });
const ta = (key: string, label: string): FieldSpec => ({ key, label, type: "textarea" });

/** The next N quarter-start dates ("1 October 2026", …), used for the
 *  "next opening date" picker. The stored value is this exact human string —
 *  it is shown verbatim on the site and in Lisa's booking replies — and the
 *  format matches the homepage's own fallback (quarterDetails in lib/quarterly). */
function quarterStartOptions(count = 8): { value: string; label: string }[] {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), (currentQuarter + i + 1) * 3, 1);
    const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    return { value: label, label };
  });
}

type Section = { title: string; fields: FieldSpec[] };

const SECTIONS: Record<string, Section[]> = {
  hero: [
    {
      title: "Homepage headline override",
      fields: [
        {
          key: "positioning_eyebrow",
          label: "Homepage eyebrow",
          hint: "Each field pins that one line of the homepage headline, replacing the daily AI version of it until you clear the field again. Leave all three blank to let the daily headline run on its own.",
        },
        {
          key: "positioning_title",
          label: "Homepage title",
          hint: "Wrap one phrase in ** to highlight it in the accent colour.",
        },
        ta("positioning_subtitle", "Homepage introduction"),
      ],
    },
    {
      title: "Hero",
      fields: [
        t("availability_badge", "Availability badge"),
        {
          key: "hero_eyebrow",
          label: "Eyebrow",
          hint: "Rewritten daily by the AI headline generator. Editing it here has no effect on the homepage: use the override above to set the headline by hand.",
        },
        t("hero_title", "Title"),
        ta("hero_subtitle", "Subtitle"),
        t("tech_badges", "Tech badges"),
        { key: "hero_atmosphere_intensity", label: "Atmosphere intensity", type: "number" },
        { key: "hero_motion_strength", label: "Motion strength", type: "number" },
      ],
    },
    {
      title: "Hero value props",
      fields: [
        t("hero_value_eyebrow", "Eyebrow"),
        ...[1, 2, 3].flatMap((i) => [
          t(`hero_value_${i}_label`, `Value ${i} label`),
          ta(`hero_value_${i}_text`, `Value ${i} text`),
        ]),
      ],
    },
    {
      title: "Stats",
      fields: [
        ...[1, 2, 3].flatMap((i) => [
          t(`stat_${i}_value`, `Stat ${i} value`),
          t(`stat_${i}_suffix`, `Stat ${i} suffix`),
          t(`stat_${i}_label`, `Stat ${i} label`),
        ]),
        {
          key: "google_review_url",
          label: "Google review link",
          hint: "Opens Google's review form from the homepage rating strip.",
        },
      ],
    },
    {
      title: "Quarterly project intake",
      fields: [
        {
          key: "quarterly_project_status",
          label: "Status",
          type: "select",
          options: [
            { value: "open", label: "Open — accepting projects" },
            { value: "closed", label: "Closed — next quarter only" },
          ],
          hint: "Closed switches the project CTAs and the /request and /book forms to the next-quarter path and blocks new submissions.",
        },
        { key: "quarterly_project_slots", label: "Remaining slots (0-6)", type: "number", hint: "Maximum: 6 projects per quarter. Update the remaining count when you confirm a project. Set 0 to close intake; inquiries and discovery calls do not consume slots." },
        {
          key: "quarterly_next_open_date",
          label: "Next opening date",
          type: "select",
          hint: "Quarter starts only. Shown on the site and in Lisa's booking replies while intake is closed.",
        },
      ],
    },
  ],
  services: [
    {
      title: "Services",
      fields: [1, 2, 3].flatMap((i) => [
        t(`service_${i}_title`, `Service ${i} title`),
        ta(`service_${i}_summary`, `Service ${i} summary`),
        ta(`service_${i}_desc`, `Service ${i} description`),
      ]),
    },
    {
      title: "Timeline",
      fields: [1, 2, 3, 4, 5].flatMap((i) => [
        t(`timeline_${i}_label`, `Step ${i} label`),
        t(`timeline_${i}_title`, `Step ${i} title`),
        ta(`timeline_${i}_desc`, `Step ${i} description`),
      ]),
    },
    {
      title: "Production & live demo",
      fields: [
        t("production_eyebrow", "Production eyebrow"),
        t("production_title", "Production title"),
        t("live_demo_eyebrow", "Live demo eyebrow"),
        t("live_demo_title", "Live demo title"),
        ta("live_demo_desc", "Live demo description"),
        t("live_demo_metric_label", "Metric label"),
        t("live_demo_metric_text", "Metric text"),
        t("live_demo_console_label", "Console label"),
        t("live_demo_video_url", "Video URL"),
      ],
    },
  ],
  about: [
    {
      title: "About & contact",
      fields: [
        ta("about_intro", "About intro"),
        ta("about_bio", "About bio"),
        ta("contact_intro", "Contact intro"),
        t("contact_location", "Location"),
        t("contact_phone", "Phone"),
        t("ai_voice_public_number", "AI voice public number"),
      ],
    },
    {
      title: "Social links",
      fields: [
        t("social_github", "GitHub"),
        t("github_username", "GitHub username"),
        t("social_linkedin", "LinkedIn"),
        t("social_twitter", "Twitter / X"),
        t("social_whatsapp", "WhatsApp"),
        t("social_upwork", "Upwork"),
        t("social_fiverr", "Fiverr"),
        t("social_email", "Email"),
      ],
    },
    {
      title: "Testimonials (homepage)",
      fields: [1, 2, 3].flatMap((i) => [
        ta(`testimonial_${i}_quote`, `Testimonial ${i} quote`),
        t(`testimonial_${i}_name`, `Testimonial ${i} name`),
        t(`testimonial_${i}_role`, `Testimonial ${i} role`),
      ]),
    },
  ],
  archive: [
    {
      title: "Archive",
      fields: [
        t("archive_eyebrow", "Eyebrow"),
        t("archive_title", "Title"),
        ...[1, 2, 3].flatMap((i) => [
          t(`archive_${i}_domain`, `Entry ${i} domain`),
          t(`archive_${i}_meta`, `Entry ${i} meta`),
          t(`archive_${i}_title`, `Entry ${i} title`),
          ta(`archive_${i}_desc`, `Entry ${i} description`),
          t(`archive_${i}_link`, `Entry ${i} link`),
          t(`archive_${i}_metric`, `Entry ${i} metric`),
          t(`archive_${i}_metric_label`, `Entry ${i} metric label`),
        ]),
      ],
    },
  ],
  chat: [
    {
      title: "Chat copy",
      fields: [
        t("chat_assistant_name", "Assistant name"),
        ta("chat_greeting", "Greeting"),
        ta("chat_intro", "Intro"),
        ta("chat_offline_message", "Offline message"),
        ta("chat_persona", "Custom instructions"),
      ],
    },
    {
      title: "Lisa's voice",
      fields: [
        t("chat_voice_gender", "Voice gender"),
        t("chat_voice_accent", "Voice accent"),
        { key: "chat_voice_rate", label: "Voice rate", type: "number" },
        { key: "chat_voice_pitch", label: "Voice pitch", type: "number" },
      ],
    },
  ],
  brand: [
    {
      title: "Brand",
      fields: [
        { key: "brand_primary_color", label: "Primary colour", type: "color" },
        { key: "brand_accent_color", label: "Accent colour", type: "color" },
        t("brand_font", "Font"),
        ta("brand_style_note", "Style note"),
      ],
    },
  ],
};

const VOICE_GENDERS = ["", "female", "male", "neutral"];
const VOICE_ACCENTS = ["", "american", "british", "african", "australian"];

/** Fields the tabs above don't cover, saved alongside them. */
const EXTRA_KEYS = [
  "faq_eyebrow", "faq_title", "faq_count",
  "brand_logo_dark_url", "brand_logo_white_url",
  ...AGENTS.flatMap((a) => [
    `${a}_assistant_name`, `${a}_voice_gender`, `${a}_voice_accent`,
  ]),
  ...Array.from({ length: FAQ_MAX_ITEMS }, (_, i) => [
    `faq_${i + 1}_question`,
    `faq_${i + 1}_answer`,
  ]).flat(),
];

const ALL_KEYS = [
  ...new Set([
    ...Object.values(SECTIONS).flatMap((sections) =>
      sections.flatMap((s) => s.fields.map((f) => f.key))
    ),
    ...EXTRA_KEYS,
  ]),
];

type Tab = keyof typeof SECTIONS | "faq" | "agents";

const TABS: { value: Tab; label: string }[] = [
  { value: "hero", label: "Hero" },
  { value: "services", label: "Services" },
  { value: "about", label: "About" },
  { value: "archive", label: "Archive" },
  { value: "faq", label: "FAQ" },
  { value: "chat", label: "Chat" },
  { value: "agents", label: "Agent voices" },
  { value: "brand", label: "Brand" },
];

export default function ContentClient({
  initialSettings,
  loadFailed = false,
}: {
  initialSettings: Record<string, string>;
  /** True when the server couldn't read /api/v1/admin/settings. Without this
   *  the page is indistinguishable from a genuinely blank one: every field
   *  renders empty and Save would post those blanks over the real values. */
  loadFailed?: boolean;
}) {
  /** The FAQ count defaults to the highest question that actually has content,
   *  matching how the legacy page inferred it before the setting existed. */
  const inferredFaqCount = (() => {
    if (initialSettings.faq_count) return initialSettings.faq_count;
    for (let i = FAQ_MAX_ITEMS; i >= 1; i--) {
      if (
        (initialSettings[`faq_${i}_question`] || "").trim() ||
        (initialSettings[`faq_${i}_answer`] || "").trim()
      ) {
        return String(i);
      }
    }
    return "4";
  })();

  const [values, setValues] = useState<Record<string, string>>({
    ...initialSettings,
    faq_count: inferredFaqCount,
  });
  const [tab, setTab] = useState<Tab>("hero");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});
  /** Keys the user has actually edited this session. The save posts only
   *  these — see the comment on save() for why posting everything is unsafe. */
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const set = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => new Set(prev).add(key));
    setMessage(null);
  };

  // Posts only edited fields. It used to post every key in ALL_KEYS, blanks
  // included, which is destructive: the API skips keys absent from the
  // payload, but writes the ones present — and Settings::set() DELETEs a row
  // whose value is ''. So one save from a form that failed to load its values
  // (see loadFailed) would wipe every Site Content setting, including ones on
  // tabs never opened. Sending just the diff means an unloaded field can't
  // overwrite anything, while deliberately clearing a field still works: it
  // lands in `dirty` with an empty value and is posted as such.
  const save = async () => {
    if (loadFailed) return;
    const changed = ALL_KEYS.filter((k) => dirty.has(k));
    if (changed.length === 0) {
      setMessage({ ok: true, text: "Nothing to save — no fields changed." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await adminApi.put(
        "/api/v1/admin/settings",
        Object.fromEntries(changed.map((k) => [k, (values[k] ?? "").trim()]))
      );
      setDirty(new Set());
      setMessage({
        ok: true,
        text: `Saved ${changed.length} field${changed.length === 1 ? "" : "s"} — the public site updates immediately.`,
      });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (variant: "dark" | "white", file: File) => {
    setUploadStatus((prev) => ({ ...prev, [variant]: "Uploading…" }));
    const formData = new FormData();
    formData.append("file", file);
    try {
      // Multipart upload can't go through the JSON helper.
      const res = await fetch("/api/v1/admin/uploads", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Upload failed.");
      set(`brand_logo_${variant}_url`, body.path);
      setUploadStatus((prev) => ({
        ...prev,
        [variant]: "Uploaded — click Save changes to keep it.",
      }));
    } catch (err) {
      setUploadStatus((prev) => ({
        ...prev,
        [variant]: err instanceof Error ? err.message : "Upload failed.",
      }));
    }
  };

  const renderField = (spec: FieldSpec) => {
    if (spec.type === "textarea") {
      return (
        <Field key={spec.key} label={spec.label}>
          <Textarea
            rows={3}
            value={values[spec.key] ?? ""}
            onChange={(e) => set(spec.key, e.target.value)}
          />
        </Field>
      );
    }
    if (spec.type === "select") {
      // An unset status is "open" everywhere else, so show it that way here too.
      const current =
        (values[spec.key] ?? "") ||
        (spec.key === "quarterly_project_status" ? "open" : "");
      const options =
        spec.key === "quarterly_next_open_date" ? quarterStartOptions() : spec.options ?? [];
      // Keep a legacy or hand-entered value selectable rather than silently
      // snapping it to the first option on the next save.
      const knownValue = current === "" || options.some((o) => o.value === current);
      return (
        <Field key={spec.key} label={spec.label} hint={spec.hint}>
          <Select value={current} onChange={(e) => set(spec.key, e.target.value)}>
            {spec.key === "quarterly_next_open_date" && (
              <option value="">Auto — first day of next quarter</option>
            )}
            {!knownValue && <option value={current}>{current} (current)</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    }
    if (spec.type === "color") {
      return (
        <Field key={spec.key} label={spec.label}>
          <div className="flex gap-2">
            <input
              type="color"
              aria-label={spec.label}
              value={values[spec.key] || "#000000"}
              onChange={(e) => set(spec.key, e.target.value)}
              className="h-9 w-12 rounded-md border border-hairline bg-bg cursor-pointer"
            />
            <Input value={values[spec.key] ?? ""} onChange={(e) => set(spec.key, e.target.value)} />
          </div>
        </Field>
      );
    }
    return (
      <Field key={spec.key} label={spec.label}>
        <Input
          type={spec.type === "number" ? "number" : "text"}
          step={spec.type === "number" ? "any" : undefined}
          value={values[spec.key] ?? ""}
          onChange={(e) => set(spec.key, e.target.value)}
        />
      </Field>
    );
  };

  const faqCount = Math.max(1, Math.min(FAQ_MAX_ITEMS, Number(values.faq_count) || 4));

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Content"
        title="Every word on the public site."
        description="Hero, services, about, FAQ and agent copy. Edits go live immediately. Pricing tiers live on their own Pricing page."
        actions={
          <Button variant="primary" onClick={save} disabled={saving || loadFailed}>
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      {loadFailed && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <strong className="font-semibold">Settings could not be loaded.</strong> Every field
          below is showing empty because the request to the API failed — this is not your real
          content. Saving is disabled so these blanks can&apos;t be written over your live values.
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

      {tab === "faq" ? (
        <div className="space-y-4">
          <Card title="FAQ section" bodyClassName="p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Eyebrow">
                <Input
                  value={values.faq_eyebrow ?? ""}
                  onChange={(e) => set("faq_eyebrow", e.target.value)}
                />
              </Field>
              <Field label="Title">
                <Input
                  value={values.faq_title ?? ""}
                  onChange={(e) => set("faq_title", e.target.value)}
                />
              </Field>
              <Field label="How many questions to show" hint={`1–${FAQ_MAX_ITEMS}`}>
                <Input
                  type="number"
                  min="1"
                  max={FAQ_MAX_ITEMS}
                  value={values.faq_count ?? ""}
                  onChange={(e) => set("faq_count", e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <Card title="Questions" bodyClassName="p-5 space-y-5">
            {Array.from({ length: faqCount }, (_, i) => i + 1).map((i) => (
              <div key={i} className="space-y-3 pb-5 border-b border-hairline last:border-0 last:pb-0">
                <Field label={`Question ${i}`}>
                  <Input
                    value={values[`faq_${i}_question`] ?? ""}
                    onChange={(e) => set(`faq_${i}_question`, e.target.value)}
                  />
                </Field>
                <Field label={`Answer ${i}`}>
                  <Textarea
                    rows={3}
                    value={values[`faq_${i}_answer`] ?? ""}
                    onChange={(e) => set(`faq_${i}_answer`, e.target.value)}
                  />
                </Field>
              </div>
            ))}
          </Card>
        </div>
      ) : tab === "agents" ? (
        <Card title="Agent names & voices" bodyClassName="p-5 space-y-5">
          {AGENTS.map((agent) => (
            <div
              key={agent}
              className="grid gap-4 sm:grid-cols-3 pb-5 border-b border-hairline last:border-0 last:pb-0"
            >
              <Field label={`${AGENT_LABEL[agent] ?? agent} — name`}>
                <Input
                  value={values[`${agent}_assistant_name`] ?? ""}
                  onChange={(e) => set(`${agent}_assistant_name`, e.target.value)}
                />
              </Field>
              <Field label="Voice gender">
                <Select
                  value={values[`${agent}_voice_gender`] ?? ""}
                  onChange={(e) => set(`${agent}_voice_gender`, e.target.value)}
                >
                  {VOICE_GENDERS.map((g) => (
                    <option key={g} value={g}>{g || "Default"}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Voice accent">
                <Select
                  value={values[`${agent}_voice_accent`] ?? ""}
                  onChange={(e) => set(`${agent}_voice_accent`, e.target.value)}
                >
                  {VOICE_ACCENTS.map((a) => (
                    <option key={a} value={a}>{a || "Default"}</option>
                  ))}
                </Select>
              </Field>
            </div>
          ))}
        </Card>
      ) : (
        <div className="space-y-4">
          {SECTIONS[tab].map((section) => (
            <Card key={section.title} title={section.title} bodyClassName="p-5">
              <div className="grid gap-4 sm:grid-cols-2">{section.fields.map(renderField)}</div>
            </Card>
          ))}

          {tab === "brand" && (
            <Card title="Brand logos" bodyClassName="p-5 grid gap-6 sm:grid-cols-2">
              {(["dark", "white"] as const).map((variant) => {
                const url =
                  values[`brand_logo_${variant}_url`] || `/uploads/brand/logo-${variant}.png`;
                return (
                  <div key={variant} className="space-y-3">
                    <Field label={`${variant === "dark" ? "Dark" : "White"} logo URL`}>
                      <Input
                        value={values[`brand_logo_${variant}_url`] ?? ""}
                        onChange={(e) => set(`brand_logo_${variant}_url`, e.target.value)}
                      />
                    </Field>

                    <div
                      className={`rounded-lg border border-hairline p-4 flex items-center justify-center ${
                        variant === "white" ? "bg-neutral-800" : "bg-neutral-100"
                      }`}
                    >
                      {/* Admin-entered path — next/image would need host allowlisting. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`${variant} logo preview`} className="max-h-16" />
                    </div>

                    <label className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors cursor-pointer w-fit">
                      <Upload className="w-4 h-4" />
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadLogo(variant, file);
                          e.target.value = "";
                        }}
                      />
                    </label>

                    {uploadStatus[variant] && (
                      <p className="text-xs text-text-3">{uploadStatus[variant]}</p>
                    )}
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
