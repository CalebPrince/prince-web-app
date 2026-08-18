"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, ShieldCheck, User, ArrowRight, ChevronDown } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchPopup } from "@/components/search-popup";
import { Button } from "@/components/ui/button";
import { api, platformOf, type BlogPost, type Project } from "@/lib/api";
import { cn } from "@/lib/utils";

const PRIMARY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/builder-os", label: "Builder OS" },
  { href: "/projects", label: "Systems" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

// Hand-rolled port of public/css/app.css's .site-nav system (+ the
// nav-dropdowns.js mega-panel behavior and mobile-nav.js drawer). Every
// class here maps 1:1 to an original selector — see the comment above each
// section. Deliberately not built on shadcn's NavigationMenu/Sheet: this
// design predates any component library, so a direct port is both more
// faithful and simpler than overriding another library's defaults.
export function SiteNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isActive = (href: string) => pathname === href;

  const [scrolled, setScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [activeMega, setActiveMega] = React.useState<"about" | "services" | "projects" | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  React.useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  function openMega(id: "about" | "services" | "projects") {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setActiveMega(id);
  }
  function scheduleCloseMega() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setActiveMega(null), 160);
  }

  // On the homepage the nav starts transparent over the hero and only
  // becomes the solid blurred bar once scrolled — matches .home-page
  // .site-nav / .is-on-hero / .is-scrolled in app.css. Everywhere else it's
  // always the solid bar.
  const solid = !isHome || scrolled;

  return (
    <>
    <header
      className={cn(
        "z-[1000] border-b transition-[background-color,border-color,box-shadow] duration-300",
        isHome ? "fixed inset-x-0 top-0" : "sticky top-0",
        solid
          ? "border-line bg-nav backdrop-blur-[16px]"
          : "border-transparent bg-transparent backdrop-blur-none",
        isHome && solid && "shadow-[0_10px_32px_rgba(10,11,13,0.08)]",
      )}
      onMouseLeave={scheduleCloseMega}
    >
      <div
        className={cn(
          "relative mx-auto flex min-h-[72px] max-w-6xl items-center justify-between gap-2 px-4 sm:px-6 max-md:min-h-16",
          isHome && !solid && "text-[color-mix(in_srgb,var(--heading-color)_86%,#20312a)] [text-shadow:0_1px_10px_rgba(255,255,255,0.35)]",
        )}
      >
        <Link href="/" className="brand-logo inline-flex items-center gap-2 text-[1.1rem] font-bold tracking-[-0.02em] text-heading">
          <span
            aria-hidden="true"
            className="flex size-[2.15em] shrink-0 items-center justify-center rounded-[0.55em] bg-heading text-[0.78em] font-extrabold leading-none text-bg transition-[transform,border-radius] duration-300 [.brand-logo:hover_&]:rotate-[-8deg] [.brand-logo:hover_&]:rounded-full"
          >
            P
          </span>
          <span className="whitespace-nowrap">
            Prince Caleb<span className="text-editorial-accent">.</span>
          </span>
        </Link>

        <UtilityDock showClientLogin={isHome} />

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
          className={cn(
            "nav-toggle inline-flex items-center justify-center rounded-[10px] border border-line p-[0.55rem_0.7rem] text-ink transition-colors hover:border-editorial-accent hover:text-editorial-accent md:hidden",
          )}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="block size-[26px]" aria-hidden="true">
            <line className="nav-toggle-line" x1="3" y1="6" x2="21" y2="6" />
            <line className="nav-toggle-line" x1="3" y1="12" x2="21" y2="12" />
            <line className="nav-toggle-line" x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Desktop links + mega panels */}
        <nav className="hidden items-center gap-1 md:flex">
          <MegaTrigger id="about" active={activeMega === "about"} onOpen={openMega} onClose={scheduleCloseMega}>
            About
          </MegaTrigger>
          <MegaTrigger id="services" active={activeMega === "services"} onOpen={openMega} onClose={scheduleCloseMega}>
            Services
          </MegaTrigger>
          <NavLink href="/builder-os" active={isActive("/builder-os")}>
            Builder OS
          </NavLink>
          <MegaTrigger id="projects" active={activeMega === "projects"} onOpen={openMega} onClose={scheduleCloseMega}>
            Systems
          </MegaTrigger>
          <NavLink href="/pricing" active={isActive("/pricing")}>
            Pricing
          </NavLink>
          <NavLink href="/contact" active={isActive("/contact")}>
            Contact
          </NavLink>
        </nav>

        <Button variant="brand" size="pill-sm" className="hidden md:inline-flex" nativeButton={false} render={<a href="/book.html" />}>
          Book a call
        </Button>
      </div>

      {/* Mega panels */}
      <MegaPanel open={activeMega === "about"} onOpen={() => openMega("about")} onClose={scheduleCloseMega}>
        <AboutPanel />
      </MegaPanel>
      <MegaPanel open={activeMega === "services"} onOpen={() => openMega("services")} onClose={scheduleCloseMega}>
        <ServicesPanel />
      </MegaPanel>
      <MegaPanel open={activeMega === "projects"} onOpen={() => openMega("projects")} onClose={scheduleCloseMega}>
        <ProjectsPanel />
      </MegaPanel>
    </header>

    {/*
      Rendered outside <header> deliberately: the header gets a
      backdrop-blur (backdrop-filter) class whenever it's solid, and
      backdrop-filter establishes a new containing block for fixed/absolute
      descendants (same as filter/transform). A fixed-position drawer nested
      inside would get pinned to the header's own ~70px box instead of the
      viewport, collapsing it to a sliver on every page but the transparent
      unscrolled homepage hero.
    */}
    <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group relative px-4 py-2 text-sm font-medium text-editorial-accent transition-colors"
    >
      {children}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-4 bottom-[0.3rem] h-px origin-right scale-x-0 bg-current transition-transform duration-300 ease-out group-hover:origin-left group-hover:scale-x-100",
          active && "origin-left scale-x-100",
        )}
      />
    </Link>
  );
}

function MegaTrigger({
  id,
  active,
  onOpen,
  onClose,
  children,
}: {
  id: "about" | "services" | "projects";
  active: boolean;
  onOpen: (id: "about" | "services" | "projects") => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseEnter={() => onOpen(id)}
      onFocus={() => onOpen(id)}
      onMouseLeave={onClose}
      aria-expanded={active}
      aria-haspopup="true"
      className="group relative inline-flex items-center gap-[0.3rem] px-4 py-2 text-sm font-medium text-editorial-accent transition-colors"
    >
      {children}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={cn("size-3 transition-transform duration-300", active && "rotate-180")}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

function MegaPanel({
  open,
  onOpen,
  onClose,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
      className={cn(
        "absolute inset-x-0 top-full hidden border-b border-line bg-bg shadow-lg transition-[opacity,transform] duration-300 md:block",
        open ? "visible translate-y-0 opacity-100" : "invisible pointer-events-none -translate-y-2 opacity-0",
      )}
    >
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_1.4fr_1.1fr] gap-12 px-6 pb-11 pt-10">{children}</div>
    </div>
  );
}

function MegaCol({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-[1.1rem] text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-editorial-muted">{label}</p>
      {children}
    </div>
  );
}

// href pointing at a not-yet-migrated PHP page (.html) must be a plain
// anchor, not next/link's Link — Link prefetches + soft-navigates any
// same-origin href as if it were an app route, which 404s for a route
// that only exists as a static PHP file.
function MegaLink({ href, meta, children }: { href: string; meta?: string; children: React.ReactNode }) {
  const className = "flex items-baseline justify-between gap-4 border-b border-line py-[0.55rem] font-medium text-ink-soft transition-[color,padding-left] duration-300 hover:pl-[0.4rem] hover:text-heading";
  const content = (
    <>
      <span>{children}</span>
      {meta ? <span className="text-[0.72rem] tabular-nums text-editorial-muted">{meta}</span> : null}
    </>
  );
  return href.endsWith(".html") ? (
    <a href={href} className={className}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function MegaFeatured({ href, title, description, cta }: { href: string; title: string; description: string; cta: string }) {
  const className = "group flex flex-col gap-[0.6rem] rounded-[var(--radius)] border border-line bg-bg-soft p-[1.4rem] text-ink-soft transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-line-strong";
  const content = (
    <>
      <strong className="text-[1.05rem] tracking-[-0.01em] text-heading">{title}</strong>
      <span className="text-[0.88rem] leading-[1.55] line-clamp-3">{description}</span>
      <span className="mt-[0.2rem] inline-flex items-center gap-1 text-[0.85rem] font-semibold text-heading">
        {cta} <ArrowRight className="size-3 transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true" />
      </span>
    </>
  );
  return href.endsWith(".html") ? (
    <a href={href} className={className}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

// Ported from public/css/app.css's .utility-dock/.utility-tab/.utility-tray
// + public/js/utility-dock.js: a small tab hangs off the nav's top edge and
// drops a tray of the theme/search/login icons, click-toggled with
// click-outside and Escape to close.
function UtilityDock({ showClientLogin }: { showClientLogin: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const dockRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!dockRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={dockRef} className="relative self-start">
      <button
        type="button"
        aria-label="Quick actions"
        aria-expanded={open}
        aria-controls="utility-tray"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center justify-center rounded-b-[10px] border border-t-0 border-line p-[0.3rem_1.1rem_0.45rem] text-[0.7rem] leading-none text-ink transition-colors",
          open && "border-editorial-accent text-editorial-accent",
          !open && "hover:border-editorial-accent hover:text-editorial-accent",
        )}
      >
        <ChevronDown className="size-[14px]" aria-hidden="true" />
      </button>
      <div
        id="utility-tray"
        className={cn(
          "absolute left-1/2 top-[calc(100%+0.4rem)] z-[1001] flex -translate-x-1/2 gap-2 rounded-xl border border-line bg-card p-2 shadow-[0_18px_40px_rgba(0,0,0,0.18)] transition-[opacity,transform,visibility] duration-[180ms]",
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1.5 opacity-0",
        )}
      >
        <ThemeToggle />
        <button
          type="button"
          aria-label="Search"
          onClick={() => {
            setOpen(false);
            setSearchOpen(true);
          }}
          className="inline-flex items-center justify-center rounded-lg border border-line p-[0.4rem_0.6rem] text-ink transition-colors hover:border-editorial-accent hover:text-editorial-accent"
        >
          <Search className="size-[18px]" aria-hidden="true" />
        </button>
        {showClientLogin && (
          <IconLink href="/client/login.html" aria-label="Client portal login" title="Client portal">
            <User className="size-[18px]" aria-hidden="true" />
          </IconLink>
        )}
        <IconLink href="/admin/login.html" aria-label="Admin login" title="Admin login">
          <ShieldCheck className="size-[18px]" aria-hidden="true" />
        </IconLink>
      </div>
      <SearchPopup open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function IconLink({ href, children, ...props }: React.ComponentProps<typeof Link>) {
  const className = "inline-flex items-center justify-center rounded-lg border border-line p-[0.4rem_0.6rem] text-ink transition-colors hover:border-editorial-accent hover:text-editorial-accent";
  // Admin/client login are PHP-only pages — a plain anchor avoids Link's
  // same-origin prefetch/soft-navigation 404 (see MegaLink above).
  if (typeof href === "string" && href.endsWith(".html")) {
    return (
      <a href={href} {...(props as React.ComponentProps<"a">)} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...props} className={className}>
      {children}
    </Link>
  );
}

function AboutPanel() {
  const [featured, setFeatured] = React.useState<BlogPost | null>(null);
  React.useEffect(() => {
    api.blog().then((posts) => setFeatured(posts?.[0] ?? null)).catch(() => {});
  }, []);
  return (
    <>
      <MegaCol label="GET TO KNOW ME">
        <div className="flex flex-col">
          <MegaLink href="/about">The story so far</MegaLink>
          <MegaLink href="/about#principles">Engineering principles</MegaLink>
          <MegaLink href="/about#career-timeline">Career timeline</MegaLink>
        </div>
      </MegaCol>
      <MegaCol label="PROOF & ARCHIVE">
        <div className="flex flex-col">
          <MegaLink href="/testimonials">Client testimonials</MegaLink>
          <MegaLink href="/archive">Technical archive</MegaLink>
          <MegaLink href="/search">Search the site</MegaLink>
        </div>
      </MegaCol>
      <div>
        {featured ? (
          <>
            <p className="mb-[1.1rem] text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-editorial-muted">FROM THE ARCHIVE</p>
            <MegaFeatured href={`/archive/${featured.slug}`} title={featured.title} description={featured.excerpt} cta="Open technical breakdown" />
          </>
        ) : (
          <div className="h-32 animate-pulse rounded-[var(--radius)] bg-bg-soft" />
        )}
      </div>
    </>
  );
}

function ServicesPanel() {
  return (
    <>
      <MegaCol label="SERVICE TRACKS">
        <div className="flex flex-col">
          <MegaLink href="/services#track-01">AI voice agents</MegaLink>
          <MegaLink href="/services#track-02">Autonomous AI agents</MegaLink>
          <MegaLink href="/services#track-03">Business automations</MegaLink>
          <MegaLink href="/services#track-04">AI chatbots & assistants</MegaLink>
          <MegaLink href="/services#track-05">Custom websites & mobile apps</MegaLink>
          <MegaLink href="/services#track-06">Video & image ads</MegaLink>
        </div>
      </MegaCol>
      <MegaCol label="ENGAGEMENT">
        <div className="flex flex-col">
          <MegaLink href="/pricing">Pricing & packages</MegaLink>
          <MegaLink href="/#estimator">Scope your project</MegaLink>
          <MegaLink href="/book.html">Book a discovery call</MegaLink>
          <MegaLink href="/request.html">Request a project</MegaLink>
        </div>
      </MegaCol>
      <div>
        <p className="mb-[1.1rem] text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-editorial-muted">NOT SURE WHERE TO START</p>
        <MegaFeatured
          href="/book.html"
          title="Book a 20-minute discovery call"
          description="Walk through what you're trying to build and get a straight read on scope, cost, and timeline, no obligation."
          cta="Pick a time"
        />
      </div>
    </>
  );
}

function ProjectsPanel() {
  const [projects, setProjects] = React.useState<Project[] | null>(null);
  React.useEffect(() => {
    api.projects().then(setProjects).catch(() => setProjects([]));
  }, []);

  if (projects && projects.length === 0) return null;

  const counts = { ecommerce: 0, webapp: 0, mobile: 0 };
  projects?.forEach((p) => counts[platformOf(p)]++);
  const star = projects?.find((p) => p.is_featured) ?? projects?.[0];

  return (
    <>
      <MegaCol label="SYSTEM TYPES">
        <div className="flex flex-col">
          <MegaLink href="/projects" meta={projects ? String(projects.length) : undefined}>
            All systems
          </MegaLink>
          <MegaLink href="/projects?platform=ecommerce" meta={String(counts.ecommerce)}>
            E-commerce
          </MegaLink>
          <MegaLink href="/projects?platform=webapp" meta={String(counts.webapp)}>
            Web apps
          </MegaLink>
          <MegaLink href="/projects?platform=mobile" meta={String(counts.mobile)}>
            Mobile apps
          </MegaLink>
        </div>
      </MegaCol>
      <MegaCol label="DEPLOYED SYSTEMS">
        {projects ? (
          <div className="flex flex-col">
            {projects.slice(0, 6).map((p, i) => (
              <Link
                key={p.slug}
                href={`/projects/${p.slug}`}
                className="grid grid-cols-[2.2rem_1fr_auto] items-baseline gap-[0.9rem] border-b border-line py-[0.55rem] text-ink-soft transition-[color,padding-left] duration-300 hover:pl-[0.4rem] hover:text-heading"
              >
                <span className="text-[0.7rem] tracking-[0.08em] text-editorial-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-semibold">{p.title}</span>
                <span className="whitespace-nowrap text-[0.72rem] uppercase tracking-[0.06em] text-editorial-muted">
                  {p.tags?.[0]?.name ?? "Build"}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="h-40 animate-pulse rounded-[var(--radius)] bg-bg-soft" />
        )}
      </MegaCol>
      <div>
        {star ? (
          <>
            <p className="mb-[1.1rem] text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-editorial-muted">HAVE YOU SEEN</p>
            <MegaFeatured href={`/projects/${star.slug}`} title={star.title} description={star.summary} cta="Inspect system" />
          </>
        ) : (
          <div className="h-32 animate-pulse rounded-[var(--radius)] bg-bg-soft" />
        )}
      </div>
    </>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const links = [{ href: "/", label: "Home" }, ...PRIMARY_LINKS];
  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[1040] bg-black/40 backdrop-blur-[3px] transition-opacity duration-300 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          "fixed inset-y-0 right-0 z-[1045] flex w-[min(340px,86vw)] flex-col bg-bg text-ink-soft shadow-lg transition-transform duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] md:hidden",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-line p-[1.15rem_1.25rem]">
          <span className="inline-flex items-center gap-2 text-[1.1rem] font-bold text-heading">
            <span className="flex size-[2.15em] items-center justify-center rounded-[0.55em] bg-heading text-[0.78em] font-extrabold text-bg" aria-hidden="true">
              P
            </span>
            Prince Caleb<span className="text-editorial-accent">.</span>
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="drawer-close relative size-[2.15rem] rounded-full border border-line transition-[border-color,transform] duration-300 hover:rotate-90 hover:border-editorial-accent"
          />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto pt-1 text-center">
          <p className="mb-3 mt-4 text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-ink-soft">// Menu</p>
          <nav className="nav-drawer-links flex flex-col">
            {links.map((link, i) => {
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  className={cn(
                    "nav-drawer-link drawer-stagger flex items-baseline justify-center gap-[0.6rem] border-b border-line p-[1rem_0.25rem] text-[1.5rem] font-bold text-editorial-accent transition-[color,opacity,transform] duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:opacity-60",
                    open ? "translate-y-0 opacity-100" : "translate-y-3.5 opacity-0",
                  )}
                  style={{ transitionDelay: open ? `${0.08 + i * 0.05}s` : "0s" }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <Button
            variant="brand"
            size="pill"
            nativeButton={false}
            render={<Link href="/contact" onClick={onClose} />}
            className={cn(
              "drawer-stagger mx-6 mt-5 py-[0.95rem] text-[1.25rem] font-bold transition-opacity duration-200 hover:translate-y-0",
              open ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDelay: open ? "0.38s" : "0s" }}
          >
            Start a project
          </Button>
        </div>
      </div>
    </>
  );
}
