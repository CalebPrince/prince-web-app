/** Shared by the public page and admin editor. New keys intentionally avoid
 * reinterpreting the old mixed-service website_tier/pricing_tier settings. */
export const PLAN_NAMES = ["Basic", "Standard", "Premium"] as const;
export const PRICING_INTRO = "Choose a service, then compare Basic, Standard and Premium. Project prices are starting points; your final scope and quote are confirmed in writing before work begins.";

type Plan = { price: string; tagline: string; features: string };
type PricingService = { id: string; title: string; description: string; monthly?: boolean; plans: [Plan, Plan, Plan] };
const plan = (price: string, tagline: string, features: string): Plan => ({ price, tagline, features });

export const PRICING_SERVICES: PricingService[] = [
  {
    id: "design", title: "Website Design & UX/UI",
    description: "Standalone design for clients who need a clear direction and developer-ready layouts.",
    plans: [
      plan("From GHS 2,500", "A focused design for a small website.", "Up to 3 page designs\nResponsive layouts\n1 revision round\nDesign handover"),
      plan("From GHS 5,000", "A complete website experience to review before development.", "Up to 7 page designs\nResponsive layouts\nInteractive prototype\n2 revision rounds\nDesign handover"),
      plan("From GHS 9,000", "A reusable design foundation for a larger website.", "Up to 12 page designs\nResponsive layouts\nUser journey planning\nInteractive prototype\nComponent library\n3 revision rounds"),
    ],
  },
  {
    id: "websites", title: "Website Development",
    description: "Design and development are included, from responsive layouts to launch.",
    plans: [
      plan("From GHS 5,000", "A professional website that helps customers get in touch.", "Up to 5 pages\nResponsive design and development\nContact form\nBasic SEO\nLaunch and handover"),
      plan("From GHS 10,000", "A website your team can update as the business grows.", "Up to 10 pages\nResponsive design and development\nContent management system\nAnalytics\nBooking integration\nLaunch and handover"),
      plan("From GHS 18,000", "A larger website with more control and connected payments.", "Up to 20 pages\nResponsive design and development\nAdvanced content management\nPayment integration\nPerformance optimisation\nLaunch and handover"),
    ],
  },
  {
    id: "webapps", title: "Web Applications",
    description: "Custom tools, dashboards and portals built around your business workflows.",
    plans: [
      plan("From GHS 15,000", "Put one core workflow into a working application.", "One core workflow\nUser accounts\nBasic dashboard\nTesting and handover"),
      plan("From GHS 30,000", "Connect multiple workflows and the people who use them.", "Multiple workflows\nUser roles and permissions\nPayment integration\nUp to 2 integrations\nTesting and handover"),
      plan("From GHS 55,000", "Support a broader operation with deeper reporting.", "Multiple departments or customer types\nUser roles and permissions\nAdvanced reporting\nUp to 4 integrations\nTesting and handover"),
    ],
  },
  {
    id: "mobile", title: "Mobile Apps",
    description: "iOS and Android applications scoped around the journeys your customers need.",
    plans: [
      plan("From GHS 35,000", "Launch an MVP around one essential customer journey.", "iOS and Android MVP\nOne core journey\nBackend integration\nTesting and handover"),
      plan("From GHS 60,000", "Deliver a fuller mobile experience with connected operations.", "iOS and Android\nMultiple user journeys\nPayments\nPush notifications\nAdmin dashboard\nTesting and handover"),
      plan("From GHS 100,000", "Handle complex workflows and use beyond a constant connection.", "iOS and Android\nComplex workflows\nOffline functionality\nAdvanced integrations\nTesting and launch support"),
    ],
  },
  {
    id: "agents", title: "AI Agents",
    description: "Custom agent implementation. Phone, messaging and AI usage are billed separately.",
    plans: [
      plan("From GHS 5,000", "Answer common questions on one customer channel.", "One voice or chat channel\nApproved FAQs\nHuman handoff\nTesting before launch"),
      plan("From GHS 15,000", "Carry the conversation across voice and WhatsApp.", "Voice and WhatsApp\nBooking or CRM integration\nHuman handoff\nReporting\nTesting before launch"),
      plan("From GHS 25,000", "Coordinate multiple agents around your operation.", "Multiple agent workflows\nCustom dashboard\nAdvanced integrations\nPermissions and safeguards\nTesting before launch"),
    ],
  },
  {
    id: "automations", title: "Business Automations",
    description: "Connect existing tools and reduce the manual work between them.",
    plans: [
      plan("From GHS 3,000", "Automate one repeatable process.", "One workflow\nConnect up to 2 tools\nTesting and handover"),
      plan("From GHS 8,000", "Connect more processes with visibility when something needs attention.", "Up to 3 workflows\nConnect up to 4 tools\nAlerts and error handling\nTesting and handover"),
      plan("From GHS 18,000", "Build and monitor a broader set of business automations.", "Up to 6 workflows\nCustom API connections\nMonitoring dashboard\nAlerts and error handling\nTesting and handover"),
    ],
  },
  {
    id: "maintenance", title: "Website Maintenance", monthly: true,
    description: "Monthly care for an existing website, with a defined allowance for edits.",
    plans: [
      plan("GHS 1,000/month", "Keep the essentials maintained and monitored.", "Updates\nBackups\nUptime monitoring\n1 hour of edits per month"),
      plan("GHS 2,000/month", "Add regular security reviews and more editing time.", "Updates, backups and uptime monitoring\nSecurity checks\nMonthly report\n3 hours of edits per month"),
      plan("GHS 4,000/month", "More editing capacity with performance reviews and priority support.", "Updates, backups and uptime monitoring\nSecurity checks and monthly report\nPerformance reviews\nPriority support\n6 hours of edits per month"),
    ],
  },
];

export const PRICING_FIELDS = ["price", "tagline", "features"] as const;
export function pricingKey(service: string, tier: number, field: typeof PRICING_FIELDS[number]) {
  return `service_pricing_${service}_${tier}_${field}`;
}

export const PRICING_DEFAULTS: Record<string, string> = {
  service_pricing_intro: PRICING_INTRO,
  ...Object.fromEntries(PRICING_SERVICES.flatMap((service) =>
    service.plans.flatMap((tier, i) => PRICING_FIELDS.map((field) =>
      [pricingKey(service.id, i + 1, field), tier[field]]
    ))
  )),
};

export function pricingValue(content: Record<string, string> | null, key: string): string {
  return content?.[key]?.trim() || PRICING_DEFAULTS[key] || "";
}
