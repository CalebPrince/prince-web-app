"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

const GAP_OPTIONS = [
  "Not enough traffic hitting the site",
  "Traffic comes, but it doesn't convert",
  "Not sure what's working — I need tracking clarity",
  "All of the above / not sure yet",
];

// Ported from public/growth-roadmap.html's inline submit script — same
// /api/v1/inquiries endpoint and honeypot as ContactForm, with the
// growth-roadmap-specific fields folded into the message body.
export function RoadmapForm() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [siteUrl, setSiteUrl] = React.useState("");
  const [gap, setGap] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [sent, setSent] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const message = `Free Growth Roadmap request\nWebsite: ${siteUrl}\nBiggest gap: ${gap}` + (details ? `\n\nDetails: ${details}` : "");
    try {
      await api.submitInquiry({ name, email, message, website, source_project_id: null, attribution: {} });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-3xl border border-line bg-card p-10 max-md:p-6" role="status">
        <span className="mb-4 grid size-11 place-items-center rounded-full bg-heading text-[1.15rem] font-extrabold text-bg">✓</span>
        <p className="mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">Roadmap request received</p>
        <h3 className="mb-2 text-2xl font-bold text-heading">Thanks, I have what I need.</h3>
        <p className="text-ink-soft">Here&apos;s what happens from here:</p>
        <ol className="mt-6 grid gap-3">
          {[
            ["I look at your site", "I'll review your traffic, conversion, and tracking setup."],
            ["You get a personal reply", "I'll email you a clear roadmap of what's costing you the most."],
            ["We scope it, if it's a fit", "No pressure — you decide what to do with it."],
          ].map(([title, body], i) => (
            <li key={title} className="relative rounded-xl border border-line bg-card py-[0.9rem] pr-4 pl-[3.25rem]">
              <span className="absolute top-[0.9rem] left-4 grid size-[1.45rem] place-items-center rounded-full bg-bg-soft text-[0.72rem] font-extrabold text-heading">
                {i + 1}
              </span>
              <strong className="block text-heading">{title}</strong>
              <span className="mt-[0.15rem] block text-[0.88rem] text-editorial-muted">{body}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="reveal rounded-3xl border border-line bg-card p-10 max-md:p-6" id="roadmap-form">
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label htmlFor="name" className="mb-1 block font-semibold text-heading">
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            maxLength={255}
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg px-4 py-3 text-ink outline-none focus:border-editorial-accent"
          />
        </div>
        <div className="mb-3">
          <label htmlFor="email" className="mb-1 block font-semibold text-heading">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            maxLength={255}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg px-4 py-3 text-ink outline-none focus:border-editorial-accent"
          />
        </div>
        <div className="mb-3">
          <label htmlFor="site_url" className="mb-1 block font-semibold text-heading">
            Website URL
          </label>
          <input
            id="site_url"
            type="text"
            required
            maxLength={255}
            placeholder="yourbusiness.com"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg px-4 py-3 text-ink outline-none focus:border-editorial-accent"
          />
        </div>
        <div className="mb-3">
          <label htmlFor="gap" className="mb-1 block font-semibold text-heading">
            What&apos;s the biggest gap right now?
          </label>
          <select
            id="gap"
            required
            value={gap}
            onChange={(e) => setGap(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg px-4 py-3 text-ink outline-none focus:border-editorial-accent"
          >
            <option value="" disabled>
              Select one
            </option>
            {GAP_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-3">
          <label htmlFor="details" className="mb-1 block font-semibold text-heading">
            Anything else to add? (optional)
          </label>
          <textarea
            id="details"
            rows={4}
            maxLength={5000}
            placeholder="Current traffic sources, what you've already tried, or what success would look like."
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full rounded-lg border border-line bg-bg px-4 py-3 text-ink outline-none focus:border-editorial-accent"
          />
        </div>

        {/* Honeypot — hidden from real visitors, bots often fill every field */}
        <div className="absolute -left-[9999px]" aria-hidden="true">
          <label htmlFor="website">Leave this blank</label>
          <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>

        {error && <div className="mb-3 rounded-lg bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text">{error}</div>}
        <Button type="submit" variant="brand" size="pill" className="w-full" disabled={submitting}>
          {submitting ? "Sending…" : "Get my free roadmap"}
        </Button>
      </form>
    </div>
  );
}
