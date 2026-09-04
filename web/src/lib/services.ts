import {
  AppWindow,
  BarChart3,
  Bot,
  Boxes,
  CalendarCheck,
  Clock,
  Code2,
  Compass,
  FileText,
  Gauge,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  MessageSquare,
  MousePointerClick,
  Palette,
  PenTool,
  PhoneCall,
  Plug,
  Smartphone,
  UserRoundCheck,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface ServiceFeature {
  icon: LucideIcon;
  label: string;
}

export interface Service {
  id: string;
  no: string;
  icon: LucideIcon;
  title: string;
  tagline: string;
  body: string;
  features: ServiceFeature[];
}

/**
 * The four things the studio sells, in the order they are sold. The Services
 * page lays them out in full and the homepage runs them through the split
 * screen (SplitServices); both read from here so the copy cannot drift into
 * two versions of the offer.
 */
export const SERVICES: Service[] = [
  {
    id: "product-design",
    no: "01",
    icon: PenTool,
    title: "UX/UI & Product Design",
    tagline: "Clarity before code",
    body: "Digital products shaped from user needs and business goals into clear flows, confident interfaces and reusable design systems ready for development.",
    features: [
      { icon: Compass, label: "Product strategy and user flows" },
      { icon: MousePointerClick, label: "Wireframes and interactive prototypes" },
      { icon: Palette, label: "UX/UI design and visual direction" },
      { icon: Layers, label: "Reusable product design systems" },
    ],
  },
  {
    id: "ai-agents",
    no: "02",
    icon: Bot,
    title: "AI Agents",
    tagline: "Voice & chat agents",
    body: "Voice and chat agents that answer customers, qualify enquiries, manage bookings and hand over to your team when human judgement matters.",
    features: [
      { icon: PhoneCall, label: "24/7 call answering & booking" },
      { icon: UserRoundCheck, label: "Lead qualification" },
      { icon: CalendarCheck, label: "Books directly into your calendar" },
      { icon: MessageSquare, label: "Voice + WhatsApp handoff" },
    ],
  },
  {
    id: "automations",
    no: "03",
    icon: Workflow,
    title: "Business Automations",
    tagline: "Kill the manual work",
    body: "Connect the tools you already use and kill the manual work between them, enquiries into your CRM, bookings into invoices, events into email, running quietly on schedule.",
    features: [
      { icon: Plug, label: "Enquiries into your CRM" },
      { icon: FileText, label: "Bookings into invoices" },
      { icon: Zap, label: "Instant missed-lead follow-up" },
      { icon: Clock, label: "Scheduled, hands-off workflows" },
    ],
  },
  {
    id: "websites-apps",
    no: "04",
    icon: AppWindow,
    title: "Custom Websites & Mobile Apps",
    tagline: "Built around your workflow",
    body: "Fast websites, focused web platforms and mobile applications built around how your customers and team actually work.",
    features: [
      { icon: Gauge, label: "Fast, performance-first sites" },
      { icon: LayoutGrid, label: "Focused web platforms" },
      { icon: Smartphone, label: "Native-feel mobile apps" },
      { icon: UserRoundCheck, label: "Designed around real workflows" },
    ],
  },
];

/**
 * The four things the homepage leads with, in the order it leads with them.
 * The Services page carries the fuller packaged offers (SERVICES above); this is the
 * wider view of the practice, which is what the homepage has always shown.
 * The split screen (SplitServices) runs one per screen.
 */
export const HOME_SERVICES: Service[] = [
  {
    id: "product-design",
    no: "01",
    icon: PenTool,
    title: "UX/UI & Product Design",
    tagline: "Clarity before code",
    body: "Product strategy, user flows and interface systems that turn complex ideas into experiences people understand and enjoy using.",
    features: [
      { icon: Compass, label: "Product strategy and user flows" },
      { icon: LayoutGrid, label: "Wireframes and interface design" },
      { icon: MousePointerClick, label: "Interactive prototypes" },
      { icon: Layers, label: "Scalable design systems" },
    ],
  },
  {
    id: "development",
    no: "02",
    icon: Code2,
    title: "Development",
    tagline: "Built to still work next year",
    body: "Fast, scalable and maintainable web applications and digital platforms built to last.",
    features: [
      { icon: Gauge, label: "Performance-first builds" },
      { icon: AppWindow, label: "Web platforms and portals" },
      { icon: Smartphone, label: "Native-feel mobile apps" },
      { icon: FileText, label: "Maintainable, documented code" },
    ],
  },
  {
    id: "ai-experiences",
    no: "03",
    icon: Bot,
    title: "AI Experiences",
    tagline: "Agents that carry real work",
    body: "AI-powered interfaces, automation, intelligent agents and next-generation digital experiences.",
    features: [
      { icon: PhoneCall, label: "Voice and chat agents" },
      { icon: CalendarCheck, label: "24/7 answering and booking" },
      { icon: Workflow, label: "Workflow automation" },
      { icon: UserRoundCheck, label: "Handover when it matters" },
    ],
  },
  {
    id: "digital-products",
    no: "04",
    icon: Boxes,
    title: "Digital Products",
    tagline: "Built around the actual problem",
    body: "Custom digital products designed around real business problems and real people.",
    features: [
      { icon: Compass, label: "Product strategy and scoping" },
      { icon: LayoutDashboard, label: "Dashboards and client portals" },
      { icon: Lock, label: "Billing, auth and admin" },
      { icon: BarChart3, label: "Analytics that get read" },
    ],
  },
];
