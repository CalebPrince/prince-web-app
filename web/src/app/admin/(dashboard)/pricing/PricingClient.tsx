"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { Save } from "lucide-react";
import {
  PageHeader, Card, Button, Field, Input, Textarea, StatusPill, ErrorBanner,
} from "@/components/admin/ui";

const TIERS = [1, 2, 3, 4, 5] as const;
const WEBSITE_TIERS = [1, 2, 3] as const;

/** Mirrors the legacy PRICING_DEFAULTS map — shown when a setting has never
 *  been saved, so the editor reflects what the public page currently renders. */
const DEFAULTS: Record<string, string> = {
  pricing_currency: "GHS",
  website_tier_1_name: "Business Website",
  website_tier_1_price: "From GHS 5,000",
  website_tier_1_tagline:
    "A designed, responsive site that explains what you do and makes it easy for a customer to get in touch.",
  website_tier_1_features:
    "Page structure planned around your customers\nCustom design, reviewed before development\nResponsive layouts for phone, tablet and desktop\nContact or enquiry forms\nLaunch, handover and basic analytics",
  website_tier_2_name: "Custom Web Application",
  website_tier_2_price: "From GHS 15,000",
  website_tier_2_tagline:
    "A tool, portal or dashboard built around how your business actually runs, not around a template.",
  website_tier_2_features:
    "Accounts, roles and permissions\nWorkflows and data modelled to your process\nIntegrations with the tools you already use\nPayments where the work calls for them\nStaged delivery with review points",
  website_tier_3_name: "Mobile App MVP",
  website_tier_3_price: "From GHS 35,000",
  website_tier_3_tagline:
    "iOS and Android from one codebase, scoped down to the smallest version worth putting in front of customers.",
  website_tier_3_features:
    "iOS and Android from a single build\nCore journeys designed and tested\nAPI and backend integration\nStore submission support\nA plan for what comes after launch",
  pricing_tier_1_amount: "3000",
  pricing_tier_1_name: "AI Voice Agent Pilot",
  pricing_tier_1_price: "From GHS 5,000",
  pricing_tier_1_tagline:
    "One focused call flow, trained on your approved information and tested before it reaches customers.",
  pricing_tier_1_features:
    "One inbound call flow\nApproved FAQ and handoff rules\nCall logs and staff summaries\nLaunch review after monitored testing",
  pricing_tier_2_name: "Voice + WhatsApp",
  pricing_tier_2_price: "From GHS 15,000",
  pricing_tier_2_tagline:
    "A connected customer-service system that carries context across calls, WhatsApp, bookings, and staff handoffs.",
  pricing_tier_2_features:
    "AI voice and WhatsApp assistant\nCalendar or CRM integration\nHuman escalation and notifications\nReporting dashboard and audit trail",
  pricing_tier_3_name: "AI Operations System",
  pricing_tier_3_price: "From GHS 25,000",
  pricing_tier_3_tagline:
    "Multiple agents and automations working across sales, service, follow-up, reporting, and internal operations.",
  pricing_tier_3_features:
    "Multiple agent workflows\nCustom dashboards and integrations\nPermissions, monitoring, and safeguards\nOngoing optimisation and support",
  pricing_tier_4_name: "Custom Websites & Mobile Apps",
  pricing_tier_4_price: "Websites from GHS 5,000",
  pricing_tier_4_tagline:
    "Mobile app MVPs start from GHS 35,000. Every build is scoped around your customers and operation.",
  pricing_tier_4_features:
    "Business and e-commerce websites\nCustom web applications from GHS 15,000\niOS and Android mobile app MVPs from GHS 35,000\nAPIs, payments, and third-party integrations\nLaunch support and ongoing improvements",
  pricing_tier_5_name: "Video & Image Ads",
  pricing_tier_5_price: "From GHS 2,000",
  pricing_tier_5_tagline:
    "Scroll-stopping video and image ad creative for Meta, TikTok, and Google, scripted, produced, and delivered ready to launch.",
  pricing_tier_5_features:
    "3-5 short-form video ads or a static image ad set\nPlatform-optimized formats (Meta, TikTok, Google)\nScripting, captions, and on-brand visuals\nOne round of revisions included",
};

const FIELDS = [
  "pricing_intro",
  "pricing_currency",
  "pricing_tier_1_amount",
  ...WEBSITE_TIERS.flatMap((i) => [
    `website_tier_${i}_name`,
    `website_tier_${i}_price`,
    `website_tier_${i}_tagline`,
    `website_tier_${i}_features`,
  ]),
  ...TIERS.flatMap((i) => [
    `pricing_tier_${i}_name`,
    `pricing_tier_${i}_price`,
    `pricing_tier_${i}_tagline`,
    `pricing_tier_${i}_features`,
  ]),
];

export default function PricingClient({
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
    setError(null);

    const amount = values.pricing_tier_1_amount.trim();
    const parsed = Number(amount);
    if (amount !== "" && (!Number.isFinite(parsed) || parsed < 0)) {
      setError("Starter checkout amount must be a valid positive number.");
      return;
    }

    setSaving(true);
    try {
      const payload = Object.fromEntries(FIELDS.map((k) => [k, (values[k] ?? "").trim()]));
      await adminApi.put("/api/v1/admin/settings", payload);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the pricing.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-8">
      <PageHeader
        kicker="Bookings & Payments"
        title="What the public pricing page says."
        description="Edits here go live immediately on /pricing."
        actions={
          <Button type="submit" variant="primary" disabled={saving}>
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save pricing"}
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {saved && !error && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-500">
          Saved. The public pricing page updates immediately.
        </div>
      )}

      <Card title="Page basics" bodyClassName="p-5 space-y-4">
        <Field label="Intro copy" hint="Sits above the tier grid on the public page.">
          <Textarea
            rows={3}
            value={values.pricing_intro}
            onChange={(e) => set("pricing_intro", e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency code">
            <Input
              maxLength={8}
              value={values.pricing_currency}
              onChange={(e) => set("pricing_currency", e.target.value)}
            />
          </Field>
          <Field
            label="Starter checkout amount"
            hint="The number actually charged when someone pays for tier 1 online."
          >
            <Input
              inputMode="decimal"
              value={values.pricing_tier_1_amount}
              onChange={(e) => set("pricing_tier_1_amount", e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {WEBSITE_TIERS.map((i) => (
        <Card
          key={`website-${i}`}
          title={`Website package ${i}`}
          actions={i === 1 ? <StatusPill status="Leads the page" tone="green" /> : undefined}
          bodyClassName="p-5 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input
                maxLength={80}
                value={values[`website_tier_${i}_name`]}
                onChange={(e) => set(`website_tier_${i}_name`, e.target.value)}
              />
            </Field>
            <Field label="Displayed price">
              <Input
                maxLength={120}
                placeholder="From GHS 5,000"
                value={values[`website_tier_${i}_price`]}
                onChange={(e) => set(`website_tier_${i}_price`, e.target.value)}
              />
            </Field>
          </div>
          <Field label="Tagline">
            <Textarea
              rows={2}
              maxLength={500}
              value={values[`website_tier_${i}_tagline`]}
              onChange={(e) => set(`website_tier_${i}_tagline`, e.target.value)}
            />
          </Field>
          <Field
            label="Features"
            hint="One feature per line. These appear as bullets on the public pricing page."
          >
            <Textarea
              rows={5}
              placeholder="One feature per line"
              value={values[`website_tier_${i}_features`]}
              onChange={(e) => set(`website_tier_${i}_features`, e.target.value)}
            />
          </Field>
        </Card>
      ))}

      {TIERS.map((i) => (
        <Card
          key={i}
          title={i <= 3 ? `AI tier ${i}` : `Add-on ${i}`}
          actions={i === 2 ? <StatusPill status="Most requested" tone="green" /> : undefined}
          bodyClassName="p-5 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input
                maxLength={80}
                value={values[`pricing_tier_${i}_name`]}
                onChange={(e) => set(`pricing_tier_${i}_name`, e.target.value)}
              />
            </Field>
            <Field label="Displayed price">
              <Input
                maxLength={120}
                placeholder="From GHS 6,000"
                value={values[`pricing_tier_${i}_price`]}
                onChange={(e) => set(`pricing_tier_${i}_price`, e.target.value)}
              />
            </Field>
          </div>
          <Field label="Tagline">
            <Textarea
              rows={2}
              maxLength={500}
              value={values[`pricing_tier_${i}_tagline`]}
              onChange={(e) => set(`pricing_tier_${i}_tagline`, e.target.value)}
            />
          </Field>
          <Field
            label="Features"
            hint="One feature per line. These appear as bullets on the public pricing page."
          >
            <Textarea
              rows={5}
              placeholder="One feature per line"
              value={values[`pricing_tier_${i}_features`]}
              onChange={(e) => set(`pricing_tier_${i}_features`, e.target.value)}
            />
          </Field>
        </Card>
      ))}
    </form>
  );
}
