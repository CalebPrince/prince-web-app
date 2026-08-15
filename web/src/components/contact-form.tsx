"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Ported from public/contact.html's inline scripts: progressive disclosure
// (name/email/submit stay collapsed until the visitor starts typing, or
// open immediately on a prefilled deep link), the honeypot field, and the
// exact post-submit success state (handoff-success checklist), all
// preserved verbatim.
export function ContactForm() {
  const searchParams = useSearchParams();
  const prefillName = searchParams.get("name") ?? "";
  const prefillEmail = searchParams.get("email") ?? "";
  const prefillMessage = searchParams.get("message") ?? "";
  const sourceProjectId = searchParams.get("project");

  const [message, setMessage] = React.useState(prefillMessage);
  const [name, setName] = React.useState(prefillName);
  const [email, setEmail] = React.useState(prefillEmail);
  const [website, setWebsite] = React.useState("");
  const [open, setOpen] = React.useState(!!(prefillName || prefillEmail || prefillMessage));
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [sent, setSent] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.submitInquiry({
        name,
        email,
        message,
        website,
        source_project_id: sourceProjectId ? Number(sourceProjectId) : null,
        attribution: {},
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-[620px]" role="status">
        <span className="mb-4 grid size-11 place-items-center rounded-full bg-heading text-[1.15rem] font-extrabold text-bg">✓</span>
        <p className="mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">Message received</p>
        <h3 className="mb-2 text-2xl font-bold text-heading">Thanks, I have what I need.</h3>
        <p className="text-ink-soft">Here&apos;s what happens from here:</p>
        <ol className="mt-6 grid gap-3">
          {[
            ["I review your brief", "I'll read the context and identify any open questions."],
            ["You get a personal reply", "I'll respond by email with next steps or a useful recommendation."],
            ["We decide the best route", "If it looks like a fit, we'll arrange a call and shape the scope together."],
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
    <form onSubmit={handleSubmit}>
      <div className="mb-3">
        <label htmlFor="message" className="mb-1 block font-semibold text-heading">
          Which workflow do you want to improve?
        </label>
        <textarea
          id="message"
          rows={5}
          required
          maxLength={5000}
          placeholder="What happens now, where work gets delayed or missed, and what a successful result should look like."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={() => message && setOpen(true)}
          onInput={() => setOpen(true)}
          className="w-full rounded-lg border border-line bg-bg px-4 py-3 text-ink outline-none focus:border-editorial-accent"
        />
      </div>

      {/* Progressive disclosure — collapsed (max-height:0) until `open` */}
      <div
        className={cn(
          "overflow-hidden opacity-0 invisible max-h-0 transition-[max-height,opacity,visibility] duration-[600ms]",
          open && "max-h-[560px] opacity-100 visible",
        )}
      >
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
        {error && <div className="mb-3 rounded-lg bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text">{error}</div>}
        <Button type="submit" variant="brand" size="pill" className="w-full" disabled={submitting}>
          {submitting ? "Sending…" : "Send message"}
        </Button>
      </div>

      {/* Honeypot — hidden from real visitors, bots often fill every field */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
    </form>
  );
}
