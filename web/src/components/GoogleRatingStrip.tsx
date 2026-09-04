import Image from "next/image";
import { ArrowUpRight, Star } from "lucide-react";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GoogleRatingStrip({
  rating,
  reviewCount,
  reviewUrl,
}: {
  rating: number;
  reviewCount: number;
  reviewUrl: string;
}) {
  return (
    <section aria-label="Google rating" className="border-b border-hairline bg-bg">
      <div className="mx-auto flex max-w-[1400px] justify-center px-6 py-8 md:px-10 md:py-10">
        <div className="flex w-full max-w-3xl flex-wrap items-center gap-4 rounded-[var(--radius)] border border-hairline bg-bg-2 p-4 sm:flex-nowrap sm:gap-6 sm:p-6">
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-white sm:size-20">
            <Image src="/img/logos/google.svg" alt="Google" width={36} height={36} className="size-8 sm:size-10" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[clamp(1.4rem,4vw,2.5rem)] font-bold leading-none tracking-[-0.035em] text-text">
              <span className="tabular-nums">
                <AnimatedCounter target={rating} decimals={1} duration={1.4} />
              </span>{" "}
              <span className="font-semibold text-text-2">Google Ratings</span>
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="flex items-center gap-1 text-accent" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
                {Array.from({ length: 5 }, (_, index) => (
                  <Star key={index} className="size-5 fill-current sm:size-6" strokeWidth={1.4} aria-hidden="true" />
                ))}
              </span>
              <span className="tabular-nums text-sm font-medium text-muted sm:text-base">
                (<AnimatedCounter target={reviewCount} duration={1.7} /> reviews)
              </span>
            </div>
          </div>

          <a
            href={reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "secondary" }), "w-full shrink-0 sm:w-auto")}
          >
            Leave a review
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
