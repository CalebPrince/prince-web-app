import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { Logo } from "@/components/Logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Maintenance() {
  return (
    <section className="flex min-h-screen items-center">
      <div className="mx-auto w-full max-w-xl px-6 text-center">
        <Reveal>
          <div className="flex justify-center opacity-80">
            <Logo />
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div className="mt-8 flex justify-center">
            <SectionLabel>Be right back</SectionLabel>
          </div>
        </Reveal>
        <Reveal delay={160}>
          <h1 className="mt-6 text-[clamp(1.8rem,4.5vw,2.8rem)] font-bold tracking-[-0.03em]">
            Down for a bit of maintenance.
          </h1>
        </Reveal>
        <Reveal delay={220}>
          <p className="mx-auto mt-5 max-w-md text-text-2">
            I&rsquo;m making some updates behind the scenes. The site will be back shortly, thanks
            for your patience.
          </p>
        </Reveal>
        <Reveal delay={280} className="mt-8">
          <a href="mailto:hello@princecaleb.dev" className={cn(buttonVariants({ variant: "secondary" }))}>
            Email me directly
          </a>
        </Reveal>
      </div>
    </section>
  );
}
