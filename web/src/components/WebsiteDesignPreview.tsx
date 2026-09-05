import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DeviceShowcase } from "@/components/DeviceShowcase";
import { cn } from "@/lib/utils";

/**
 * The hero's right-hand panel: a piece of website design doing the arguing,
 * shown on a laptop with its phone layout standing in front of it.
 *
 * It is a concept, and it says so on the frame. The business is invented and
 * its address sits on the reserved `.example` TLD (the same convention
 * lib/sample-projects-data.ts uses) so nothing here can be read as a real
 * client, a real site, or a claim about either.
 *
 * The page carries its own light palette on purpose: a screenshot of someone
 * else's website should not look like part of this one. And because it is
 * markup rather than a picture, the phone shows a genuine narrow-viewport
 * layout of the same page rather than a squeezed copy of the wide one.
 */
const NAV = ["Collections", "Studio", "Journal"];

const DETAILS = [
  { src: "/images/concept/detail-1.webp", label: "Walnut stool", price: "GHS 1,450" },
  { src: "/images/concept/detail-2.webp", label: "Rattan chair", price: "GHS 2,200" },
];

function ConceptPage({ variant }: { variant: "desktop" | "mobile" }) {
  const mobile = variant === "mobile";

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-[#faf7f2] text-[#2b2621]">
      {/* its own nav */}
      <div
        className={cn(
          "flex items-center justify-between border-b border-[#e6ded2]",
          mobile ? "px-2 py-1.5" : "px-3 py-2",
        )}
      >
        <span className={cn("font-semibold uppercase tracking-[0.18em]", mobile ? "text-[6px]" : "text-[8px]")}>
          Adaba
        </span>
        {mobile ? (
          <span className="flex flex-col gap-[2px]" aria-hidden="true">
            <span className="block h-[1px] w-[9px] bg-[#2b2621]" />
            <span className="block h-[1px] w-[9px] bg-[#2b2621]" />
          </span>
        ) : (
          <>
            <nav className="flex gap-3" aria-hidden="true">
              {NAV.map((item) => (
                <span key={item} className="text-[7px] text-[#6f6459]">
                  {item}
                </span>
              ))}
            </nav>
            <span className="rounded-full bg-[#2b2621] px-2 py-[3px] text-[6px] font-medium text-[#faf7f2]">
              Book a visit
            </span>
          </>
        )}
      </div>

      {/* hero */}
      <div className="relative shrink-0">
        <Image
          src="/images/concept/hero.webp"
          alt="Concept website hero: a sunlit living room furnished by the studio"
          width={1280}
          height={714}
          className={cn("w-full object-cover", mobile ? "h-[86px]" : "h-[104px]")}
          priority={!mobile}
        />
        <div
          className={cn(
            "absolute inset-0",
            mobile
              ? "bg-gradient-to-t from-[#1c1814]/85 via-[#1c1814]/35 to-transparent"
              : "bg-gradient-to-r from-[#1c1814]/75 via-[#1c1814]/30 to-transparent",
          )}
        />
        <div
          className={cn(
            "absolute inset-0 flex flex-col",
            mobile ? "justify-end p-2" : "justify-center px-3",
          )}
        >
          <p className={cn("uppercase tracking-[0.2em] text-white/70", mobile ? "text-[5px]" : "text-[6px]")}>
            Interiors studio, Accra
          </p>
          <p
            className={cn(
              "font-semibold leading-[1.15] text-white",
              mobile ? "mt-1 text-[10px]" : "mt-1 max-w-[62%] text-[13px]",
            )}
          >
            Rooms that feel finished, not decorated.
          </p>
          {!mobile && (
            <p className="mt-1.5 max-w-[58%] text-[7px] leading-relaxed text-white/75">
              Furniture made to measure in our Osu workshop, delivered and placed by the people who
              built it.
            </p>
          )}
          <span
            className={cn(
              "mt-2 w-fit rounded-full bg-[#faf7f2] font-semibold text-[#2b2621]",
              mobile ? "px-2 py-[3px] text-[5px]" : "px-2.5 py-1 text-[6px]",
            )}
          >
            See the collection
          </span>
        </div>
      </div>

      {/* the strip of page under the fold line, sized to fill the screen */}
      <div
        className={cn(
          "grid min-h-0 flex-1 gap-1.5 p-2",
          mobile ? "grid-cols-1" : "grid-cols-2 px-3 py-2.5",
        )}
      >
        {(mobile ? DETAILS.slice(0, 1) : DETAILS).map((item) => (
          <div key={item.label} className="flex min-h-0 flex-col overflow-hidden rounded bg-white">
            <Image
              src={item.src}
              alt=""
              width={560}
              height={560}
              className="min-h-0 w-full flex-1 object-cover"
            />
            <div className="flex shrink-0 items-baseline justify-between gap-1 px-1.5 py-1">
              <span className="truncate text-[6px] font-medium">{item.label}</span>
              <span className="shrink-0 text-[6px] text-[#8a7d70]">{item.price}</span>
            </div>
          </div>
        ))}
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center justify-between border-t border-[#e6ded2] text-[5px] text-[#8a7d70]",
          mobile ? "px-2 py-1" : "px-3 py-1.5 text-[6px]",
        )}
      >
        <span>Free delivery in Accra</span>
        {!mobile && <span>hello@adaba-interiors.example</span>}
      </div>
    </div>
  );
}

export function WebsiteDesignPreview() {
  return (
    <div className="rise relative" style={{ animationDelay: "0.4s" }}>
      <span className="absolute -top-3 left-5 z-10 rounded-full border border-hairline-strong bg-bg px-3 py-1 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-muted">
        Concept
      </span>

      {/* The same laptop and phone every card in the work gallery uses. */}
      <DeviceShowcase
        address="adaba-interiors.example"
        className="shadow-2xl"
        laptop={<ConceptPage variant="desktop" />}
        phone={<ConceptPage variant="mobile" />}
      />

      {/* ── What it is, said outside the frame ──────────────── */}
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
