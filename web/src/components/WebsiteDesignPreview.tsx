import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Lock, RotateCw, Search } from "lucide-react";

/**
 * The hero's right-hand panel: a piece of website design doing the arguing,
 * rendered as a browser window around a page that could ship tomorrow.
 *
 * It is a concept, and it says so on the frame. The business is invented and
 * its address sits on the reserved `.example` TLD (the same convention
 * lib/sample-projects-data.ts uses) so nothing here can be read as a real
 * client, a real site, or a claim about either.
 *
 * The page inside carries its own light palette on purpose: a screenshot of
 * someone else's website should not look like part of this one.
 */
const NAV = ["Collections", "Studio", "Journal"];

const DETAILS = [
  { src: "/images/concept/detail-1.webp", label: "Walnut stool", price: "GHS 1,450" },
  { src: "/images/concept/detail-2.webp", label: "Rattan chair", price: "GHS 2,200" },
];

export function WebsiteDesignPreview() {
  return (
    <div className="rise relative" style={{ animationDelay: "0.4s" }}>
      <span className="absolute -top-3 left-5 z-10 rounded-full border border-hairline-strong bg-bg px-3 py-1 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-muted">
        Concept
      </span>

      {/* ── Browser chrome ──────────────────────────────────── */}
      <div className="overflow-hidden rounded-[18px] border border-hairline-strong bg-bg-2 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-hairline bg-bg-3/70 px-3.5 py-2.5">
          <span className="flex shrink-0 gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </span>

          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-hairline bg-bg px-2.5 py-1">
            <Lock className="size-3 shrink-0 text-muted" aria-hidden="true" />
            <span className="truncate font-mono text-[10px] text-text-2">
              adaba-interiors.example
            </span>
          </div>

          <span className="hidden shrink-0 items-center gap-2 text-muted sm:flex" aria-hidden="true">
            <RotateCw className="size-3" />
            <Search className="size-3" />
          </span>
        </div>

        {/* ── The page ────────────────────────────────────────── */}
        <div className="bg-[#faf7f2] text-[#2b2621]">
          {/* its own nav */}
          <div className="flex items-center justify-between border-b border-[#e6ded2] px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              Adaba
            </span>
            <nav className="hidden gap-4 sm:flex" aria-hidden="true">
              {NAV.map((item) => (
                <span key={item} className="text-[10px] text-[#6f6459]">
                  {item}
                </span>
              ))}
            </nav>
            <span className="rounded-full bg-[#2b2621] px-2.5 py-1 text-[9px] font-medium text-[#faf7f2]">
              Book a visit
            </span>
          </div>

          {/* hero */}
          <div className="relative">
            <Image
              src="/images/concept/hero.webp"
              alt="Concept website hero: a sunlit living room furnished by the studio"
              width={1280}
              height={714}
              className="h-[168px] w-full object-cover sm:h-[196px]"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#1c1814]/75 via-[#1c1814]/35 to-transparent" />
            <div className="absolute inset-0 flex flex-col justify-center px-4 sm:px-6">
              <p className="text-[9px] uppercase tracking-[0.2em] text-white/70">
                Interiors studio, Accra
              </p>
              <p className="mt-1.5 max-w-[15rem] text-[17px] font-semibold leading-[1.15] text-white sm:text-[20px]">
                Rooms that feel finished, not decorated.
              </p>
              <p className="mt-2 hidden max-w-[16rem] text-[10px] leading-relaxed text-white/75 sm:block">
                Furniture made to measure in our Osu workshop, delivered and
                placed by the people who built it.
              </p>
              <span className="mt-3 w-fit rounded-full bg-[#faf7f2] px-3 py-1.5 text-[9px] font-semibold text-[#2b2621]">
                See the collection
              </span>
            </div>
          </div>

          {/* a strip of real page content under the fold line */}
          <div className="grid grid-cols-2 gap-2.5 px-4 py-3.5">
            {DETAILS.map((item) => (
              <div key={item.label} className="overflow-hidden rounded-md bg-white">
                <Image
                  src={item.src}
                  alt=""
                  width={560}
                  height={560}
                  className="h-[52px] w-full object-cover"
                />
                <div className="flex items-baseline justify-between gap-2 px-2 py-1.5">
                  <span className="truncate text-[9px] font-medium">{item.label}</span>
                  <span className="shrink-0 text-[9px] text-[#8a7d70]">{item.price}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-[#e6ded2] px-4 py-2 text-[9px] text-[#8a7d70]">
            <span>Free delivery in Accra</span>
            <span>hello@adaba-interiors.example</span>
          </div>
        </div>
      </div>

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
