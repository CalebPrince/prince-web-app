import Image from "next/image";
import { ArrowUpRight, Star } from "lucide-react";
import type { GoogleReview } from "@/lib/api";
import { cn } from "@/lib/utils";

export function GoogleReviewCard({ review, className }: { review: GoogleReview; className?: string }) {
  return (
    <article className={cn("flex h-full flex-col rounded-[var(--radius)] border border-hairline bg-bg-2/40 p-6 transition-colors hover:border-accent/30 glass", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {review.authorPhotoUri ? (
            <img src={review.authorPhotoUri} alt="" className="size-10 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-bg-3 text-sm font-bold text-text-2">{review.authorName.slice(0, 1)}</span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-text">{review.authorName}</p>
            <p className="mt-0.5 text-xs text-muted">{review.relativeTime}</p>
          </div>
        </div>
        <Image src="/img/logos/google.svg" alt="Google" width={24} height={24} className="size-6 shrink-0" />
      </div>
      <div className="mt-5 flex gap-0.5 text-accent" aria-label={`${review.rating} out of 5 stars`}>
        {Array.from({ length: 5 }, (_, index) => (
          <Star key={index} className={cn("size-4", index < review.rating ? "fill-current" : "opacity-25")} aria-hidden="true" />
        ))}
      </div>
      {review.text && <p className="mt-4 flex-1 leading-relaxed text-text-2">&ldquo;{review.text}&rdquo;</p>}
      {review.googleMapsUri && (
        <a href={review.googleMapsUri} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1.5 border-t border-hairline pt-4 text-sm font-semibold text-accent hover:text-accent-strong">
          Read on Google <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      )}
    </article>
  );
}
