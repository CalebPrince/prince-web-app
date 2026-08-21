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
 *  because the one we want has a hard size limit:
 *
 *  "reveal" — the footer is pinned to the viewport floor inside a stage of
 *  its own height, which clips it, so it holds still while the page slides
 *  up off it and uncovers it a strip at a time. Nothing here animates: the
 *  movement you see is the page leaving, its bottom edge cutting across the
 *  wordmark at the top of the footer the whole way down. The footer never
 *  paints outside its own space in the flow either, so the page needs nothing
 *  of it — no opaque cover, no stacking games. Structure and CSS:
 *  .footer-stage in globals.css.
 *
 *  "rise" — the fallback, for when the footer is taller than the viewport.
 *  Pinned to the floor, a footer that tall would have its top cropped with no
 *  way to scroll to it, so it scrolls normally and comes up out of the dark
 *  instead (see .footer-rise in globals.css). The footer's vertical rhythm is
 *  hitched to vh — the wordmark and the link band's padding — precisely to
 *  stay out of this case on a desktop: a maximised laptop window is only
 *  around 610px of CSS once the display is scaled, and fixed padding alone
 *  put the footer just over that. A phone lands here regardless; this footer
 *  runs well past a phone screen.
 *
 *  "static" — what everyone gets before the measure lands, and what visitors
 *  who ask for reduced motion keep.
 *
 *  The measure also publishes the two lengths the stage is built out of: the
 *  footer's own height and the viewport's. Both in pixels, and the viewport
 *  from innerHeight rather than 100vh, so the pin lands exactly on the floor
 *  on phones, where the two disagree by the height of the URL bar.
 */
function useFooterMotion() {
  const stageRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const [motion, setMotion] = useState<FooterMotion>("static");

  useEffect(() => {
    const stage = stageRef.current;
    const footer = footerRef.current;
    if (!stage || !footer) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    // offsetHeight is the in-flow height either way: the footer's height is
    // set by its own contents, and nothing the measure turns on resizes it,
    // so applying a result can never feed back into the next measure.
    const measure = () => {
      frame = 0;
      const height = footer.offsetHeight;
      const viewport = window.innerHeight;
      stage.style.setProperty("--footer-h", `${height}px`);
      stage.style.setProperty("--footer-vh", `${viewport}px`);
      if (reduceMotion.matches) return setMotion("static");
      setMotion(height <= viewport ? "reveal" : "rise");
    };
    // Both lengths get read in the same frame, so a resize can never leave
    // the pin sized against a window height from before it — mid-drag, the
    // observer fires on the footer's new height while innerHeight is still
    // the old one, and the pair would stay crossed until the next event.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(footer);
    window.addEventListener("resize", schedule);
    reduceMotion.addEventListener("change", schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      reduceMotion.removeEventListener("change", schedule);
    };
  }, []);

  return { stageRef, footerRef, motion };
}

export function SiteFooter() {
  /** The nav list runs down two columns before wrapping, the way the link
   *  blocks in the reference layout do, instead of one long single column. */
  const navRows = Math.ceil(NAV_LINKS.length / 2);
  const { stageRef, footerRef, motion } = useFooterMotion();

  return (
    // The three wrappers are always here and only take the stage classes once
    // the measure has run, so turning the reveal on and off is a class swap
    // rather than a change of shape around the footer.
    <div ref={stageRef} className={cn("relative", motion === "reveal" && "footer-stage")}>
      <div className={cn(motion === "reveal" && "footer-stage-track")}>
        <div className={cn(motion === "reveal" && "footer-stage-pin")}>
          <footer
            ref={footerRef}
            // Clip, not hidden, so the "rise" keeps its travel behind the top
            // rule: overflow-hidden would make the footer a scroll container
            // and the rise's view() timeline would resolve against it and
            // never run. bg-2, not bg: the footer has to be a different
            // surface from the page for the page to be seen coming off it.
            className="overflow-clip border-t border-hairline bg-bg-2"
          >
            <div
              className={cn(
                "mx-auto max-w-[1400px] px-6 md:px-10",
                motion === "rise" && "footer-rise"
              )}
            >
              {/* Oversized wordmark — the one deliberate scale jump in the page,
                  and what makes the footer read as a layer behind it: sitting at
                  the very top of the footer, it is what the page's bottom edge
                  cuts through for the whole reveal, so you watch the heading come
                  out from under the page. Bury it lower and the edge only ever
                  crosses padding, which is invisible. aria-hidden because the
                  header logo already announces the brand. */}
              <div
                className="overflow-hidden pt-[min(2rem,5vh)] md:pt-[min(2.5rem,5vh)]"
                aria-hidden="true"
              >
                <span className="block whitespace-nowrap text-[clamp(2.6rem,min(12.2vw,20vh),13rem)] font-extrabold leading-[0.82] tracking-[-0.045em] text-text">
                  Prince Caleb<span className="text-accent">.</span>
                </span>
              </div>

              {/* Link band */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-12 pt-[min(3rem,7.5vh)] pb-[min(4rem,9vh)] md:grid-cols-12 md:pt-[min(4rem,7.5vh)] md:pb-[min(5rem,9vh)]">
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
        </div>
      </div>
    </div>
  );
}
