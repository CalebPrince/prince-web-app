import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, legalLink } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service - Prince Caleb",
  description: "Terms for using this site's contact form, booking, Live Chat, and payment features.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="July 2026"
      lede={
        <>
          This site is a portfolio and the start of a conversation, not a binding contract on its own.
          Pricing shown is a starting range, and anything you pay a deposit on gets its own agreed scope
          first.
        </>
      }
    >
      <LegalSection heading="Using this site">
        <p>
          This site is Prince Caleb&apos;s portfolio and client-acquisition platform for web and mobile app
          development services. By using the contact form, project request form, Live Chat, appointment
          booking, or payment features, you agree to these terms. If you don&apos;t agree, please don&apos;t
          use those features, you&apos;re always welcome to just browse.
        </p>
      </LegalSection>

      <LegalSection heading="Quotes, estimates & pricing">
        <p>
          The pricing tiers on{" "}
          <Link href="/pricing" className={legalLink}>
            /pricing
          </Link>{" "}
          and the project estimate calculator are starting ranges to help you budget, they are not binding
          quotes. Every project is scoped and priced individually after a discovery conversation, and the
          final price, timeline, and deliverables are agreed between us before any work begins.
        </p>
      </LegalSection>

      <LegalSection heading="Deposits & payments">
        <p>
          Payments are processed by Paystack, card details never touch this server directly (see the{" "}
          <Link href="/privacy" className={legalLink}>
            Privacy Policy
          </Link>{" "}
          for how Paystack fits into data handling). A deposit paid through the Starter-tier checkout or a
          payment link secures your place in the project queue and goes toward the total agreed cost.
          Deposits are generally non-refundable once work has started, since they represent time set aside
          for your project, but if something&apos;s gone wrong, get in touch and I&apos;ll always work with
          you in good faith rather than point to fine print.
        </p>
      </LegalSection>

      <LegalSection heading="Bookings & appointments">
        <p>
          Booking a call through{" "}
          <Link href="/book" className={legalLink}>
            /book
          </Link>{" "}
          reserves that time slot. Please give as much notice as you can if you need to reschedule or cancel,
          a quick message through the contact form or Live Chat is all it takes. Repeated no-shows without
          notice may affect whether future bookings are accepted.
        </p>
      </LegalSection>

      <LegalSection heading="Live Chat & AI-generated content">
        <p>
          The Live Chat assistant is powered by AI (Google Gemini, with an OpenRouter fallback) and can make
          mistakes or state things imprecisely, treat its replies as a helpful starting point, not
          professional or legal advice. Any &quot;concept prototype&quot; it generates is an illustrative
          mock-up only: a visual starting point for conversation, not a functional deliverable, and not
          covered by any project agreement until the actual scope of work is agreed separately.
        </p>
      </LegalSection>

      <LegalSection heading="Testimonials">
        <p>
          If you submit a testimonial through a link sent to you, you&apos;re giving permission for that
          quote, your name, and star rating to be reviewed and, if approved, published on the public{" "}
          <Link href="/testimonials" className={legalLink}>
            Testimonials
          </Link>{" "}
          page. Nothing is published without going through that review step first.
        </p>
      </LegalSection>

      <LegalSection heading="Intellectual property">
        <p>
          The content of this site, case studies, blog posts, design, and code powering the site itself,
          belongs to Prince Caleb unless otherwise noted. Ownership of work delivered as part of a paid
          project is addressed in that project&apos;s own agreement, not by this page, get in touch if
          you&apos;d like that spelled out before starting.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>
          Please don&apos;t use the contact form, project request form, Live Chat, or booking system to send
          spam, attempt to break or probe the site&apos;s security, or abuse the AI assistant (e.g. trying to
          extract its underlying instructions or misuse it for unrelated purposes). Rate limits apply to
          these forms specifically to keep them usable for everyone.
        </p>
      </LegalSection>

      <LegalSection heading="Third-party services">
        <p>
          This site relies on a small number of third parties to work: <strong>Paystack</strong> for payment
          processing, <strong>Google Gemini</strong> (and, as a fallback, <strong>OpenRouter</strong>) for
          Live Chat and prototype generation, and <strong>Slack</strong> for the site owner&apos;s own
          internal notifications. Each operates under its own terms, which apply alongside these.
        </p>
      </LegalSection>

      <LegalSection heading="No warranty & limitation of liability">
        <p>
          This site and the information on it are provided &quot;as is.&quot; While care is taken to keep
          pricing, project details, and AI-assisted replies accurate, nothing here should be treated as a
          final commitment until confirmed in writing for your specific project. To the extent permitted by
          law, Prince Caleb isn&apos;t liable for indirect or consequential loss arising from your use of
          this site, direct project work is governed by that project&apos;s own agreement instead.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          These terms may be updated occasionally as the site&apos;s features change. The date below reflects
          the last update, check back if it&apos;s been a while since you last read this.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>
          These terms are governed by the laws of Ghana, without regard to conflict-of-law principles.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms:{" "}
          <a href="mailto:hello@princecaleb.dev" className={legalLink}>
            hello@princecaleb.dev
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
