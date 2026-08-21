"use client";

import { useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { FaGithub, FaLinkedinIn, FaYoutube, FaXTwitter } from "react-icons/fa6";
import Link from "next/link";
import { cn } from "@/lib/utils";

const NAV_LINKS: { label: string; to: string }[] = [
  { label: "Services", to: "/services" },
  { label: "Builder OS", to: "/builder-os" },
  { label: "Systems", to: "/systems" },
  { label: "Pricing", to: "/pricing" },
  { label: "Lisa", to: "/lisa-ai-assistant" },
  { label: "About", to: "/about" },
  { label: "Lab", to: "/lab" },
  { label: "Archive", to: "/archive" },
  { label: "Testimonials", to: "/testimonials" },
  { label: "Contact", to: "/contact" },
];

const RESOURCE_LINKS: { label: string; to: string }[] = [
  { label: "AI adoption ladder", to: "/ai-adoption-ladder" },
  { label: "AI trust & safety", to: "/ai-safety" },
  { label: "Search", to: "/search" },
];

const LEGAL_LINKS: { label: string; to: string }[] = [
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
  { label: "Cookies", to: "/cookies" },
];

const SOCIAL: { label: string; href: string; icon: IconType }[] = [
  { label: "GitHub", href: "https://github.com/CalebPrince/prince-web-app", icon: FaGithub },
  { label: "LinkedIn", href: "https://linkedin.com", icon: FaLinkedinIn },
  { label: "YouTube", href: "https://youtube.com", icon: FaYoutube },
  { label: "Twitter", href: "https://x.com", icon: FaXTwitter },
];

const LINK_CLASS =
  "inline-block origin-bottom text-[15px] leading-none text-text-2 transition-[color,transform] duration-300 ease-out hover:text-accent hover:[transform:perspective(400px)_translateY(-2px)_rotateX(10deg)] motion-reduce:transition-none motion-reduce:hover:[transform:none]";

function FooterColumn({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="label mb-6 text-text-3">{label}</p>
      {children}
    </div>
  );
}

type FooterMotion = "static" | "reveal" | "rise";

/** How the footer arrives on screen. Two mechanisms, picked by measurement,
 *  because the good one has a hard size limit:
 *
 *  "reveal" — the footer parks on the viewport floor and the (opaque) page
 *  above scrolls away off it, so it reads as rising out from beneath the page
 *  rather than arriving with the scroll. `sticky bottom-0` alone does that:
 *  the last in-flow block gets pulled up onto the viewport floor and only
 *  settles into its natural position at the very end of the document. The
 *  negative z-index puts it behind the page body (see MarketingUIWrapper,
 *  which supplies the opaque cover) — negative rather than raising the
 *  content, because raising it would open a stacking context around every
 *  page and trap in-page overlays under the nav.
 *
 *  "rise" — the fallback, for when the footer is taller than the viewport.
 *  Pinned to the viewport floor, a footer that tall would have its top
 *  cropped with no way to scroll to it, so instead its contents slide up from
 *  under its own top rule as it scrolls in (see .footer-rise in globals.css).
 *  Same read, no size limit. That is the phone case: this footer runs well
 *  past a phone screen.
 *
 *  "static" — what everyone gets before the measure lands, and what visitors
 *  who ask for reduced motion keep.
 */
function useFooterMotion() {
  const ref = useRef<HTMLElement>(null);
  const [motion, setMotion] = useState<FooterMotion>("static");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // offsetHeight is the in-flow height either way: neither sticky nor the
    // rise animation resizes the element, so applying the result of a measure
    // can never feed back into the next one.
    const measure = () => {
      if (reduceMotion.matches) return setMotion("static");
      setMotion(el.offsetHeight <= window.innerHeight ? "reveal" : "rise");
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    reduceMotion.addEventListener("change", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      reduceMotion.removeEventListener("change", measure);
    };
  }, []);

  return { ref, motion };
}

/** Publishes how far the reveal has got, 0 to 1, as --footer-reveal on the
 *  footer, for the depth cues in .footer-reveal-inner to read.
 *
 *  Uncovering a pinned footer is, on its own, almost invisible here: page and
 *  footer are the same colour and the top of the footer is padding, so the
 *  page slides off it with nothing to see. What sells it is the footer
 *  reacting to being uncovered — lifting, settling to full size, coming up
 *  out of the dark — and that needs the progress of the reveal as a number.
 *
 *  Which is a document measure, not an element one: a pinned footer does not
 *  move, so its own rect says nothing. The scroll still to go is exactly how
 *  much of the footer is still covered.
 */
function useRevealProgress(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const height = el.offsetHeight;
      if (!height) return;
      const remaining =
        document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      // Settles a little before the very last pixel of scroll, so the reveal
      // reads as finished rather than as still moving when the page stops.
      const progress = Math.min(1, Math.max(0, (1 - remaining / height) / 0.85));
      el.style.setProperty("--footer-reveal", progress.toFixed(4));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      el.style.removeProperty("--footer-reveal");
    };
  }, [ref, active]);
}

export function SiteFooter() {
  /** The nav list runs down two columns before wrapping, the way the link
   *  blocks in the reference layout do, instead of one long single column. */
  const navRows = Math.ceil(NAV_LINKS.length / 2);
  const { ref, motion } = useFooterMotion();
  useRevealProgress(ref, motion === "reveal");

  return (
    <footer
      ref={ref}
      className={cn(
        // Clip, not hidden, so the "rise" keeps its travel behind the top
        // rule: overflow-hidden would make the footer a scroll container and
        // the rise's view() timeline would resolve against it and never run.
        // bg-2, not bg: the footer has to be a different surface from the
        // page for the page to be seen coming off it at all.
        "overflow-clip border-t border-hairline bg-bg-2",
        motion === "reveal" && "sticky bottom-0 -z-10"
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-[1400px] px-6 md:px-10",
          motion === "reveal" && "footer-reveal-inner",
          motion === "rise" && "footer-rise"
        )}
      >
        {/* Link band */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 py-16 md:grid-cols-12 md:py-20">
          <FooterColumn label="Navigate" className="col-span-2 md:col-span-5">
            <ul
              className="grid grid-flow-col gap-x-10 gap-y-[18px]"
              style={{ gridTemplateRows: `repeat(${navRows}, auto)` }}
            >
              {NAV_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.to} className={LINK_CLASS}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterColumn>

          <FooterColumn label="Resources" className="md:col-span-3">
            <ul className="space-y-[18px]">
              {RESOURCE_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.to} className={LINK_CLASS}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterColumn>

          <FooterColumn label="Legal" className="md:col-span-2">
            <ul className="space-y-[18px]">
              {LEGAL_LINKS.map((l) => (
                <li key={l.label}>
                  <Link href={l.to} className={LINK_CLASS}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </FooterColumn>

          <FooterColumn label="Connect" className="md:col-span-2">
            <ul className="space-y-[18px]">
              {SOCIAL.map(({ label, href, icon: Icon }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={`${LINK_CLASS} inline-flex items-center gap-2.5`}
                  >
                    <Icon className="size-[1.05rem] shrink-0" aria-hidden="true" />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </FooterColumn>
        </div>

        {/* Oversized wordmark — the one deliberate scale jump in the page.
            aria-hidden because the header logo already announces the brand. */}
        <div className="overflow-hidden pb-6" aria-hidden="true">
          <span className="block whitespace-nowrap text-[clamp(2.6rem,12.2vw,13rem)] font-extrabold leading-[0.82] tracking-[-0.045em] text-text">
            Prince Caleb<span className="text-accent">.</span>
          </span>
        </div>

        {/* Bottom bar. The extra bottom padding on small screens keeps this
            clear of the floating chat widget, which sits bottom-left. */}
        <div className="flex flex-col gap-6 border-t border-hairline pt-8 pb-28 md:flex-row md:items-center md:justify-between md:pb-8">
          <span className="text-sm text-text-3">
            &copy; 2026 PrinceCaleb.dev. All rights reserved
          </span>

          <a
            href="https://github.com/CalebPrince/prince-web-app"
            target="_blank"
            rel="noreferrer"
            className="inline-flex origin-bottom items-center gap-2 text-sm text-text-3 transition-[color,transform] duration-300 ease-out hover:[transform:perspective(400px)_translateY(-2px)_rotateX(10deg)] hover:text-accent motion-reduce:transition-none motion-reduce:hover:[transform:none]"
          >
            <FaGithub className="size-4" aria-hidden="true" />
            View source
          </a>

          <span className="label text-text-3">Built for what&rsquo;s next</span>
        </div>
      </div>
    </footer>
  );
}
