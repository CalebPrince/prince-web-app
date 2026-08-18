import type { IconType } from "react-icons";
import { FaGithub, FaLinkedinIn, FaYoutube, FaXTwitter } from "react-icons/fa6";
import Link from "next/link";
import { Logo } from "@/components/Logo";

const NAV_LINKS: { label: string; to: string }[] = [
  { label: "Services", to: "/services" },
  { label: "Systems", to: "/systems" },
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
  { label: "X", href: "https://x.com", icon: FaXTwitter },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-bg-2/30">
      <div className="mx-auto max-w-[1400px] px-6 py-16 md:px-10">
        <div className="flex flex-col justify-between gap-12 md:flex-row">
          <div>
            <Link href="/">
              <Logo />
            </Link>
            <p className="mt-4 max-w-xs text-sm text-muted">
              Designing. Building. Experimenting.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-12 sm:grid-cols-4">
            <div>
              <p className="label mb-5 text-muted">Navigate</p>
              <ul className="space-y-3">
                {NAV_LINKS.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.to}
                      className="text-sm text-text-2 transition-colors hover:text-accent"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="label mb-5 text-muted">Resources</p>
              <ul className="space-y-3">
                {RESOURCE_LINKS.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.to}
                      className="text-sm text-text-2 transition-colors hover:text-accent"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="label mb-5 text-muted">Social</p>
              <div className="flex gap-3">
                {SOCIAL.map(({ label, href, icon: Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="grid size-10 place-items-center rounded-full border border-hairline text-text-2 transition-all hover:border-accent/60 hover:text-accent hover:glow-green"
                  >
                    <Icon className="size-[1.05rem]" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-16 flex flex-col justify-between gap-4 border-t border-hairline pt-8 text-sm text-muted sm:flex-row sm:items-center">
          <span>&copy; 2026 PrinceCaleb.dev</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.label} href={l.to} className="transition-colors hover:text-accent">
                {l.label}
              </Link>
            ))}
            <a
              href="https://github.com/CalebPrince/prince-web-app"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-text-2 transition-colors hover:text-accent"
            >
              <FaGithub className="size-4" aria-hidden="true" />
              View source
            </a>
          </div>
          <span className="label">Built for what&rsquo;s next</span>
        </div>
      </div>
    </footer>
  );
}
