import { Metadata } from "next";
import { PageHeader, Card, Table, Row, Cell } from "@/components/admin/ui";

export const metadata: Metadata = {
  title: "Frontend Wording — Admin",
};

/** This page is a static reference — it reads no API and saves nothing. It
 *  documents the deliberately non-obvious language used on the public site so
 *  the copy stays consistent wherever it's edited from. */
const HERO_WORDING: [string, string, string][] = [
  [
    "Asymmetric Value Hero",
    "The hero section gives more value than it takes in space.",
    'It makes the first screen feel sharper than a standard "I build websites" intro by showing positioning, proof, and next action at once.',
  ],
  [
    "Without platform bloat or agency overhead",
    "Custom software without unnecessary systems, retainers, or slow handoffs.",
    "It tells serious clients they can get senior technical execution without paying for a large agency process they do not need.",
  ],
  [
    "Technical Archive",
    "A library of technical notes, case studies, and engineering decisions.",
    "It replaces the generic Blog label with something more credible for buyers who care about technical depth.",
  ],
  [
    "Production Logs Registry",
    "A record of shipped work, build notes, stacks, and outcomes.",
    "It frames projects as evidence of delivery instead of decorative portfolio thumbnails.",
  ],
  [
    "Live Demonstration Arena",
    "A place where the visitor can interact, share context, and move toward a booking.",
    "It turns the end of the homepage into an action space instead of another passive section.",
  ],
];

const GLOSSARY: { title: string; terms: [string, string][] }[] = [
  {
    title: "Archive & case study terms",
    terms: [
      [
        "Engineering deep-dives",
        "Longer explanations of how a problem was solved, including tradeoffs, architecture, speed, integrations, or deployment decisions.",
      ],
      [
        "Performance metrics",
        "Short proof points such as faster load times, clearer workflows, reduced manual work, better conversion paths, or delivery speed.",
      ],
      [
        "Text-driven case studies",
        "Project writeups that lead with context and results instead of relying on screenshots to do the selling.",
      ],
      ["Archive entry", "A single technical note or case-study item in the archive list."],
    ],
  },
  {
    title: "Project & delivery terms",
    terms: [
      [
        "Production log",
        "A shipped project described like a build record: what was built, what improved, and what stack supported it.",
      ],
      [
        "Performance badges",
        "Compact labels for outcomes, tools, platforms, timelines, or delivery strengths.",
      ],
      [
        "Stack badges",
        "Technology labels such as PHP, JavaScript, SQLite, Paystack, AI, WordPress, React, or React Native.",
      ],
      [
        "Outcome metrics",
        "Result-focused numbers or claims attached to a project, such as time saved, pages shipped, systems automated, or conversion paths improved.",
      ],
    ],
  },
  {
    title: "Demo & booking terms",
    terms: [
      [
        "AI context canvas",
        "The interactive space where a visitor can describe their idea and get guided toward useful next steps.",
      ],
      [
        "Direct scheduling engine",
        "The booking flow that turns interest into a real appointment without manual back-and-forth.",
      ],
      [
        "Response protocol",
        "The contact-page promise for how inquiries are handled, prioritized, and moved into the right next step.",
      ],
    ],
  },
  {
    title: "Positioning & pricing terms",
    terms: [
      [
        "Lean technical partner",
        "A developer who can think through product, design, backend, frontend, deployment, and integrations without adding a large team process.",
      ],
      [
        "Scope matrix",
        "A structured way to compare what each pricing tier includes, so clients can quickly understand the level of engagement.",
      ],
      [
        "Custom / Enterprise",
        "The pricing tier for projects that need deeper discovery, custom integrations, staged delivery, or support beyond the fixed packages.",
      ],
    ],
  },
];

export default function FrontendWordingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Content"
        title="Why the site says what it says."
        description="A reference guide for the language used across the public site."
      />

      <Card title="Homepage section language">
        <p className="px-6 pt-4 text-sm text-text-3">
          The big labels that shape how visitors understand the site.
        </p>
        <Table head={["Wording", "Plain meaning", "Why it is used"]}>
          {HERO_WORDING.map(([wording, meaning, why]) => (
            <Row key={wording}>
              <Cell className="font-medium text-text align-top">{wording}</Cell>
              <Cell className="text-text-2 align-top">{meaning}</Cell>
              <Cell className="text-text-2 !text-left align-top">{why}</Cell>
            </Row>
          ))}
        </Table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {GLOSSARY.map((group) => (
          <Card key={group.title} title={group.title} bodyClassName="p-5 space-y-4">
            {group.terms.map(([term, meaning]) => (
              <div key={term}>
                <h6 className="text-sm font-semibold mb-0.5">{term}</h6>
                <p className="text-sm text-text-2">{meaning}</p>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
