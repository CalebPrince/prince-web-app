import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * The hero's right-hand panel: one image of website design work, shown as
 * supplied.
 *
 * The picture is prepared outside the app (a device mockup, a photograph of
 * the work on a desk, whatever reads best) and lives at
 * `web/public/images/concept/showcase.webp`. Replacing that file is the
 * whole edit; nothing here crops it, frames it in fake browser chrome, or
 * decorates it.
 *
 * The one thing this component insists on is the "Concept" tag. The site it
 * shows is invented, and a visitor has to be able to tell that from a
 * client's real work at a glance.
 */
export function WebsiteDesignPreview() {
  return (
    <div className="rise relative" style={{ animationDelay: "0.4s" }}>
      <span className="absolute -top-3 left-5 z-10 rounded-full border border-hairline-strong bg-bg px-3 py-1 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-muted">
        Concept
      </span>

      <div className="overflow-hidden rounded-[18px] border border-hairline bg-bg-2 shadow-2xl">
        <Image
          src="/images/concept/showcase.webp"
          alt="A concept website design shown on a laptop and a phone"
          width={1400}
          height={939}
          className="h-auto w-full"
          priority
        />
      </div>

      <div className="mt-5 flex items-center justify-between gap-4 border-t border-hairline pt-4">
        <p className="text-sm leading-relaxed text-text-2">
          A concept build, designed and coded the same way a client project is.
        </p>
        <Link
          href="/website-design"
          className="label group inline-flex shrink-0 items-center gap-1.5 text-accent"
        >
          Website design
          <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
