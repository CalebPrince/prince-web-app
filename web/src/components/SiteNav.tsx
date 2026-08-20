"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { HeaderUtilityDock } from "@/components/HeaderUtilityDock";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV: { label: string; to: string }[] = [
  { label: "Services", to: "/services" },
  { label: "Builder OS", to: "/builder-os" },
  { label: "Systems", to: "/systems" },
  { label: "Pricing", to: "/pricing" },
  { label: "About", to: "/about" },
  { label: "Lab", to: "/lab" },
  { label: "Contact", to: "/contact" },
];

const CONTACT = "/contact";

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-500",
          scrolled
            ? "border-b border-hairline bg-bg/70 backdrop-blur-xl"
            : "border-b border-transparent",
        )}
      >
        <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-6 md:px-10">
          <div className="flex items-center gap-3">
            <Link href="/" className="transition-opacity hover:opacity-80">
              <Logo />
            </Link>
            <HeaderUtilityDock />
          </div>

          <nav className="hidden items-center gap-9 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.to}
                className="label inline-block origin-bottom text-text-2 transition-[color,transform] duration-300 ease-out hover:[transform:perspective(400px)_translateY(-2px)_rotateX(10deg)] hover:text-text motion-reduce:transition-none motion-reduce:hover:[transform:none]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            href={CONTACT}
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "hidden lg:inline-flex")}
          >
            Let&rsquo;s Build <ArrowRight className="size-3.5" />
          </Link>

          <button
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            className="text-text lg:hidden"
          >
            <Menu className="size-6" />
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      <div
        className={cn(
          "fixed inset-0 z-[60] flex flex-col bg-bg backdrop-blur-2xl transition-all duration-500 lg:hidden",
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b border-hairline px-6 py-5"
          style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
        >
          <Link href="/" onClick={() => setMenuOpen(false)} className="transition-opacity hover:opacity-80">
            <Logo />
          </Link>
          <button
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="grid size-10 place-items-center rounded-full border border-hairline text-text transition-colors hover:border-accent/60 hover:text-accent"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-y-auto px-6 py-4">
          {NAV.map((item, i) => (
            <Link
              key={item.label}
              href={item.to}
              onClick={() => setMenuOpen(false)}
              className="shrink-0 border-b border-hairline py-5 text-center text-4xl font-semibold tracking-tight text-text"
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div
          className="shrink-0 border-t border-hairline p-6"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <Link
            href={CONTACT}
            onClick={() => setMenuOpen(false)}
            className={cn(buttonVariants({ size: "lg" }), "w-full")}
          >
            Let&rsquo;s Build <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
