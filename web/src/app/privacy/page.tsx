import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, legalLink } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy - Prince Caleb",
  description: "What information this site collects, why, and how it's used.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="July 2026"
      lede={
        <>
          Plain-language version: I collect the minimum needed to respond to you, I don&apos;t sell or
          advertise with your data, and I&apos;ll tell you exactly where it goes below.
        </>
      }
    >
      <LegalSection heading="What I collect">
        <p>
          When you use the <strong>contact form</strong>, I collect your name, email address, and message,
          plus, for spam prevention, your IP address and browser user-agent. If you arrived from a specific
          project page, I also note which one.
        </p>
        <p>
          When you use the <strong>Live Chat widget</strong>, the conversation itself is stored so I can
          follow up. If you choose to leave a message, request a concept prototype, or give feedback on one,
          I also collect your name, email, and, if you provide it, a phone number.
        </p>
        <p>
          I also log basic, anonymous <strong>page views</strong>, the page path and referring site only. No
          IP address, no cookies, and no cross-site tracking, this data was never tied to you individually,
          and I have no way to connect it back to a specific visitor.
        </p>
        <p>
          When you <strong>book a call</strong>, I collect your name, email, optional phone number, chosen
          date and time, and the topic you provide. When you first arrive, this tab also remembers the
          landing page, referring site, and any UTM campaign labels; that context is attached only if you
          later contact me, book, or leave a chat message.
        </p>
      </LegalSection>

      <LegalSection heading="How it's used">
        <p>
          Solely to respond to you, understand which pages or campaigns lead to genuine inquiries, and run
          Live Chat. When enabled, an AI provider may process a chat transcript or booking brief to draft an
          internal project proposal. That draft is reviewed by a person and is never sent to you
          automatically. Submissions may also trigger a private email or Slack notification to me.
        </p>
      </LegalSection>

      <LegalSection heading="Third parties">
        <p>
          <strong>Configured AI providers</strong>, Google Gemini, OpenRouter, or Groq may power Live Chat
          replies, concept prototypes, and internal proposal drafts. Content is sent only to the provider
          configured for that feature and is processed under that provider&apos;s privacy terms.
        </p>
        <p>
          <strong>Slack</strong>, used only for my own internal notification of new inquiries, if configured.
          Visitors never interact with Slack directly.
        </p>
        <p>I don&apos;t use this data for advertising, and I don&apos;t sell or share it with anyone else.</p>
      </LegalSection>

      <LegalSection heading="Cookies & local storage">
        <p>
          This site doesn&apos;t use tracking or advertising cookies. See the{" "}
          <Link href="/cookies" className={legalLink}>
            Cookie Policy
          </Link>{" "}
          for exactly what&apos;s stored in your browser and why.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          You can ask me to show you, correct, or delete any information I hold about you at any time, just
          get in touch using the details below.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If this policy changes in any meaningful way, I&apos;ll update the date below and, where reasonable,
          the change will speak for itself in plain language, no silent rewrites.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about this policy or your data:{" "}
          <a href="mailto:hello@princecaleb.dev" className={legalLink}>
            hello@princecaleb.dev
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
