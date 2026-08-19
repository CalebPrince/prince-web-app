import type { IconType } from "react-icons";
import { FaGithub, FaLinkedinIn, FaYoutube, FaXTwitter } from "react-icons/fa6";
import Link from "next/link";

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

const LINK_CLASS = "text-[15px] leading-none text-text-2 transition-colors hover:text-accent";

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

export function SiteFooter() {
  /** The nav list runs down two columns before wrapping, the way the link
   *  blocks in the reference layout do, instead of one long single column. */
  const navRows = Math.ceil(NAV_LINKS.length / 2);

  return (
    <footer className="border-t border-hairline bg-bg">
      <div className="mx-auto max-w-[1400px] px-6 md:px-10">
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
            className="inline-flex items-center gap-2 text-sm text-text-3 transition-colors hover:text-accent"
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
