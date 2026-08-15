import Link from "next/link";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/projects", label: "Projects" },
  { href: "/archive", label: "Archive" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/terms", label: "Terms of Service" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-foreground text-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 sm:flex-row sm:justify-between sm:px-6">
        <span className="flex items-center gap-2 font-semibold">
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-md bg-background/15 text-xs font-bold"
          >
            P
          </span>
          Prince Caleb<span className="opacity-70">.</span>
        </span>
        <nav className="flex flex-wrap justify-center gap-4 text-sm">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="opacity-80 hover:opacity-100">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 pb-8 text-xs opacity-70 sm:items-start sm:px-6">
        <p>&copy; {new Date().getFullYear()} Prince Caleb. All rights reserved.</p>
        <nav className="flex gap-3">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:opacity-100">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
