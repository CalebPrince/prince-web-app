"use client";

import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { adminApi } from "@/lib/api";
import { PageHeader, Card, Button, Field, Input, Textarea, ErrorBanner } from "@/components/admin/ui";
import { PLAN_NAMES, PRICING_SERVICES, PRICING_FIELDS, PRICING_DEFAULTS, pricingKey, pricingValue } from "@/lib/service-pricing";

const FIELDS = Object.keys(PRICING_DEFAULTS);

export default function PricingClient({ initialSettings }: { initialSettings: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((key) => [key, pricingValue(initialSettings, key)]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (key: string, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await adminApi.put("/api/v1/admin/settings",
        Object.fromEntries(FIELDS.map((key) => [key, values[key].trim()]))
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save pricing.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-8">
      <PageHeader kicker="Bookings & Payments" title="Service pricing"
        description="Basic, Standard and Premium for every service. Edits appear on /pricing. Lisa subscriptions are managed separately."
        actions={<Button type="submit" variant="primary" disabled={saving}><Save className="w-4 h-4" />{saving ? "Saving…" : "Save pricing"}</Button>}
      />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {saved && !error && <p role="status" className="rounded-lg border border-green-500/30 p-4 text-green-500">Saved. The public pricing page updates immediately.</p>}
      <Card title="Page introduction" bodyClassName="p-5">
        <Field label="Intro copy">
          <Textarea rows={3} maxLength={5000} value={values.service_pricing_intro} onChange={(event) => set("service_pricing_intro", event.target.value)} />
        </Field>
      </Card>
      {PRICING_SERVICES.map((service) => (
        <section key={service.id} aria-labelledby={`admin-${service.id}`} className="space-y-4">
          <h2 id={`admin-${service.id}`} className="text-xl font-bold">{service.title}{service.monthly ? " · monthly" : " · project"}</h2>
          <div className="grid gap-4 xl:grid-cols-3">
            {PLAN_NAMES.map((name, i) => (
              <Card key={name} title={name} bodyClassName="p-5 space-y-4">
                {PRICING_FIELDS.map((field) => {
                  const key = pricingKey(service.id, i + 1, field);
                  return (
                    <Field key={key} label={field === "price" ? "Displayed price" : field === "tagline" ? "Description" : "Features"}
                      hint={field === "features" ? "One feature per line. Blank fields use the default." : field === "price" ? "Include GHS and /month for maintenance. Displayed quote pricing only." : undefined}>
                      {field === "price" ? (
                        <Input maxLength={120} value={values[key]} onChange={(event) => set(key, event.target.value)} />
                      ) : (
                        <Textarea rows={field === "features" ? 7 : 3} maxLength={field === "features" ? 5000 : 500}
                          value={values[key]} onChange={(event) => set(key, event.target.value)} />
                      )}
                    </Field>
                  );
                })}
              </Card>
            ))}
          </div>
        </section>
      ))}
      <Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving…" : "Save pricing"}</Button>
    </form>
  );
}
