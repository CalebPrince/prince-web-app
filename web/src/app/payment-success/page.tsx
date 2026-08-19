"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";

export default function PaymentSuccessPage() {
  const [source, setSource] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSource(params.get("source") || "");
    setReference(params.get("reference") || "");
  }, []);

  let message = "I will reach out shortly with the next steps.";
  if (source === "starter") {
    message = "Your AI Voice Agent Pilot deposit is confirmed. I will reach out shortly to map the first workflow.";
  } else if (source === "payment-link") {
    message = "Your invoice payment is confirmed. Thank you.";
  }

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-16 text-center md:px-10 md:pt-48 md:pb-20">
          <Reveal>
            <SectionLabel>Payment successful</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 text-[clamp(2.4rem,6.5vw,5.5rem)] font-extrabold leading-[0.96] tracking-[-0.03em]">
              Thank you. Your <span className="text-accent">payment</span> was received.
            </h1>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-[620px] px-6 pb-24 md:pb-32">
        <Reveal>
          <div className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 text-center md:p-12">
            <div className="mb-6 flex justify-center">
              <span className="grid size-16 place-items-center rounded-full bg-accent text-on-accent">
                <Check className="size-8" />
              </span>
            </div>
            
            <p className="mb-8 text-lg text-text-2">{message}</p>
            
            {reference && (
              <div className="mb-8 inline-block rounded border border-green-900/50 bg-green-900/10 px-4 py-2 text-sm text-green-400">
                Reference: <span className="font-mono">{reference}</span>
              </div>
            )}
            
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button asChild className="h-12 px-8">
                <Link href="/request">Start project details</Link>
              </Button>
              <Button asChild variant="outline" className="h-12 px-8">
                <Link href="/">Back to home</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
