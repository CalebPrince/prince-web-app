import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Page Not Found",
  description: "This page doesn't exist, but the rest of the site does.",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
      </div>
      <div className="mx-auto w-full max-w-[1400px] px-6 text-center md:px-10">
        <Reveal>
          <div className="flex justify-center">
            <SectionLabel>404</SectionLabel>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="mx-auto mt-8 max-w-2xl text-[clamp(2.4rem,6.5vw,5.5rem)] font-extrabold leading-[0.96] tracking-[-0.03em]">
            This page went missing.
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-text-2">
            The page you&rsquo;re looking for doesn&rsquo;t exist, may have moved, or the link might
            be broken. Everything else on the site is still right where it should be.
          </p>
        </Reveal>
        <Reveal delay={240} className="mt-10 flex flex-wrap justify-center gap-4">
          <Link href="/" className={cn(buttonVariants({ size: "lg" }), "group")}>
            Back to home
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <Link href="/systems" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
            View my work
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
