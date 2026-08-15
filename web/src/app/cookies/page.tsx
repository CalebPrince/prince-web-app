import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "This site doesn't use tracking or advertising cookies. Here's exactly what is stored in your browser.",
};

const rows = [
  {
    name: "theme",
    type: "Local storage",
    purpose: "Remembers your light/dark mode choice",
    lifetime: "Until you clear browser data",
  },
  {
    name: "chat_token",
    type: "Session storage",
    purpose: "Keeps your Live Chat conversation connected to the right session",
    lifetime: "Cleared when you close the tab",
  },
  {
    name: "access_token / refresh_token",
    type: "Cookie (HttpOnly)",
    purpose: "Keeps the site owner signed into the admin panel",
    lifetime: "15 minutes / 30 days, only ever set when logging into /admin",
  },
  {
    name: "pc_lead_attribution",
    type: "Session storage",
    purpose: "Remembers this tab's first landing page, referrer, and UTM campaign so a later inquiry can be attributed",
    lifetime: "Cleared when you close the tab",
  },
];

export default function CookiesPage() {
  return (
    <main>
      <header className="flex min-h-[calc(100vh-76px)] items-center border-b border-line bg-bg">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Legal</p>
          <h1 className="mb-3 text-5xl font-bold leading-[1.1] md:text-6xl">Cookie Policy</h1>
          <p className="max-w-[60ch] text-lg leading-[1.65] text-ink-soft">
            Short version: this site doesn&apos;t use tracking or advertising cookies, so there&apos;s no consent
            banner. Here&apos;s exactly what is stored in your browser.
          </p>
        </div>
      </header>

      <section className="py-[5.5rem]">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <h3 className="mb-4 text-2xl font-bold text-heading">What this site stores</h3>
          <div className="mb-6 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-line-strong">
                  <th className="py-2 pr-3 font-semibold text-heading">Name</th>
                  <th className="py-2 pr-3 font-semibold text-heading">Type</th>
                  <th className="py-2 pr-3 font-semibold text-heading">Purpose</th>
                  <th className="py-2 pr-3 font-semibold text-heading">Lifetime</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name} className="border-b border-line align-top">
                    <td className="py-3 pr-3 font-mono text-xs whitespace-nowrap text-ink-soft">{row.name}</td>
                    <td className="py-3 pr-3 text-ink-soft">{row.type}</td>
                    <td className="py-3 pr-3 text-ink-soft">{row.purpose}</td>
                    <td className="py-3 pr-3 text-ink-soft">{row.lifetime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mb-4 text-2xl font-bold text-heading">What&apos;s not here</h3>
          <p className="mb-6 text-ink-soft">
            No Google Analytics, no advertising pixels, no third-party tracking scripts, and nothing that follows
            you to other sites. That&apos;s also why you won&apos;t see a cookie consent banner, there&apos;s
            genuinely nothing here that needs your consent under most privacy laws.
          </p>

          <h3 className="mb-4 text-2xl font-bold text-heading">Managing or clearing these</h3>
          <p className="mb-6 text-ink-soft">
            The <code>theme</code>, <code>chat_token</code>, and <code>pc_lead_attribution</code> entries can be
            cleared anytime from your browser&apos;s site data settings. Clearing attribution simply means a later
            inquiry will not retain its original landing context. The admin session cookies only ever apply if
            you&apos;re logged into the admin panel, regular visitors never receive them.
          </p>

          <h3 className="mb-4 text-2xl font-bold text-heading">Contact</h3>
          <p className="text-ink-soft">
            Questions about this policy:{" "}
            <a href="mailto:hello@princecaleb.dev" className="text-editorial-accent hover:text-editorial-accent-strong">
              hello@princecaleb.dev
            </a>
            . See also the{" "}
            <Link href="/privacy" className="text-editorial-accent hover:text-editorial-accent-strong">
              Privacy Policy
            </Link>{" "}
            for how form and chat submissions are handled.
          </p>
          <p className="mt-4 text-sm text-ink-soft">Last updated: July 2026.</p>
        </div>
      </section>
    </main>
  );
}
