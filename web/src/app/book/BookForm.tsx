"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, Video } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { Button, buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// Booking page. Talks to the internal-availability endpoints:
//   GET  /api/v1/appointments/config        -> { enabled }
//   GET  /api/v1/appointments/availability  -> { slots: ["09:00", ...] }
//   POST /api/v1/appointments/book          -> { status: "booked" } | error
// The server owns the real lead/notice window and the quarterly intake gate;
// this widget only renders what those endpoints return.

const STEPS = [
  {
    no: "01",
    title: "I review your brief",
    body: "Your topic and context help me prepare before we meet, so no time is wasted.",
  },
  {
    no: "02",
    title: "We use the call to clarify",
    body: "We’ll cover goals, constraints, timing, and fit, and whether a small pilot is worth building.",
  },
  {
    no: "03",
    title: "You get a considered next step",
    body: "If a project makes sense, I’ll prepare a proposal for your review. No pressure either way.",
  },
];

function isoOffset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BookForm() {
  // null = still checking; false = endpoint says booking is off.
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  const minDate = isoOffset(0);
  const maxDate = isoOffset(60);

  useEffect(() => {
    api
      .appointmentConfig()
      .then((c) => setEnabled(c.enabled))
      .catch(() => setEnabled(false));

    // Deep links (e.g. from the clinic ROI calculator) can prefill context.
    const params = new URLSearchParams(window.location.search);
    setName(params.get("name") ?? "");
    setEmail(params.get("email") ?? "");
    setPhone(params.get("phone") ?? "");
    setTopic(params.get("topic") ?? "");
    const d = params.get("date");
    if (d && d >= isoOffset(0) && d <= isoOffset(60)) setDate(d);
  }, []);

  useEffect(() => {
    if (!date) {
      setSlots(null);
      return;
    }
    let active = true;
    setSlots(null);
    setSlotsError(null);
    setTime("");
    api
      .appointmentAvailability(date)
      .then((res) => {
        if (active) setSlots(res.slots);
      })
      .catch((err) => {
        if (active) {
          setSlots([]);
          setSlotsError(err instanceof Error ? err.message : "Could not load times, please try again.");
        }
      });
    return () => {
      active = false;
    };
  }, [date]);

  const prettyDate = date
    ? new Date(date + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) {
      setError("Please pick an available time.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      await api.bookAppointment({ name, email, phone, date, time, topic, website, attribution: {} });
      setBooked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      // A slot can be taken between load and submit — refresh the list so the
      // visitor can pick another without reloading.
      api
        .appointmentAvailability(date)
        .then((res) => setSlots(res.slots))
        .catch(() => {});
      setTime("");
    } finally {
      setSending(false);
    }
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
          {/* Left - what to expect */}
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

          {/* Right - scheduler */}
          <div className="lg:col-span-7">
            <Reveal>
              <div className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 md:p-10 glass">
                {enabled === null ? (
                  <p className="py-16 text-center text-text-2">Loading availability…</p>
                ) : enabled === false ? (
                  <div className="flex flex-col items-center py-14 text-center">
                    <h2 className="text-2xl font-bold tracking-tight">Booking is closed right now.</h2>
                    <p className="mt-3 max-w-sm text-text-2">
                      Send a message and I’ll reply to find a time that works.
                    </p>
                    <Link href="/contact" className={cn(buttonVariants({ variant: "secondary" }), "mt-8")}>
                      Send a message
                    </Link>
                  </div>
                ) : booked ? (
                  <div className="flex flex-col items-center py-16 text-center">
                    <span className="tilt-3d tilt-3d-tile grid size-14 place-items-center rounded-full bg-accent text-on-accent">
                      <Check className="icon-3d icon-3d-on-accent size-7" />
                    </span>
                    <h2 className="mt-6 text-2xl font-bold tracking-tight">You’re booked in.</h2>
                    <p className="mt-3 max-w-sm text-text-2">
                      {prettyDate} at {time}, a confirmation email is on its way. Bring one workflow
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
                        min={minDate}
                        max={maxDate}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="h-13 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg/60 px-4 text-text [color-scheme:dark] focus:border-accent/60 focus:outline-none"
                      />
                    </div>

                    {/* Times */}
                    <div>
                      <p className="label mb-3 text-muted">Available times</p>
                      {!date ? (
                        <p className="text-text-2">Pick a date to see available times.</p>
                      ) : slots === null ? (
                        <p className="text-text-2">Loading times…</p>
                      ) : slotsError ? (
                        <p className="text-text-2">{slotsError}</p>
                      ) : slots.length === 0 ? (
                        <p className="text-text-2">No times available that day, try another date.</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                          {slots.map((t) => (
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
                        <input
                          id="name"
                          required
                          maxLength={255}
                          placeholder="Your name"
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
                          placeholder="you@company.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Phone (optional)" htmlFor="phone">
                        <input
                          id="phone"
                          type="tel"
                          maxLength={30}
                          placeholder="+233…"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    <Field label="Which workflow should we review? (optional)" htmlFor="topic">
                      <textarea
                        id="topic"
                        rows={3}
                        maxLength={1000}
                        placeholder="The repetitive task that made you book this call."
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        className={cn(inputCls, "h-auto resize-none py-3.5")}
                      />
                    </Field>

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

                    {error && (
                      <p className="rounded border border-red-900/50 bg-red-900/10 p-4 text-sm text-red-400">
                        {error}
                      </p>
                    )}

                    <Button type="submit" size="lg" className="w-full" disabled={!date || !time || sending}>
                      {sending ? "Booking…" : "Confirm booking"}
                      <ArrowRight className="size-4" />
                    </Button>
                    {date && time && !sending && (
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
