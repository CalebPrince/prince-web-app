"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV: { label: string; to: string }[] = [
  { label: "Services", to: "/services" },
  { label: "Builder OS", to: "/builder-os" },
  { label: "Systems", to: "/systems" },
  { label: "Pricing", to: "/pricing" },
  { label: "About", to: "/about" },
  { label: "Lab", to: "/lab" },
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
          <Link href="/" className="transition-opacity hover:opacity-80">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-9 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.to}
                className="label text-text-2 transition-colors hover:text-text"
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
          "fixed inset-0 z-[60] flex flex-col bg-bg/95 backdrop-blur-2xl transition-all duration-500 lg:hidden",
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="flex h-20 items-center justify-between px-6">
          <Logo />
          <button aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <X className="size-6 text-text" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col justify-center gap-2 px-6">
          {NAV.map((item, i) => (
            <Link
              key={item.label}
              href={item.to}
              onClick={() => setMenuOpen(false)}
              className="border-b border-hairline py-5 text-4xl font-semibold tracking-tight text-text"
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-6">
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
