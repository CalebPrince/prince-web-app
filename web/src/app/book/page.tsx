"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, Video } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Booking page — mirrors princecaleb.dev/book.html flow: pick a date,
// choose a time, confirm with a short brief.

const STEPS = [
  {
    no: "01",
    title: "I review your brief",
    body: "Your topic and context help me prepare before we meet, so no time is wasted.",
  },
  {
    no: "02",
    title: "We use the call to clarify",
    body: "We’ll cover goals, constraints, timing, and fit — and whether a small pilot is worth building.",
  },
  {
    no: "03",
    title: "You get a considered next step",
    body: "If a project makes sense, I’ll prepare a proposal for your review. No pressure either way.",
  },
];

// Weekday slots, 30-min cadence.
const SLOTS = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "13:00",
  "13:30",
  "14:00",
  "15:00",
  "15:30",
  "16:00",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Booking() {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [booked, setBooked] = useState(false);

  const isWeekend = useMemo(() => {
    if (!date) return false;
    const d = new Date(date + "T00:00:00");
    return d.getDay() === 0 || d.getDay() === 6;
  }, [date]);

  const times = isWeekend ? [] : SLOTS;

  const prettyDate = date
    ? new Date(date + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (date && time) setBooked(true);
  };

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-14 md:px-10 md:pt-48 md:pb-16">
          <Reveal>
            <SectionLabel>Book a call</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 max-w-4xl text-[clamp(2.4rem,6.5vw,5.5rem)] font-extrabold leading-[0.96] tracking-[-0.03em]">
              Bring one workflow
              <br />
              <span className="text-accent">that keeps repeating.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              We’ll map what happens now, what an agent could handle, when a person must take over,
              and whether a small pilot is worth building.
            </p>
          </Reveal>
          <Reveal delay={220} className="mt-8 flex flex-wrap items-center gap-6">
            <span className="inline-flex items-center gap-2 text-text-2">
              <Clock className="size-4 text-accent" /> 20 minutes
            </span>
            <span className="inline-flex items-center gap-2 text-text-2">
              <Video className="size-4 text-accent" /> Video or phone
            </span>
          </Reveal>
        </div>
      </section>

      {/* ── MAIN GRID ───────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Left — what to expect */}
          <div className="lg:col-span-5">
            <Reveal>
              <SectionLabel index="01">What to expect</SectionLabel>
            </Reveal>
            <div className="mt-8 space-y-8">
              {STEPS.map((s, i) => (
                <Reveal key={s.no} delay={i * 80} className="flex gap-5">
                  <span className="label mt-1 shrink-0 text-accent">{"//"} {s.no}</span>
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">{s.title}</h3>
                    <p className="mt-1.5 text-text-2">{s.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal delay={280} className="mt-10 border-t border-hairline pt-8">
              <p className="text-text-2">
                Prefer to write first?{" "}
                <Link
                  href="/contact"
                  className="text-text underline underline-offset-4 transition-colors hover:text-accent"
                >
                  Send a message instead
                </Link>{" "}
                and I’ll get back to you to find a time.
              </p>
            </Reveal>
          </div>

          {/* Right — scheduler */}
          <div className="lg:col-span-7">
            <Reveal>
              <div className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 md:p-10">
                {booked ? (
                  <div className="flex flex-col items-center py-16 text-center">
                    <span className="grid size-14 place-items-center rounded-full bg-accent text-on-accent">
                      <Check className="size-7" />
                    </span>
                    <h2 className="mt-6 text-2xl font-bold tracking-tight">You’re booked in.</h2>
                    <p className="mt-3 max-w-sm text-text-2">
                      {prettyDate} at {time} — a confirmation email is on its way. Bring one workflow
                      you’d like to review.
                    </p>
                    <Link href="/" className={cn(buttonVariants({ variant: "secondary" }), "mt-8")}>
                      Back to home
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={onSubmit} className="space-y-8">
                    {/* Date */}
                    <div>
                      <label htmlFor="date" className="label mb-3 block text-muted">
                        Pick a date
                      </label>
                      <input
                        id="date"
                        type="date"
                        required
                        min={todayISO()}
                        value={date}
                        onChange={(e) => {
                          setDate(e.target.value);
                          setTime("");
                        }}
                        className="h-13 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg/60 px-4 text-text [color-scheme:dark] focus:border-accent/60 focus:outline-none"
                      />
                    </div>

                    {/* Times */}
                    <div>
                      <p className="label mb-3 text-muted">Available times</p>
                      {!date ? (
                        <p className="text-text-2">Pick a date to see available times.</p>
                      ) : times.length === 0 ? (
                        <p className="text-text-2">No times available that day, try another date.</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                          {times.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setTime(t)}
                              className={cn(
                                "rounded-[var(--radius)] border py-2.5 text-sm transition-colors",
                                time === t
                                  ? "border-accent/60 bg-accent/10 text-accent"
                                  : "border-hairline text-text-2 hover:border-hairline-strong hover:text-text",
                              )}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="grid gap-6 border-t border-hairline pt-8 sm:grid-cols-2">
                      <Field label="Name" htmlFor="name">
                        <input id="name" name="name" required placeholder="Your name" className={inputCls} />
                      </Field>
                      <Field label="Email" htmlFor="email">
                        <input
                          id="email"
                          name="email"
                          type="email"
                          required
                          placeholder="you@company.com"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Phone (optional)" htmlFor="phone">
                        <input id="phone" name="phone" type="tel" placeholder="+233…" className={inputCls} />
                      </Field>
                      <Field label="Website (optional)" htmlFor="website">
                        <input id="website" name="website" placeholder="yoursite.com" className={inputCls} />
                      </Field>
                    </div>

                    <Field label="Which workflow should we review? (optional)" htmlFor="workflow">
                      <textarea
                        id="workflow"
                        name="workflow"
                        rows={3}
                        placeholder="The repetitive task that made you book this call."
                        className={cn(inputCls, "h-auto resize-none py-3.5")}
                      />
                    </Field>

                    <Button type="submit" size="lg" className="w-full" disabled={!date || !time}>
                      Confirm booking
                      <ArrowRight className="size-4" />
                    </Button>
                    {date && time && (
                      <p className="text-center text-sm text-muted">
                        {prettyDate} at {time}
                      </p>
                    )}
                  </form>
                )}
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}

const inputCls =
  "h-13 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg/60 px-4 text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="label mb-2 block text-muted">{label}</span>
      {children}
    </label>
  );
}
