import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, legalLink } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Prince Caleb - Cookie Policy",
  description:
    "This site doesn't use tracking or advertising cookies. Here's exactly what is stored in your browser.",
};

const ROWS = [
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
    purpose:
      "Remembers this tab's first landing page, referrer, and UTM campaign so a later inquiry can be attributed",
    lifetime: "Cleared when you close the tab",
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="July 2026"
      lede={
        <>
          Short version: this site doesn&apos;t use tracking or advertising cookies, so there&apos;s no
          consent banner. Here&apos;s exactly what is stored in your browser.
        </>
      }
    >
      <LegalSection heading="What this site stores">
        <div className="overflow-x-auto rounded-[var(--radius)] border border-hairline">
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-hairline-strong bg-bg-2/50">
                <th className="label px-4 py-3 font-medium text-muted">Name</th>
                <th className="label px-4 py-3 font-medium text-muted">Type</th>
                <th className="label px-4 py-3 font-medium text-muted">Purpose</th>
                <th className="label px-4 py-3 font-medium text-muted">Lifetime</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.name} className="border-b border-hairline align-top last:border-b-0">
                  <td className="px-4 py-4 font-mono text-xs whitespace-nowrap text-accent">{row.name}</td>
                  <td className="px-4 py-4 text-base text-text-2">{row.type}</td>
                  <td className="px-4 py-4 text-base text-text-2">{row.purpose}</td>
                  <td className="px-4 py-4 text-base text-text-2">{row.lifetime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection heading="What's not here">
        <p>
          No Google Analytics, no advertising pixels, no third-party tracking scripts, and nothing that
          follows you to other sites. That&apos;s also why you won&apos;t see a cookie consent banner,
          there&apos;s genuinely nothing here that needs your consent under most privacy laws.
        </p>
      </LegalSection>

      <LegalSection heading="Managing or clearing these">
        <p>
          The <code className="font-mono text-sm text-accent">theme</code>,{" "}
          <code className="font-mono text-sm text-accent">chat_token</code>, and{" "}
          <code className="font-mono text-sm text-accent">pc_lead_attribution</code> entries can be cleared
          anytime from your browser&apos;s site data settings. Clearing attribution simply means a later
          inquiry will not retain its original landing context. The admin session cookies only ever apply if
          you&apos;re logged into the admin panel, regular visitors never receive them.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about this policy:{" "}
          <a href="mailto:hello@princecaleb.dev" className={legalLink}>
            hello@princecaleb.dev
          </a>
          . See also the{" "}
          <Link href="/privacy" className={legalLink}>
            Privacy Policy
          </Link>{" "}
          for how form and chat submissions are handled.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
