"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock, MapPin } from "lucide-react";
import type { IconType } from "react-icons";
import { FaWhatsapp, FaGithub, FaLinkedinIn, FaXTwitter } from "react-icons/fa6";
import { HiOutlineMail } from "react-icons/hi";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Contact page - real details from princecaleb.dev.
const EMAIL = "hello@princecaleb.dev";
const WHATSAPP_NUM = "+233 53 580 1359";
const WHATSAPP_URL = "https://wa.me/233535801359";

const METHODS: {
  label: string;
  value: string;
  href: string;
  icon: IconType;
  note: string;
}[] = [
  {
    label: "Email",
    value: EMAIL,
    href: `mailto:${EMAIL}`,
    icon: HiOutlineMail,
    note: "Best for detailed briefs and files.",
  },
  {
    label: "WhatsApp",
    value: WHATSAPP_NUM,
    href: WHATSAPP_URL,
    icon: FaWhatsapp,
    note: "Quickest for a fast back-and-forth.",
  },
];

const SOCIAL: { label: string; href: string; icon: IconType }[] = [
  { label: "GitHub", href: "https://github.com/CalebPrince", icon: FaGithub },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/caleb-akakpo-b7123a89/",
    icon: FaLinkedinIn,
  },
  { label: "X", href: "https://x.com/princecay77", icon: FaXTwitter },
];

const BUDGETS = ["< $2k", "$2k – $5k", "$5k – $15k", "$15k +", "Not sure yet"];

export default function Contact() {
  const [budget, setBudget] = useState<string>("");
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
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
            <SectionLabel>Contact</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 max-w-4xl text-[clamp(2.6rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
              Let&rsquo;s build
              <br />
              <span className="text-accent">something real.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              Tell me about an AI voice agent, WhatsApp assistant, automation, or a website or app
              you have in mind. I&rsquo;ll come back with a straight read on scope, cost and timeline
              &mdash; no obligation.
            </p>
          </Reveal>
          <Reveal delay={220} className="mt-8 flex flex-wrap items-center gap-6">
            <span className="inline-flex items-center gap-2 text-text-2">
              <Clock className="size-4 text-accent" /> Replies within 24 hours
            </span>
            <span className="inline-flex items-center gap-2 text-text-2">
              <MapPin className="size-4 text-accent" /> Accra, Ghana &middot; working worldwide
            </span>
          </Reveal>
        </div>
      </section>

      {/* ── MAIN GRID ───────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Left - direct methods */}
          <div className="lg:col-span-5">
            <Reveal>
              <SectionLabel index="01">Reach me directly</SectionLabel>
            </Reveal>
            <div className="mt-8 space-y-4">
              {METHODS.map(({ label, value, href, icon: Icon, note }, i) => (
                <Reveal key={label} delay={i * 80}>
                  <a
                    href={href}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={href.startsWith("http") ? "noreferrer" : undefined}
                    className="group flex items-center gap-5 rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-6 transition-colors hover:border-accent/40 glass"
                  >
                    <span className="tilt-3d tilt-3d-tile grid size-12 shrink-0 place-items-center rounded-[var(--radius)] border border-hairline bg-bg text-accent transition-colors group-hover:border-accent/40">
                      <Icon className="icon-3d size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="label text-muted">{label}</p>
                      <p className="mt-1 truncate text-lg font-semibold text-text transition-colors group-hover:text-accent">
                        {value}
                      </p>
                      <p className="mt-0.5 text-sm text-text-2">{note}</p>
                    </div>
                  </a>
                </Reveal>
              ))}
            </div>

            <Reveal delay={160} className="mt-8">
              <Link href="/book" className={cn(buttonVariants({ size: "lg" }), "group w-full")}>
                Book a 20-minute call
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <p className="mt-4 text-sm text-muted">
                Walk through what you&rsquo;re trying to build and get a straight read on scope, cost
                and timeline.
              </p>
            </Reveal>

            <Reveal delay={220} className="mt-10 border-t border-hairline pt-8">
              <p className="label text-muted">Elsewhere</p>
              <div className="mt-4 flex gap-3">
                {SOCIAL.map(({ label, href, icon: Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="tilt-3d tilt-3d-tile grid size-11 place-items-center rounded-full border border-hairline text-text-2 transition-all hover:border-accent/60 hover:text-accent hover:glow-green"
                  >
                    <Icon className="icon-3d size-[1.05rem]" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Right - form */}
          <div className="lg:col-span-7">
            <Reveal>
              <div className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 md:p-10 glass">
                {sent ? (
                  <div className="flex flex-col items-center py-16 text-center">
                    <span className="tilt-3d tilt-3d-tile grid size-14 place-items-center rounded-full bg-accent text-on-accent">
                      <Check className="icon-3d icon-3d-on-accent size-7" />
                    </span>
                    <h2 className="mt-6 text-2xl font-bold tracking-tight">Message sent.</h2>
                    <p className="mt-3 max-w-sm text-text-2">
                      Thanks for reaching out &mdash; I&rsquo;ll reply within 24 hours. Need
                      something faster? Ping me on WhatsApp.
                    </p>
                    <a
                      href={WHATSAPP_URL}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "secondary" }), "mt-8")}
                    >
                      <FaWhatsapp className="size-4" /> Message on WhatsApp
                    </a>
                  </div>
                ) : (
                  <form onSubmit={onSubmit} className="space-y-6">
                    <div className="grid gap-6 sm:grid-cols-2">
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
                    </div>

                    <Field label="What can I build for you?" htmlFor="project">
                      <input
                        id="project"
                        name="project"
                        placeholder="e.g. an AI voice agent for missed calls"
                        className={inputCls}
                      />
                    </Field>

                    <div>
                      <p className="label mb-3 text-muted">Budget</p>
                      <div className="flex flex-wrap gap-2.5">
                        {BUDGETS.map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setBudget(b)}
                            className={cn(
                              "rounded-full border px-4 py-2.5 text-sm transition-colors",
                              budget === b
                                ? "border-accent/60 bg-accent/10 text-accent"
                                : "border-hairline text-text-2 hover:border-hairline-strong hover:text-text",
                            )}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Field label="Tell me more" htmlFor="message">
                      <textarea
                        id="message"
                        name="message"
                        rows={5}
                        required
                        placeholder="A few lines on the problem, your timeline, and what success looks like."
                        className={cn(inputCls, "h-auto resize-none py-3.5")}
                      />
                    </Field>

                    <Button type="submit" size="lg" className="w-full">
                      Send message
                      <ArrowRight className="size-4" />
                    </Button>
                    <p className="text-center text-sm text-muted">
                      Prefer email? Write to{" "}
                      <a
                        href={`mailto:${EMAIL}`}
                        className="text-text-2 underline underline-offset-4 transition-colors hover:text-accent"
                      >
                        {EMAIL}
                      </a>
                    </p>
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
