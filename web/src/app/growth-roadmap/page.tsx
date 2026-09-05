"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

// Free Growth Roadmap lead-gen page - ported from public/growth-roadmap.html.
// The form really submits to /api/v1/inquiries (type=inquiry, same as the
// plain contact form), honeypot included, exactly like the legacy page.

const GAP_OPTIONS = [
  "Not enough traffic hitting the site",
  "Traffic comes, but it doesn't convert",
  "Not sure what's working, I need tracking clarity",
  "All of the above / not sure yet",
];

const VALUE_ROWS = [
  { label: "Traffic", body: "Is anyone actually running weekly campaigns to bring the right people to your site?" },
  { label: "Conversion", body: "Where do visitors land, get stuck, and leave without booking or buying?" },
  { label: "Tracking", body: "Do you actually know where the drop-off happens, or are you guessing?" },
];

const SAMPLE_FINDINGS = [
  { tag: "Traffic", body: "The ad is sending clicks to a page that takes 6.8s to load on mobile, most visitors bounce before it finishes." },
  { tag: "Conversion", body: "The homepage has three competing calls to action. Visitors aren't sure which one to click, so many click none." },
  { tag: "Tracking", body: "No conversion pixel is firing on the booking form, every ad platform is optimizing blind." },
];

const SAMPLE_ACTIONS = [
  "Fix the tracking pixel",
  "Cut the homepage to one CTA",
  "Compress the landing page",
];

const NEXT_STEPS = [
  { title: "I look at your site", body: "I'll review your traffic, conversion, and tracking setup." },
  { title: "You get a personal reply", body: "I'll email you a clear roadmap of what's costing you the most." },
  { title: "We scope it, if it's a fit", body: "No pressure, you decide what to do with it." },
];

export default function GrowthRoadmap() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [gap, setGap] = useState("");
  const [details, setDetails] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    const message =
      `Free Growth Roadmap request\nWebsite: ${siteUrl}\nBiggest gap: ${gap}` +
      (details.trim() ? `\n\nDetails: ${details.trim()}` : "");
    try {
      await api.submitInquiry({ name, email, message, website, source_project_id: null, attribution: {} });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-28 pb-16 md:px-10 md:pt-36 md:pb-20">
          <Reveal>
            <SectionLabel>Free Growth Roadmap</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="page-hero-title mt-8 max-w-4xl">
              Launch isn&rsquo;t the finish line. It&rsquo;s <span className="text-accent">day one</span>.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              Most business owners spend thousands on a beautiful new website, hit launch, and wait.
              Nobody comes. A website without marketing is just an expensive digital business card
              hidden in a desert, scaling online takes traffic and conversion working together,
              every single day.
            </p>
          </Reveal>
          <Reveal delay={220}>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              I&rsquo;m Prince Caleb. I build websites, AI agents, and automations for businesses in
              Accra and beyond, and I don&rsquo;t disappear at handover. Tell me about your site
              below and I&rsquo;ll map your traffic, conversion, and tracking gaps, free, with clear
              scope before you commit to anything.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── SAMPLE ROADMAP ──────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pb-8 md:px-10">
        <Reveal className="mb-10">
          <SectionLabel index="01">See a sample roadmap</SectionLabel>
          <h2 className="mt-6 max-w-3xl text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
            Here&rsquo;s exactly what you&rsquo;ll get back.
          </h2>
          <p className="mt-5 max-w-2xl text-text-2">
            Not a generic PDF template. A short, specific breakdown of what&rsquo;s costing a real
            business traffic, conversions, and visibility, built the same way yours will be.
          </p>
        </Reveal>

        <Reveal className="overflow-hidden rounded-[var(--radius)] border border-hairline bg-bg-2/50 glass">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-4">
            <div>
              <span className="label text-muted">Sample roadmap / a local service business</span>
              <h3 className="mt-1 text-lg font-semibold tracking-tight">3 gaps found, 1 quick win</h3>
            </div>
            <span className="label rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-accent">
              Free, no obligation
            </span>
          </div>
          <div className="grid gap-8 p-6 lg:grid-cols-12 lg:p-8">
            <div className="lg:col-span-7">
              <div className="space-y-3">
                {SAMPLE_FINDINGS.map((f) => (
                  <div key={f.tag} className="rounded-[var(--radius)] border border-hairline bg-bg/60 p-4 glass">
                    <span className="label text-accent">{f.tag}</span>
                    <p className="mt-2 text-sm text-text-2">{f.body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-hairline pt-5">
                <span className="text-sm text-text-2">Overall growth score</span>
                <span className="text-lg font-bold text-text">42 / 100</span>
              </div>
            </div>
            <div className="lg:col-span-5">
              <p className="label text-muted">Recommended next steps</p>
              <div className="mt-4 space-y-2.5">
                {SAMPLE_ACTIONS.map((a) => (
                  <div key={a} className="flex items-center gap-3 text-sm text-text-2">
                    <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                    {a}
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between rounded-[var(--radius)] border border-accent/30 bg-accent/[0.06] px-4 py-3">
                <span className="text-sm text-text-2">Est. recoverable conversions</span>
                <span className="text-lg font-bold text-accent">+18%</span>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── VALUE + FORM ─────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32" id="roadmap-form">
        <div className="grid gap-8 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <div className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 glass">
              <span className="label text-accent">What you get</span>
              <div className="mt-6 space-y-6">
                {VALUE_ROWS.map((r) => (
                  <div key={r.label} className="border-t border-hairline pt-5 first:border-t-0 first:pt-0">
                    <strong className="text-text">{r.label}</strong>
                    <p className="mt-1 text-sm text-text-2">{r.body}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm text-muted">
                No pitch, no pressure, just a clear picture of what&rsquo;s costing you revenue and
                what to fix first.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100} className="lg:col-span-7">
            <div className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 md:p-10 glass">
              {sent ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <span className="tilt-3d tilt-3d-tile grid size-14 place-items-center rounded-full bg-accent text-on-accent">
                    <Check className="icon-3d icon-3d-on-accent size-7" />
                  </span>
                  <p className="label mt-6 text-accent">Roadmap request received</p>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight">Thanks, I have what I need.</h3>
                  <p className="mt-3 text-text-2">Here&rsquo;s what happens from here:</p>
                  <ol className="mt-6 w-full space-y-4 text-left">
                    {NEXT_STEPS.map((s, i) => (
                      <li key={s.title} className="flex gap-4">
                        <span className="label mt-0.5 shrink-0 text-accent">0{i + 1}</span>
                        <div>
                          <strong className="text-text">{s.title}</strong>
                          <p className="text-sm text-text-2">{s.body}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <Field label="Name" htmlFor="name">
                      <input
                        id="name"
                        required
                        maxLength={255}
                        placeholder="Your full name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Email" htmlFor="email">
                      <input
                        id="email"
                        type="email"
                        required
                        maxLength={255}
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <Field label="Website URL" htmlFor="site_url">
                    <input
                      id="site_url"
                      required
                      maxLength={255}
                      placeholder="yourbusiness.com"
                      value={siteUrl}
                      onChange={(e) => setSiteUrl(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="What's the biggest gap right now?" htmlFor="gap">
                    <select
                      id="gap"
                      required
                      value={gap}
                      onChange={(e) => setGap(e.target.value)}
                      className={inputCls}
                    >
                      <option value="" disabled>
                        Select one
                      </option>
                      {GAP_OPTIONS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Anything else to add? (optional)" htmlFor="details">
                    <textarea
                      id="details"
                      rows={4}
                      maxLength={5000}
                      placeholder="Current traffic sources, what you've already tried, or what success would look like."
                      value={details}
                      onChange={(e) => setDetails(e.target.value)}
                      className={cnResize}
                    />
                  </Field>
                  {/* Honeypot: hidden from real visitors, bots often fill every field */}
                  <div className="absolute -left-[9999px]" aria-hidden="true">
                    <label htmlFor="website">Leave this blank</label>
                    <input
                      id="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </div>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <Button type="submit" size="lg" className="w-full" disabled={sending}>
                    {sending ? "Sending…" : "Get my free roadmap"}
                    {!sending && <ArrowRight className="size-4" />}
                  </Button>
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

const inputCls =
  "h-13 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg/60 px-4 text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none";
const cnResize = `${inputCls} h-auto resize-none py-3.5`;

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="label mb-2 block text-muted">{label}</span>
      {children}
    </label>
  );
}
