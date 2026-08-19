"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { Save } from "lucide-react";
import {
  PageHeader, Card, Button, Field, Input, Textarea, StatusPill, ErrorBanner,
} from "@/components/admin/ui";

const TIERS = [1, 2, 3] as const;

/** Mirrors the legacy LISA_DEFAULTS map — what the public Lisa page renders
 *  when a setting has never been saved. */
const DEFAULTS: Record<string, string> = {
  lisa_page_eyebrow: "// Meet Lisa",
  lisa_page_subheadline:
    "Lisa can answer calls and messages, understand what a customer needs, complete the next task in the tools your team already uses, and bring a person in when judgment is required.",
  lisa_page_integrations_disclaimer:
    "Tool names describe possible integrations. Availability depends on the tool's API, your account plan, permissions, and the workflow we approve together.",
  lisa_pricing_eyebrow: "// One connected service",
  lisa_pricing_title: "Lisa, sold as one whole service.",
  lisa_page_service_pitch:
    "Lisa isn't a pile of separate tools you have to stitch together. She's one monthly service — calls, WhatsApp, and web chat on one side, and your social media tools, apps, and CRMs connected on the other, all managed as a single subscription.",
  lisa_tier_1_name: "Starter",
  lisa_tier_1_price_ghs: "GHS 800",
  lisa_tier_1_price_usd: "$55",
  lisa_tier_1_tagline: "One channel, answering the questions and requests that come in every day.",
  lisa_tier_1_features:
    "One channel: WhatsApp or web chat\nApproved FAQ and lead capture\nMonthly conversation summary",
  lisa_tier_2_name: "Growth",
  lisa_tier_2_price_ghs: "GHS 2,000",
  lisa_tier_2_price_usd: "$140",
  lisa_tier_2_tagline:
    "Voice and messaging together, connected to the calendar and CRM your team already uses.",
  lisa_tier_2_features:
    "Voice, WhatsApp, and web chat\nOne CRM or calendar integration\nHuman escalation and notifications\nMonthly reporting dashboard",
  lisa_tier_3_name: "Scale",
  lisa_tier_3_price_ghs: "GHS 4,500",
  lisa_tier_3_price_usd: "$300",
  lisa_tier_3_tagline:
    "Every channel plus a live AI video agent, connected to your apps and CRMs with priority support.",
  lisa_tier_3_features:
    "All channels, including social inboxes\nLive AI video agent with an agreed monthly allowance\nMultiple CRM, app, and social integrations\nPriority support and monthly optimisation\nFull audit trail and reporting",
  lisa_custom_tier_name: "Custom",
  lisa_custom_tier_cta_label: "Talk to us",
  lisa_custom_tier_tagline:
    "A workflow built around your exact tools, volume, and compliance needs, priced once we've scoped it.",
  lisa_custom_tier_features:
    "Unlimited channels and integrations\nCustom-trained branded video avatar\nDedicated workflows and safeguards\nA named point of contact",
};

const FIELDS = [
  "lisa_page_eyebrow",
  "lisa_page_subheadline",
  "lisa_page_integrations_disclaimer",
  "lisa_pricing_eyebrow",
  "lisa_pricing_title",
  "lisa_page_service_pitch",
  ...TIERS.flatMap((i) => [
    `lisa_tier_${i}_name`,
    `lisa_tier_${i}_price_ghs`,
    `lisa_tier_${i}_price_usd`,
    `lisa_tier_${i}_tagline`,
    `lisa_tier_${i}_features`,
  ]),
  "lisa_custom_tier_name",
  "lisa_custom_tier_cta_label",
  "lisa_custom_tier_tagline",
  "lisa_custom_tier_features",
];

export default function LisaClient({
  initialSettings,
}: {
  initialSettings: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((k) => [k, initialSettings[k] || DEFAULTS[k] || ""]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminApi.put(
        "/api/v1/admin/settings",
        Object.fromEntries(FIELDS.map((k) => [k, (values[k] ?? "").trim()]))
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the Lisa page copy.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-8">
      <PageHeader
        kicker="Content"
        title="What the Lisa page says."
        description="Copy and pricing for the public Lisa product page. Edits go live immediately."
        actions={
          <Button type="submit" variant="primary" disabled={saving}>
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {saved && !error && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-500">
          Saved — the public Lisa page updates immediately.
        </div>
      )}

      <Card title="Page copy" bodyClassName="p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Eyebrow">
            <Input
              value={values.lisa_page_eyebrow}
              onChange={(e) => set("lisa_page_eyebrow", e.target.value)}
            />
          </Field>
          <Field label="Pricing eyebrow">
            <Input
              value={values.lisa_pricing_eyebrow}
              onChange={(e) => set("lisa_pricing_eyebrow", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Subheadline">
          <Textarea
            rows={3}
            value={values.lisa_page_subheadline}
            onChange={(e) => set("lisa_page_subheadline", e.target.value)}
          />
        </Field>
        <Field label="Pricing title">
          <Input
            value={values.lisa_pricing_title}
            onChange={(e) => set("lisa_pricing_title", e.target.value)}
          />
        </Field>
        <Field label="Service pitch">
          <Textarea
            rows={4}
            value={values.lisa_page_service_pitch}
            onChange={(e) => set("lisa_page_service_pitch", e.target.value)}
          />
        </Field>
        <Field
          label="Integrations disclaimer"
          hint="Shown under the integrations grid to keep availability claims honest."
        >
          <Textarea
            rows={3}
            value={values.lisa_page_integrations_disclaimer}
            onChange={(e) => set("lisa_page_integrations_disclaimer", e.target.value)}
          />
        </Field>
      </Card>

      {TIERS.map((i) => (
        <Card
          key={i}
          title={`Tier ${i} — monthly`}
          actions={i === 2 ? <StatusPill status="Most requested" tone="green" /> : undefined}
          bodyClassName="p-5 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name">
              <Input
                maxLength={80}
                value={values[`lisa_tier_${i}_name`]}
                onChange={(e) => set(`lisa_tier_${i}_name`, e.target.value)}
              />
            </Field>
            <Field label="Price (GHS, monthly)">
              <Input
                maxLength={60}
                placeholder="GHS 2,000"
                value={values[`lisa_tier_${i}_price_ghs`]}
                onChange={(e) => set(`lisa_tier_${i}_price_ghs`, e.target.value)}
              />
            </Field>
            <Field label="Price (USD, monthly)">
              <Input
                maxLength={60}
                placeholder="$140"
                value={values[`lisa_tier_${i}_price_usd`]}
                onChange={(e) => set(`lisa_tier_${i}_price_usd`, e.target.value)}
              />
            </Field>
          </div>
          <Field label="Tagline">
            <Textarea
              rows={2}
              maxLength={500}
              value={values[`lisa_tier_${i}_tagline`]}
              onChange={(e) => set(`lisa_tier_${i}_tagline`, e.target.value)}
            />
          </Field>
          <Field
            label="Features"
            hint="One feature per line. These appear as bullets on the public Lisa page."
          >
            <Textarea
              rows={4}
              placeholder="One feature per line"
              value={values[`lisa_tier_${i}_features`]}
              onChange={(e) => set(`lisa_tier_${i}_features`, e.target.value)}
            />
          </Field>
        </Card>
      ))}

      <Card title="Custom tier" bodyClassName="p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              maxLength={80}
              value={values.lisa_custom_tier_name}
              onChange={(e) => set("lisa_custom_tier_name", e.target.value)}
            />
          </Field>
          <Field label="CTA label">
            <Input
              maxLength={60}
              value={values.lisa_custom_tier_cta_label}
              onChange={(e) => set("lisa_custom_tier_cta_label", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Tagline">
          <Textarea
            rows={2}
            maxLength={500}
            value={values.lisa_custom_tier_tagline}
            onChange={(e) => set("lisa_custom_tier_tagline", e.target.value)}
          />
        </Field>
        <Field label="Features" hint="One feature per line.">
          <Textarea
            rows={4}
            value={values.lisa_custom_tier_features}
            onChange={(e) => set("lisa_custom_tier_features", e.target.value)}
          />
        </Field>
      </Card>
    </form>
  );
}
