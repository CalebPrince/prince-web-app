import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScenarioLab } from "./scenario-lab";
import "./lisa.css";

export const metadata: Metadata = {
  title: "Lisa AI Assistant and Business Integrations",
  description: "See how Lisa answers calls and messages, books Google Calendar appointments, updates CRMs, alerts teams in Slack, and follows up with customers.",
  openGraph: {
    type: "website",
    title: "Meet Lisa: An AI Assistant Connected to Your Business",
    description: "Explore practical workflows connecting calls and messages to calendars, CRMs, Slack, email, payments, and more.",
    url: "https://princecaleb.dev/lisa-ai-assistant.html",
    images: ["https://princecaleb.dev/uploads/og-image.png"],
  },
  twitter: { card: "summary_large_image" },
};

const TOOLS = [
  { icon: "31", cls: "tool-g", title: "Calendars", body: "Check availability, create bookings, reschedule appointments, and send reminders.", small: "Google Calendar · Outlook · Calendly" },
  { icon: "C", cls: "tool-c", title: "CRMs", body: "Create contacts, qualify opportunities, update stages, assign owners, and record interactions.", small: "HubSpot · Salesforce · Zoho · Custom CRMs" },
  { icon: "S", cls: "tool-s", title: "Team communication", body: "Post summaries, alert the right channel, request approval, and escalate urgent conversations.", small: "Slack · Microsoft Teams · WhatsApp" },
  { icon: "@", cls: "tool-m", title: "Email and marketing", body: "Send confirmations, nurture leads, stop sequences on reply, and keep context together.", small: "Gmail · Outlook · Mailchimp · SendGrid" },
  { icon: "P", cls: "tool-p", title: "Payments and documents", body: "Share payment links, confirm payments, issue receipts, and prepare approved documents.", small: "Paystack · Stripe · Google Drive · DocuSign" },
  { icon: "+", cls: "tool-z", title: "Your internal systems", body: "Connect custom databases, admin dashboards, inventory tools, help desks, and APIs.", small: "REST APIs · Webhooks · SQL · Custom software" },
];

const TIERS = [
  {
    name: "Starter",
    priceGhs: "GHS 800",
    priceUsd: "$55",
    tagline: "One channel, answering the questions and requests that come in every day.",
    features: ["One channel: WhatsApp or web chat", "Approved FAQ and lead capture", "Monthly conversation summary"],
    featured: false,
  },
  {
    name: "Growth",
    priceGhs: "GHS 2,000",
    priceUsd: "$140",
    tagline: "Voice and messaging together, connected to the calendar and CRM your team already uses.",
    features: ["Voice, WhatsApp, and web chat", "One CRM or calendar integration", "Human escalation and notifications", "Monthly reporting dashboard"],
    featured: true,
    badge: "Most requested",
  },
  {
    name: "Scale",
    priceGhs: "GHS 4,500",
    priceUsd: "$300",
    tagline: "Every channel plus a live AI video agent, connected to your apps and CRMs with priority support.",
    features: ["All channels, including social inboxes", "Live AI video agent with an agreed monthly allowance", "Multiple CRM, app, and social integrations", "Priority support and monthly optimisation", "Full audit trail and reporting"],
    featured: false,
  },
];

const PERMISSIONS = [
  { label: "Read approved business information", state: "Allowed", cls: "is-on" },
  { label: "Create calendar appointments", state: "Allowed", cls: "is-on" },
  { label: "Update customer records", state: "Allowed", cls: "is-on" },
  { label: "Send approved follow-ups", state: "Rules apply", cls: "is-review" },
  { label: "Issue refunds or financial decisions", state: "Human only", cls: "is-off" },
  { label: "Handle sensitive or unclear requests", state: "Escalate", cls: "is-off" },
];

export default function LisaAiAssistantPage() {
  return (
    <main className="lisa-capabilities-page">
      <header className="lisa-integrations-hero">
        <div className="lisa-hero-grid mx-auto max-w-6xl px-4 sm:px-6">
          <div className="lisa-hero-copy">
            <div className="lisa-brand-lockup">
              <span className="lisa-profile-mark" aria-hidden="true">
                <svg viewBox="0 0 48 48" focusable="false">
                  <circle cx="24" cy="24" r="18" />
                  <path d="M15 25h3l2.4-8 4.4 15 3.4-11 2.1 6H34" />
                  <path d="M18 37c3.8 2.1 8.2 2.1 12 0" />
                </svg>
              </span>
              <span>
                <strong>Lisa</strong>
                <small>AI assistant by Prince Caleb</small>
              </span>
            </div>
            <p className="eyebrow mb-3">// Meet Lisa</p>
            <h1>
              One assistant.
              <br />
              <span>Your tools, connected.</span>
            </h1>
            <p>Lisa can answer calls and messages, understand what a customer needs, complete the next task in the tools your team already uses, and bring a person in when judgment is required.</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="brand" size="pill" nativeButton={false} render={<a href="#scenario-lab" />}>
                See Lisa at work
              </Button>
              <Button variant="brand-outline" size="pill" nativeButton={false} render={<a href="/book.html" />}>
                Plan an integration
              </Button>
            </div>
            <div className="lisa-hero-proof">
              <span>
                <i /> Phone, WhatsApp and web chat
              </span>
              <span>Human handoff built in</span>
            </div>
          </div>

          <div className="lisa-integration-map" aria-label="Lisa connected to business tools">
            <div className="integration-map-head">
              <span>Live workflow map</span>
              <strong>
                <i /> All connections ready
              </strong>
            </div>
            <div className="integration-orbit">
              <div className="orbit-line orbit-line-1" />
              <div className="orbit-line orbit-line-2" />
              <div className="orbit-line orbit-line-3" />
              <div className="orbit-line orbit-line-4" />
              <div className="lisa-core">
                <span className="lisa-profile-mark lisa-profile-mark--core" aria-hidden="true">
                  <svg viewBox="0 0 48 48" focusable="false">
                    <circle cx="24" cy="24" r="18" />
                    <path d="M15 25h3l2.4-8 4.4 15 3.4-11 2.1 6H34" />
                    <path d="M18 37c3.8 2.1 8.2 2.1 12 0" />
                  </svg>
                </span>
                <strong>Lisa</strong>
                <small>AI assistant</small>
                <em>Listening</em>
              </div>
              <div className="orbit-tool tool-calendar">
                <b className="tool-g">31</b>
                <span>
                  <strong>Google Calendar</strong>
                  <small>Bookings</small>
                </span>
                <i>Connected</i>
              </div>
              <div className="orbit-tool tool-slack">
                <b className="tool-s">S</b>
                <span>
                  <strong>Slack</strong>
                  <small>Team alerts</small>
                </span>
                <i>Connected</i>
              </div>
              <div className="orbit-tool tool-crm">
                <b className="tool-c">C</b>
                <span>
                  <strong>Your CRM</strong>
                  <small>Customer records</small>
                </span>
                <i>Connected</i>
              </div>
              <div className="orbit-tool tool-mail">
                <b className="tool-m">@</b>
                <span>
                  <strong>Email</strong>
                  <small>Follow-ups</small>
                </span>
                <i>Connected</i>
              </div>
            </div>
            <div className="integration-event">
              <span className="event-check">✓</span>
              <div>
                <strong>Appointment workflow completed</strong>
                <small>Calendar booked · CRM updated · team notified</small>
              </div>
              <time>Just now</time>
            </div>
          </div>
        </div>
      </header>

      <section className="lisa-channel-strip" aria-label="Lisa communication channels">
        <div className="lisa-container mx-auto max-w-6xl px-4 sm:px-6">
          <span>Customer calls</span>
          <i />
          <span>WhatsApp</span>
          <i />
          <span>Website chat</span>
          <i />
          <span>Email</span>
          <i />
          <strong>One shared assistant</strong>
        </div>
      </section>

      <section className="lisa-video-intro py-20" aria-labelledby="lisa-video-title">
        <div className="lisa-video-grid mx-auto max-w-6xl px-4 sm:px-6">
          {/* Static shell — real LiveAvatar SDK video-call wiring deferred, same as the homepage's voice-demo mockup */}
          <div className="lisa-video-stage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/uploads/lisa/june-hr-liveavatar.webp" alt="Lisa's current LiveAvatar video presenter" width={1280} height={720} />
            <div className="lisa-video-status">
              <i />
              <span>Lisa · Video identity</span>
              <strong>Ready</strong>
            </div>
          </div>
          <div className="lisa-video-copy">
            <p className="eyebrow mb-3">// Meet Lisa face to face</p>
            <h2 id="lisa-video-title" className="display-5">
              A human presence.
              <br />
              <span>The same connected intelligence.</span>
            </h2>
            <p>Lisa&apos;s current visual presenter is designed for natural video conversations. The same face now appears before and during website calls, while Lisa&apos;s connected workflows continue to handle the real work behind the conversation.</p>
            <ul>
              <li>
                <span>01</span>Natural face, voice and lip-sync
              </li>
              <li>
                <span>02</span>Live captions and clear AI disclosure
              </li>
              <li>
                <span>03</span>Calendar, CRM and human hand-off connected
              </li>
            </ul>
            <Button type="button" variant="brand" size="pill">
              Start a video chat
            </Button>
            <small>You will be speaking with an AI assistant. Microphone permission is required.</small>
          </div>
        </div>
      </section>

      <section className="py-20" id="scenario-lab">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Real situations</p>
              <h2 className="text-3xl font-bold md:text-4xl">See the work after the conversation.</h2>
            </div>
            <p className="text-ink-soft">Choose a situation. Each mockup shows what the customer says, what Lisa understands, which tools she uses, and what your team sees next.</p>
          </div>
          <ScenarioLab />
        </div>
      </section>

      <section className="lisa-tools-section py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Connections</p>
              <h2 className="text-3xl font-bold md:text-4xl">Use the tools you already trust.</h2>
            </div>
            <p className="text-ink-soft">Lisa can connect through approved APIs, webhooks, and automation platforms without forcing your team to replace everything.</p>
          </div>
          <div className="lisa-tools-grid">
            {TOOLS.map((t) => (
              <article key={t.title}>
                <span className={t.cls}>{t.icon}</span>
                <div>
                  <h3>{t.title}</h3>
                  <p>{t.body}</p>
                  <small>{t.small}</small>
                </div>
              </article>
            ))}
          </div>
          <p className="integration-disclaimer">Tool names describe possible integrations. Availability depends on the tool&apos;s API, your account plan, permissions, and the workflow we approve together.</p>
        </div>
      </section>

      <section className="py-20" id="lisa-pricing">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// One connected service</p>
              <h2 className="text-3xl font-bold md:text-4xl">Lisa, sold as one whole service.</h2>
            </div>
            <p className="text-ink-soft">
              Lisa isn&apos;t a pile of separate tools you have to stitch together. She&apos;s one monthly service — calls, WhatsApp, and web chat on one side, and your social media tools, apps, and CRMs connected on the other, all
              managed as a single subscription.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((t) => (
              <div key={t.name} className={t.featured ? "relative rounded-[22px] border border-editorial-accent p-8 shadow-lg" : "relative rounded-[22px] border border-line p-8"}>
                {t.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-heading px-3 py-1 text-xs font-semibold text-bg">{t.badge}</span>}
                <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">{t.name}</span>
                <div className="text-[2rem] font-extrabold text-heading">
                  {t.priceGhs}
                  <small className="ml-1 text-base font-medium text-ink-soft">/mo</small>
                </div>
                <div className="mb-3 text-[1.1rem] font-semibold text-ink-soft">
                  {t.priceUsd}
                  <small className="ml-[0.2rem] text-[0.85rem]">/mo</small>
                </div>
                <p className="mb-3 text-ink-soft">{t.tagline}</p>
                <ul className="mb-4">
                  {t.features.map((f) => (
                    <li key={f} className="relative py-[0.35rem] pl-6 text-ink-soft">
                      <span className="absolute left-0 font-bold text-editorial-accent" aria-hidden="true">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Button variant={t.featured ? "brand" : "brand-outline"} size="pill" className="w-full text-center" nativeButton={false} render={<a href="/book.html" />}>
                  Plan this tier
                </Button>
              </div>
            ))}

            <div className="relative rounded-[22px] border border-dashed border-line p-8">
              <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">Custom</span>
              <div className="mb-3 text-[2rem] font-extrabold text-heading">Tailored quote</div>
              <p className="mb-3 text-ink-soft">A workflow built around your exact tools, volume, and compliance needs, priced once we&apos;ve scoped it.</p>
              <ul className="mb-4">
                {["Unlimited channels and integrations", "Custom-trained branded video avatar", "Dedicated workflows and safeguards", "A named point of contact"].map((f) => (
                  <li key={f} className="relative py-[0.35rem] pl-6 text-ink-soft">
                    <span className="absolute left-0 font-bold text-editorial-accent" aria-hidden="true">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Button variant="brand" size="pill" className="w-full text-center" nativeButton={false} render={<Link href="/contact" />}>
                Talk to us
              </Button>
            </div>
          </div>
          <p className="mt-4 text-center text-sm text-ink-soft">Monthly fee covers Lisa&apos;s connected service. Phone minutes, messaging, live video minutes, and AI usage beyond the agreed allowance are billed separately.</p>
        </div>
      </section>

      <section className="py-20">
        <div className="lisa-control-grid mx-auto max-w-6xl px-4 sm:px-6">
          <div>
            <p className="eyebrow mb-3">// Useful because it is controlled</p>
            <h2 className="display-5 mb-4">Lisa knows what she may do and when to stop.</h2>
            <p className="text-muted-custom">Each deployment receives its own knowledge, tools, permissions, escalation rules, tone, operating hours, and audit trail. The goal is reliable assistance, not uncontrolled autonomy.</p>
            <Link href="/ai-safety" className="text-link-arrow">
              See the safety approach <span>→</span>
            </Link>
          </div>
          <div className="permission-console">
            <header>
              <span>Lisa · Permissions</span>
              <strong>Client workspace</strong>
            </header>
            {PERMISSIONS.map((p) => (
              <div key={p.label}>
                <span>{p.label}</span>
                <em className={p.cls}>{p.state}</em>
              </div>
            ))}
            <footer>
              <i className="status-dot is-live" /> Every action is recorded
            </footer>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="lisa-build-card">
            <div>
              <p className="eyebrow mb-3">// Start with one real workflow</p>
              <h2>What should Lisa handle for your business?</h2>
              <p>Bring the calls, messages, spreadsheets, calendars, and handoffs your team deals with today. We will map the smallest useful version first.</p>
            </div>
            <div className="lisa-build-actions">
              <Button variant="brand" size="pill" className="border-0 bg-[#32ff82] text-center text-[#07100b]" nativeButton={false} render={<a href="/book.html" />}>
                Plan your Lisa workflow
              </Button>
              <Button variant="brand-outline" size="pill" className="border-[rgba(50,255,130,0.45)] text-center text-white" nativeButton={false} render={<Link href="/contact" />}>
                Ask a question
              </Button>
              <small>No generic package forced on your process.</small>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
