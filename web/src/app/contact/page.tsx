import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Prince Caleb about an AI voice agent, WhatsApp assistant, or business automation workflow.",
};

export default function ContactPage() {
  return (
    <main>
      <header className="border-b border-line bg-bg pt-40 pb-16 md:pt-44">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Contact</p>
          <h1 className="mb-3 max-w-4xl text-5xl font-bold md:text-6xl">
            What should <span className="text-editorial-accent-strong">stop</span> depending on a person?
          </h1>
          <p className="max-w-[60ch] text-lg leading-[1.65] text-ink-soft">
            Describe the call, message, follow-up, or repetitive task. I&apos;ll review where an agent should act,
            where a person should stay in control, and the smallest useful place to start.
          </p>
        </div>
      </header>

      <section className="py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-[7fr_5fr]">
          <div className="relative rounded-[24px] border border-line bg-card p-10 max-md:p-6">
            <Suspense fallback={null}>
              <ContactForm />
            </Suspense>
          </div>

          <div className="rounded-[24px] border border-line bg-card p-10 max-md:p-6">
            <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Direct channels</span>

            <div className="group border-b border-line py-[0.85rem]">
              <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-editorial-muted">WhatsApp</span>
              <span className="flex items-baseline gap-2">
                <a
                  href="https://wa.me/233535801359"
                  target="_blank"
                  rel="noopener"
                  className="text-[clamp(1.2rem,2vw,1.45rem)] font-bold tracking-[-0.015em] text-heading no-underline hover:text-heading hover:opacity-65"
                >
                  +233 53 580 1359
                  <small className="mt-[0.2rem] block text-[0.7rem] font-medium text-editorial-muted">Message Lisa, available 24/7</small>
                </a>
                <span className="inline-block text-editorial-muted transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                  →
                </span>
              </span>
            </div>

            <div className="group border-b border-line py-[0.85rem]">
              <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-editorial-muted">Email</span>
              <span className="flex items-baseline gap-2">
                <a
                  href="mailto:hello@princecaleb.dev"
                  className="text-[clamp(1.2rem,2vw,1.45rem)] font-bold tracking-[-0.015em] text-heading no-underline hover:text-heading hover:opacity-65"
                >
                  hello@princecaleb.dev
                </a>
                <span className="inline-block text-editorial-muted transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                  →
                </span>
              </span>
            </div>

            <div className="flex justify-between gap-4 border-t border-line py-[0.9rem]">
              <strong className="text-[0.9rem] text-heading">Location</strong>
              <span className="text-right text-[0.86rem] text-ink-soft">Accra, Ghana</span>
            </div>

            <p className="mb-3 mt-4 text-sm text-ink-soft">Prefer to talk it through live?</p>
            <Button variant="brand-outline" size="pill" className="w-full text-center" nativeButton={false} render={<Link href="/book" />}>
              Book a call
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
