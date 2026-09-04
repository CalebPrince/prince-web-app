"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { HOME_SERVICES as SERVICES } from "@/lib/services";
import { DitherEdge } from "@/components/DitherEdge";

/** Screens of scroll each service is given while the section is pinned. Much
 *  below one and the halves are still moving when the next service is asked
 *  for; much above and the page reads as having stopped. */
const SCREENS_PER_ITEM = 1;

/**
 * What I build, told as a split screen: the pitch climbs the left half while
 * the spec panel falls down the right, so moving between services reads as
 * the two halves shearing past each other. It is the route curtain applied
 * inside one section — same shutter easing, same lit edge, same pixel dither
 * where a panel stops — so the site keeps one way of covering and uncovering
 * things rather than growing a second, unrelated one here.
 *
 * The copy is HOME_SERVICES in @/lib/services, alongside the packaged
 * offers the Services page sells.
 */
export function SplitServices() {
  const [active, setActive] = useState(0);
  const section = useRef<HTMLElement | null>(null);

  /** Which service the scroll position is sitting on. Read off the section's
   *  own rect rather than a running total, so it stays correct through
   *  resizes and anything else that moves the page under us. */
  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const el = section.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      if (travel <= 0) return;

      const progress = Math.min(1, Math.max(0, -rect.top / travel));
      // Clamped, so the last service keeps the screen for its own share
      // rather than flicking past at progress === 1.
      const index = Math.min(SERVICES.length - 1, Math.floor(progress * SERVICES.length));
      setActive((current) => (current === index ? current : index));
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  /** Snapping is armed only while the section is on screen: left on, it
   *  would tug at every other section of the page too. */
  useEffect(() => {
    const el = section.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        document.documentElement.classList.toggle("split-snapping", entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("split-snapping");
    };
  }, []);

  const stateOf = (i: number) => (i === active ? "active" : i < active ? "before" : "after");

  const stops = SERVICES.map((service, i) => (
    <span
      key={`stop-${service.id}`}
      className="split-stop"
      style={{ top: `${i * SCREENS_PER_ITEM * 100}vh` }}
      aria-hidden="true"
    />
  ));

  return (
    <section
      ref={section}
      className="split-showcase relative border-y border-hairline"
      style={{ height: `${(SERVICES.length * SCREENS_PER_ITEM + 1) * 100}vh` }}
    >
      {/* Snap stops, one per service. They are what stops a flick from
          carrying the visitor over a service without it ever having been on
          the screen — and they work climbing back up as well as coming
          down. Proximity rather than mandatory: the page can still be left,
          it just will not be left mid-service. */}
      {stops}

      <div className="sticky top-0 h-screen overflow-hidden">
        <div className="grid h-full grid-cols-1 grid-rows-[40vh_1fr] md:grid-cols-2 md:grid-rows-none">
          {/* ---- Left: the pitch, arriving from below ---- */}
          <div className="split-pane order-2 md:order-1">
            {SERVICES.map((service, i) => (
              <article
                key={service.id}
                className="split-slide split-slide--up"
                data-state={stateOf(i)}
              >
                <div className="flex h-full flex-col justify-center px-6 py-14 md:px-12 lg:px-20">
                  <span className="label text-accent">
                    {service.no} / {String(SERVICES.length).padStart(2, "0")}
                  </span>
                  <h3 className="mt-6 max-w-lg text-[clamp(1.9rem,3.6vw,3.4rem)] font-bold leading-[1.02] tracking-[-0.03em]">
                    {service.title}
                  </h3>
                  <p className="label mt-4 text-text-3">{service.tagline}</p>
                  <p className="mt-6 max-w-md leading-relaxed text-text-2 md:text-lg">
                    {service.body}
                  </p>

                  {/* The homepage presents the practice at a glance; the
                      Services page carries the full packaged detail. */}
                  <Link
                    href="/services"
                    className="label group mt-12 inline-flex w-fit items-center gap-2 border-b border-hairline pb-2 text-text-2 transition-colors hover:border-accent hover:text-text"
                    tabIndex={i === active ? undefined : -1}
                  >
                    See how it works
                    <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {/* ---- Right: the spec panel, arriving from above ---- */}
          <div className="split-pane order-1 md:order-2">
            {SERVICES.map((service, i) => (
                <div
                  key={service.id}
                  className="split-slide split-slide--down split-spec"
                  data-state={stateOf(i)}
                  aria-hidden="true"
                >
                  {/* The number, oversized and bled off the corner: it is
                      wallpaper for the panel, not a thing to be read. */}
                  <span className="split-spec-no">{service.no}</span>

                  <div className="relative flex h-full flex-col justify-center px-6 py-6 md:py-14 md:pl-20 md:pr-12 lg:pl-24 lg:pr-16">
                    <ul className="max-w-md border-t border-hairline">
                      {service.features.map((feature) => (
                        <li
                          key={feature.label}
                          className="border-b border-hairline py-3.5 text-text-2 md:py-5"
                        >
                          {feature.label}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <DitherEdge side="top" />
                  <DitherEdge side="bottom" />
                  <DitherEdge side="left" />
                </div>
            ))}
          </div>
        </div>

        {/* The seam. Lit like the curtain's leading edge, and the only thing in
            the section that does not move — both halves are measured off it. */}
        <div className="split-seam" aria-hidden="true" />

        {/* Where the visitor is in the set, as a row of shutters rather than
            dots: the same object as the curtain, laid on its side. */}
        <div className="split-rail" aria-hidden="true">
          {SERVICES.map((service, i) => (
            <span key={service.id} className="split-tick" data-on={i <= active ? "" : undefined} />
          ))}
        </div>
      </div>
    </section>
  );
}
