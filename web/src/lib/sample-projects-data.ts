// Illustrative service examples for the testimonials page's "What I build"
// section, NOT real client work and NOT attributed to any actual business.
// Ported verbatim from public/js/sample-projects-data.js.
export type SampleWireframe = "voice" | "agent" | "flow" | "chat" | "app";

export type SampleProjectGroup = {
  track: string;
  groupNote: string;
  wireframe: SampleWireframe;
  items: { business: string; headline: string; description: string; domain: string }[];
};

export const SAMPLE_PROJECTS: SampleProjectGroup[] = [
  {
    track: "AI voice agents",
    groupNote: "Answers and routes real phone calls, booking, triage, and callbacks, 24/7.",
    wireframe: "voice",
    items: [
      { business: "Dental clinic", headline: "After-hours call answering & booking", description: "Picks up when the front desk can't, checks real chair availability, and books the slot without a person in the loop.", domain: "dental-clinic.example" },
      { business: "Med spa", headline: "Appointment booking & rescheduling by phone", description: "Handles reschedules and cancellations over a normal phone call, then updates the calendar instantly.", domain: "med-spa.example" },
      { business: "Law firm", headline: "Call intake & callback scheduling", description: "Takes down the case type and urgency, then queues a callback with the right associate.", domain: "law-firm.example" },
      { business: "Auto repair shop", headline: "Service booking & status calls", description: "Books a bay, and can answer \"is my car ready\" without pulling a mechanic off the floor.", domain: "auto-repair.example" },
      { business: "Restaurant", headline: "Reservation line automation", description: "Handles party size, time, and dietary notes for a line that used to just ring out during rush.", domain: "restaurant.example" },
      { business: "Real estate agency", headline: "Inbound listing inquiry calls", description: "Qualifies a caller against a live listing and hands off a warm lead, not a voicemail.", domain: "real-estate.example" },
    ],
  },
  {
    track: "Autonomous AI agents",
    groupNote: "Runs a bounded task end-to-end in the background, research, outreach, follow-up.",
    wireframe: "agent",
    items: [
      { business: "B2B SaaS company", headline: "Lead scouting & qualification", description: "Watches for signals of buying intent and scores a lead before a rep ever sees it.", domain: "saas-startup.example" },
      { business: "Recruiting agency", headline: "Candidate outreach follow-up", description: "Sends the second and third follow-up so a recruiter's pipeline doesn't go cold.", domain: "recruiting.example" },
      { business: "E-commerce brand", headline: "Abandoned cart recovery agent", description: "Notices a cart sat untouched, waits the right amount of time, then nudges, no blanket blast.", domain: "ecommerce-brand.example" },
      { business: "Insurance broker", headline: "Renewal reminder agent", description: "Tracks policy end dates and starts the renewal conversation before it becomes urgent.", domain: "insurance-broker.example" },
      { business: "Events company", headline: "Sponsor outreach agent", description: "Works down a prospect list for the next event, drafting a pitch grounded in what each sponsor actually cares about.", domain: "events-co.example" },
      { business: "Wholesale distributor", headline: "Reorder prediction agent", description: "Flags accounts trending toward a reorder before they run out and call a competitor instead.", domain: "wholesale.example" },
    ],
  },
  {
    track: "Business automations",
    groupNote: "Connects the tools already in use so nothing has to be re-typed by hand.",
    wireframe: "flow",
    items: [
      { business: "Accounting firm", headline: "Client intake to CRM automation", description: "A submitted intake form lands directly in the CRM, fully tagged, with no copy-pasting.", domain: "accounting-firm.example" },
      { business: "Fitness studio", headline: "Class booking to calendar & reminders", description: "A booked class writes to the instructor's calendar and fires a reminder text on its own.", domain: "fitness-studio.example" },
      { business: "Property management co.", headline: "Maintenance request routing", description: "A tenant's request is triaged and routed to the right contractor automatically.", domain: "property-mgmt.example" },
      { business: "Nonprofit", headline: "Donor receipt & thank-you automation", description: "A donation triggers a receipt and a genuinely personal thank-you, same minute.", domain: "nonprofit-org.example" },
      { business: "Logistics company", headline: "Shipment status notifications", description: "A status change in the warehouse system becomes a customer text, without a dispatcher typing it.", domain: "logistics-co.example" },
      { business: "Clinic", headline: "Patient intake form to records sync", description: "A new-patient form populates the records system before the patient even sits down.", domain: "clinic.example" },
    ],
  },
  {
    track: "AI chatbots & assistants",
    groupNote: "Answers from the business's real content, with a clean handoff to a person when it should.",
    wireframe: "chat",
    items: [
      { business: "Online store", headline: "24/7 product & shipping FAQ chatbot", description: "Answers sizing, stock, and shipping questions instantly, and hands off anything it's unsure about.", domain: "online-store.example" },
      { business: "SaaS product", headline: "In-app onboarding assistant", description: "Walks a new user through their first setup instead of pointing them at a help center.", domain: "saas-product.example" },
      { business: "University", headline: "Admissions FAQ chatbot", description: "Handles the same twenty questions every applicant asks, freeing staff for the ones that need a human.", domain: "university.example" },
      { business: "Bank / fintech", headline: "Account support chatbot with human handoff", description: "Resolves routine account questions and escalates anything sensitive to a real agent, cleanly.", domain: "fintech-bank.example" },
      { business: "Travel agency", headline: "Itinerary Q&A assistant", description: "Answers \"what time is my transfer\" from the traveler's actual booking, not a generic script.", domain: "travel-agency.example" },
      { business: "Telecom provider", headline: "Billing support chatbot", description: "Explains a bill line-by-line and can start a dispute, without a hold-music call.", domain: "telecom.example" },
    ],
  },
  {
    track: "Custom websites & mobile apps",
    groupNote: "The platform, dashboard, or storefront the workflow above actually runs on.",
    wireframe: "app",
    items: [
      { business: "Boutique retail brand", headline: "E-commerce storefront", description: "A fast, custom storefront built around the actual product catalog, not a generic template.", domain: "boutique-retail.example" },
      { business: "Wellness studio", headline: "Booking web app", description: "Class schedules, instructor availability, and payments in one place instead of three tools.", domain: "wellness-studio.example" },
      { business: "Fintech startup", headline: "Expense tracking dashboard", description: "A real-time view of spend across teams, built on a custom API instead of a spreadsheet export.", domain: "fintech-startup.example" },
      { business: "Logistics startup", headline: "Driver mobile app", description: "A native-feel iOS/Android app for drivers to accept jobs and update status from the road.", domain: "logistics-startup.example" },
      { business: "Restaurant chain", headline: "Ordering & loyalty app", description: "Order-ahead and a loyalty program that actually shares data with the till, not a bolted-on plugin.", domain: "restaurant-chain.example" },
      { business: "Nonprofit", headline: "Donation & volunteer portal", description: "One portal for donations and volunteer sign-ups, replacing three disconnected forms.", domain: "nonprofit-portal.example" },
    ],
  },
];
