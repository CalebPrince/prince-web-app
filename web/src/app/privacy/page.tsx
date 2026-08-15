import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What information this site collects, why, and how it's used.",
};

export default function PrivacyPage() {
  return (
    <main>
      <header className="flex min-h-[calc(100vh-76px)] items-center border-b border-line bg-bg">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Legal</p>
          <h1 className="mb-3 text-5xl font-bold leading-[1.1] md:text-6xl">Privacy Policy</h1>
          <p className="max-w-[60ch] text-lg leading-[1.65] text-ink-soft">
            Plain-language version: I collect the minimum needed to respond to you, I don&apos;t sell or advertise with
            your data, and I&apos;ll tell you exactly where it goes below.
          </p>
        </div>
      </header>

      <section className="py-[5.5rem]">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <h3 className="mb-4 text-2xl font-bold text-heading">What I collect</h3>
          <p className="text-ink-soft">
            When you use the <strong>contact form</strong>, I collect your name, email address, and message, plus,
            for spam prevention, your IP address and browser user-agent. If you arrived from a specific project
            page, I also note which one.
          </p>
          <p className="mt-4 text-ink-soft">
            When you use the <strong>Live Chat widget</strong>, the conversation itself is stored so I can follow
            up. If you choose to leave a message, request a concept prototype, or give feedback on one, I also
            collect your name, email, and, if you provide it, a phone number.
          </p>
          <p className="mt-4 mb-6 text-ink-soft">
            I also log basic, anonymous <strong>page views</strong>, the page path and referring site only. No IP
            address, no cookies, and no cross-site tracking, this data was never tied to you individually, and I
            have no way to connect it back to a specific visitor.
          </p>
          <p className="mb-6 text-ink-soft">
            When you <strong>book a call</strong>, I collect your name, email, optional phone number, chosen date
            and time, and the topic you provide. When you first arrive, this tab also remembers the landing page,
            referring site, and any UTM campaign labels; that context is attached only if you later contact me,
            book, or leave a chat message.
          </p>

          <h3 className="mb-4 text-2xl font-bold text-heading">How it&apos;s used</h3>
          <p className="mb-6 text-ink-soft">
            Solely to respond to you, understand which pages or campaigns lead to genuine inquiries, and run Live
            Chat. When enabled, an AI provider may process a chat transcript or booking brief to draft an internal
            project proposal. That draft is reviewed by a person and is never sent to you automatically.
            Submissions may also trigger a private email or Slack notification to me.
          </p>

          <h3 className="mb-4 text-2xl font-bold text-heading">Third parties</h3>
          <p className="text-ink-soft">
            <strong>Configured AI providers</strong>, Google Gemini, OpenRouter, or Groq may power Live Chat
            replies, concept prototypes, and internal proposal drafts. Content is sent only to the provider
            configured for that feature and is processed under that provider&apos;s privacy terms.
            <br />
            <strong>Slack</strong>, used only for my own internal notification of new inquiries, if configured.
            Visitors never interact with Slack directly.
          </p>
          <p className="mt-4 mb-6 text-ink-soft">
            I don&apos;t use this data for advertising, and I don&apos;t sell or share it with anyone else.
          </p>

          <h3 className="mb-4 text-2xl font-bold text-heading">Cookies &amp; local storage</h3>
          <p className="mb-6 text-ink-soft">
            This site doesn&apos;t use tracking or advertising cookies. See the{" "}
            <Link href="/cookies" className="text-editorial-accent hover:text-editorial-accent-strong">
              Cookie Policy
            </Link>{" "}
            for exactly what&apos;s stored in your browser and why.
          </p>

          <h3 className="mb-4 text-2xl font-bold text-heading">Your rights</h3>
          <p className="mb-6 text-ink-soft">
            You can ask me to show you, correct, or delete any information I hold about you at any time, just get
            in touch using the details below.
          </p>

          <h3 className="mb-4 text-2xl font-bold text-heading">Changes</h3>
          <p className="mb-6 text-ink-soft">
            If this policy changes in any meaningful way, I&apos;ll update the date below and, where reasonable,
            the change will speak for itself in plain language, no silent rewrites.
          </p>

          <h3 className="mb-4 text-2xl font-bold text-heading">Contact</h3>
          <p className="text-ink-soft">
            Questions about this policy or your data:{" "}
            <a href="mailto:hello@princecaleb.dev" className="text-editorial-accent hover:text-editorial-accent-strong">
              hello@princecaleb.dev
            </a>
            .
          </p>
          <p className="mt-4 text-sm text-ink-soft">Last updated: July 2026.</p>
        </div>
      </section>
    </main>
  );
}
