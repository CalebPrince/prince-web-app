import Link from "next/link";
import { api } from "@/lib/api";

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

// Same icon set/paths as public/js/content.js's socialIcons map — that
// script builds this row client-side on the PHP site from whichever
// social_* fields are set in /api/v1/content; ported here 1:1 since this
// server component can just fetch that content directly instead.
const SOCIAL_ICONS: { key: string; label: string; path: string }[] = [
  {
    key: "social_github",
    label: "GitHub",
    path: "M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.725-4.042-1.61-4.042-1.61-.546-1.385-1.333-1.754-1.333-1.754-1.09-.744.084-.729.084-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.42-1.305.763-1.605-2.665-.303-5.466-1.332-5.466-5.93 0-1.31.469-2.38 1.236-3.22-.124-.303-.536-1.523.117-3.176 0 0 1.008-.322 3.301 1.23A11.5 11.5 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.655 1.653.243 2.873.12 3.176.77.84 1.235 1.91 1.235 3.22 0 4.61-2.807 5.625-5.48 5.92.43.372.823 1.102.823 2.222 0 1.606-.014 2.896-.014 3.286 0 .32.216.694.825.576C20.565 21.795 24 17.298 24 12c0-6.63-5.37-12-12-12z",
  },
  {
    key: "social_linkedin",
    label: "LinkedIn",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.114 20.452H3.558V9h3.556v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
  {
    key: "social_twitter",
    label: "Twitter/X",
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    key: "social_whatsapp",
    label: "WhatsApp",
    path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.04 22h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.999-3.648-.235-.374a9.86 9.86 0 0 1-1.512-5.264c.001-5.45 4.436-9.885 9.89-9.885 2.64 0 5.122 1.031 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.002 5.45-4.437 9.89-9.886 9.89zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.304-1.654a11.86 11.86 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.49-8.198z",
  },
  {
    key: "social_upwork",
    label: "Upwork",
    path: "M18.561 13.158c-1.102 0-2.135-.467-3.074-1.227l.228-1.076.008-.042c.207-1.143.849-3.06 2.839-3.06 1.492 0 2.703 1.212 2.703 2.703-.001 1.489-1.212 2.702-2.704 2.702zm0-8.14c-2.539 0-4.51 1.649-5.31 4.366-1.22-1.834-2.148-4.036-2.687-5.892H7.828v7.112c-.002 1.406-1.141 2.546-2.547 2.548-1.405-.002-2.543-1.143-2.545-2.548V3.492H0v7.112c0 2.914 2.37 5.303 5.281 5.303 2.913 0 5.283-2.389 5.283-5.303v-1.19c.529 1.107 1.182 2.229 1.974 3.221l-1.673 7.873h2.797l1.213-5.71c1.063.679 2.285 1.109 3.686 1.109 3 0 5.439-2.452 5.439-5.45 0-3-2.439-5.439-5.439-5.439z",
  },
  {
    key: "social_fiverr",
    label: "Fiverr",
    path: "M23.004 15.588a.995.995 0 1 0 .002-1.99.995.995 0 0 0-.002 1.99zm-.996-3.705h-.85c-.546 0-.84.41-.84 1.092v2.466h-1.61v-3.558h-.684c-.547 0-.84.41-.84 1.092v2.466h-1.61v-4.874h1.61v.74c.264-.574.626-.74 1.163-.74h1.972v.74c.264-.574.625-.74 1.162-.74h.527v1.316zm-6.786 1.501h-3.359c.088.546.43.858 1.006.858.43 0 .732-.175.83-.487l1.425.4c-.351.848-1.22 1.364-2.255 1.364-1.748 0-2.549-1.355-2.549-2.515 0-1.14.703-2.505 2.45-2.505 1.856 0 2.471 1.384 2.471 2.408 0 .224-.01.37-.02.477zm-1.562-.945c-.04-.42-.342-.81-.889-.81-.508 0-.81.225-.908.81h1.797zM7.508 15.44h1.416l1.767-4.874h-1.62l-.86 2.837-.878-2.837H5.72l1.787 4.874zm-6.6 0H2.51v-3.558h1.524v3.558h1.591v-4.874H2.51v-.302c0-.332.235-.536.606-.536h.918V8.412H2.85c-1.162 0-1.943.712-1.943 1.755v.4H0v1.316h.908v3.558z",
  },
  {
    key: "social_email",
    label: "Email",
    path: "M2 4h20v16H2V4zm2 2.236V6l8 5.99L20 6v.236l-8 6.021-8-6.021zM4 8.52V18h16V8.52l-7.386 5.55a1 1 0 0 1-1.228 0L4 8.52z",
  },
];

// Always dark navy regardless of the site's active theme (light / dark /
// midnight / paper) — matches public/css/app.css's .site-footer rule
// exactly, which pins these colors as a grounded brand identity rather than
// a panel that flips with the theme toggle. --navy only has one definition
// (globals.css :root), so bg-navy already stays constant across themes;
// the rest use literal hex to match app.css's #8a8f98/#b4b8bf 1:1 instead
// of reaching for theme tokens that would vary.
export async function SiteFooter() {
  let socials: { key: string; label: string; path: string; href: string }[] = [];
  try {
    const content = await api.content();
    socials = SOCIAL_ICONS.filter((icon) => content[icon.key]).map((icon) => ({
      ...icon,
      href: icon.key === "social_email" && !content[icon.key].startsWith("mailto:")
        ? `mailto:${content[icon.key]}`
        : content[icon.key],
    }));
  } catch {
    // /api/v1/content unreachable — footer still works without the icon row.
  }

  return (
    <footer className="mt-auto border-t border-white/8 bg-navy text-[#8a8f98]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 sm:flex-row sm:justify-between sm:px-6">
        <span className="flex items-center gap-2 font-semibold text-white">
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-md bg-white text-xs font-bold text-navy"
          >
            P
          </span>
          Prince Caleb<span className="opacity-70">.</span>
        </span>
        <nav className="flex flex-wrap justify-center gap-4 text-sm">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-[#b4b8bf] hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      {socials.length > 0 && (
        <div className="mx-auto flex max-w-6xl justify-center gap-3 px-4 sm:justify-start sm:px-6">
          {socials.map((social) => (
            <a
              key={social.key}
              href={social.href}
              target={social.key === "social_email" ? "_self" : "_blank"}
              rel="noopener"
              title={social.label}
              aria-label={social.label}
              className="flex size-9 items-center justify-center rounded-full bg-white/8 transition-[background-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:bg-white/16"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                <path d={social.path} />
              </svg>
            </a>
          ))}
        </div>
      )}
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 pb-8 pt-3 text-xs sm:items-start sm:px-6">
        <p>&copy; {new Date().getFullYear()} Prince Caleb. All rights reserved.</p>
        <nav className="flex gap-3">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-[#b4b8bf] hover:text-white">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
