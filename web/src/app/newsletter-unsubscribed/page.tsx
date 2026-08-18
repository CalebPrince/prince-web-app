import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NewsletterUnsubscribed() {
  return (
    <section className="flex min-h-[70vh] items-center pt-20">
      <div className="mx-auto w-full max-w-md px-6 text-center">
        <Reveal>
          <h1 className="text-[clamp(1.8rem,4.5vw,2.6rem)] font-bold tracking-[-0.03em]">
            You&rsquo;re unsubscribed.
          </h1>
        </Reveal>
        <Reveal delay={80}>
          <p className="mt-5 text-text-2">
            You won&rsquo;t receive any more newsletter emails. If that was a mistake, you can
            re-subscribe any time from the blog.
          </p>
        </Reveal>
        <Reveal delay={160} className="mt-8">
          <Link href="/archive" className={cn(buttonVariants({ size: "lg" }), "group")}>
            <ArrowLeft className="size-4 transition-transform duration-300 group-hover:-translate-x-1" />
            Back to the archive
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
