// Technical Archive - practical case-study guides. Swap copy/entries freely.

export type Topic = 'Custom software' | 'Automation' | 'Web & mobile' | 'AI agents'

export interface Section {
  heading: string
  paras: string[]
}

export interface Article {
  slug: string
  title: string
  excerpt: string
  topic: Topic
  date: string // display date
  iso: string // for sorting
  readingTime: string
  takeaways: string[]
  body: Section[]
}

export const TOPICS: ('All' | Topic)[] = [
  'All',
  'Custom software',
  'Automation',
  'Web & mobile',
  'AI agents',
]

export const ARTICLES: Article[] = [
  {
    slug: 'ship-voice-agents-before-chat',
    title: 'Why I ship voice agents before chat',
    excerpt:
      'Voice forces you to solve latency and turn-taking first, the exact problems a chat interface quietly hides until launch day.',
    topic: 'AI agents',
    date: 'Aug 2026',
    iso: '2026-08-04',
    readingTime: '6 min',
    takeaways: [
      'Voice exposes latency and turn-taking on day one, not at launch.',
      'A clean hand-off to a human is a feature, not a fallback.',
      'Ship the hardest channel first and the easy ones come free.',
    ],
    body: [
      {
        heading: 'The problem with starting in chat',
        paras: [
          'Chat is forgiving. A half-second delay reads as "thinking", a clumsy reply can be re-read, and nobody notices if the model talks over itself. That forgiveness is exactly the trap, it lets real problems hide until the day you try to put the same agent on a phone call.',
          'Voice removes every hiding place. If the response is 800ms late, the caller starts talking. If turn-taking is wrong, the agent and the human collide. You feel the quality of the system in the first ten seconds.',
        ],
      },
      {
        heading: 'Solve the hard channel first',
        paras: [
          'When I build for a business that needs both a phone agent and a chatbot, I start with voice. Getting latency, interruption handling and intent detection right for a live call means the chat version is almost trivial by comparison, the hard constraints are already met.',
          'The pattern that consistently works: stream partial responses, detect barge-in so the caller can interrupt, and always keep a warm path to a human with full context attached.',
        ],
      },
      {
        heading: 'What this looks like in production',
        paras: [
          'For a recent retail client the voice agent answered in under two seconds, qualified the caller, and booked a fitting directly into the calendar. Anything it could not handle went to staff with a summarised transcript, no repeating themselves.',
        ],
      },
    ],
  },
  {
    slug: 'local-first-is-a-ux-feature',
    title: 'Local-first is a UX feature, not a backend detail',
    excerpt:
      'When the interface never waits on the network, the whole product feels different to use. Here is how I wire offline-first sync back to Postgres.',
    topic: 'Custom software',
    date: 'Jul 2026',
    iso: '2026-07-18',
    readingTime: '9 min',
    takeaways: [
      'Local-first is felt by users, not just engineers.',
      'Optimistic UI + background sync beats spinners everywhere.',
      'Conflict resolution is a product decision, not only a technical one.',
    ],
    body: [
      {
        heading: 'Speed you can feel',
        paras: [
          'The fastest network request is the one you never make. When reads and writes hit a local store first and sync in the background, every interaction is instant. No spinners, no disabled buttons, no "saving…" states that block the person using the app.',
          'Teams describe local-first products as "snappy" without ever knowing why. That feeling is the whole point.',
        ],
      },
      {
        heading: 'How the sync layer is wired',
        paras: [
          'Writes land in a local database immediately and enqueue a change. A background worker reconciles that queue with Postgres when the network is available, applying a clear conflict strategy, usually last-write-wins per field, with a merge path for anything that matters.',
          'The key discipline is treating conflict resolution as a product question. "What should happen if two people edit this at once?" has a business answer, and the code should reflect it.',
        ],
      },
    ],
  },
  {
    slug: 'design-token-contract-for-generated-ui',
    title: 'A design-token contract for generated UI',
    excerpt:
      'Give a model tokens instead of pixels and the output stays on-brand by construction. A practical recipe for generative section layouts.',
    topic: 'AI agents',
    date: 'Jun 2026',
    iso: '2026-06-29',
    readingTime: '7 min',
    takeaways: [
      'Constrain the model to tokens, not raw CSS values.',
      'On-brand output becomes the default, not a review step.',
      'A small contract beats a long style prompt every time.',
    ],
    body: [
      {
        heading: 'Pixels are the wrong interface',
        paras: [
          'Ask a model for a hero section and it will happily invent hex codes, arbitrary spacing and a new font scale. Each generation drifts a little further from the brand, and you spend your time correcting instead of shipping.',
          'The fix is to stop handing it pixels. Give it a vocabulary, your tokens, and let it compose only from that.',
        ],
      },
      {
        heading: 'The contract',
        paras: [
          'Expose a small, named set: colour roles, spacing steps, radius, type scale. The model chooses among them; it cannot type a raw value. Output that references only tokens is on-brand by construction, because every value it can reach was pre-approved.',
        ],
      },
    ],
  },
  {
    slug: 'automations-that-survive-real-teams',
    title: 'Automations that survive contact with a real team',
    excerpt:
      'Most automations break the moment someone edits a spreadsheet by hand. Building workflows that tolerate messy, human input.',
    topic: 'Automation',
    date: 'May 2026',
    iso: '2026-05-12',
    readingTime: '8 min',
    takeaways: [
      'Assume every input will be edited by hand eventually.',
      'Validate and quarantine bad data instead of crashing.',
      'Make failures visible and recoverable, not silent.',
    ],
    body: [
      {
        heading: 'The demo always works',
        paras: [
          'Automations look bulletproof in a demo because the data is clean. Then a real person renames a column, pastes a date in the wrong format, or leaves a field blank, and the whole chain falls over quietly.',
          'Durable automation assumes mess. It validates at every boundary, quarantines what it cannot understand, and keeps running for everything else.',
        ],
      },
      {
        heading: 'Design for recovery',
        paras: [
          'When something does fail, the team needs to see it and fix it without calling me. A visible queue of "needs attention" items, with a one-click retry, turns a broken automation into a minor chore instead of a crisis.',
        ],
      },
    ],
  },
  {
    slug: 'measuring-a-fast-website',
    title: 'What "fast" actually means for a business website',
    excerpt:
      'Lighthouse scores are a proxy, not the goal. The three metrics I optimise for and why they map to conversions.',
    topic: 'Web & mobile',
    date: 'Apr 2026',
    iso: '2026-04-03',
    readingTime: '5 min',
    takeaways: [
      'A perfect Lighthouse score is not the goal.',
      'Optimise time-to-first-interaction on real devices.',
      'Speed is a conversion lever, measured in revenue.',
    ],
    body: [
      {
        heading: 'The score is a proxy',
        paras: [
          'A green Lighthouse score is reassuring, but it is measured on an idealised device. Your customers are on a mid-range phone on patchy mobile data, that is the environment that decides whether they bounce.',
        ],
      },
      {
        heading: 'The three metrics that matter',
        paras: [
          'I optimise for how quickly the page becomes useful, how stable it is while loading, and how fast it responds to the first tap. Those three, measured on real hardware, are what map to conversions, not the synthetic number.',
        ],
      },
    ],
  },
  {
    slug: 'mobile-booking-flows-that-convert',
    title: 'Designing mobile booking flows that convert',
    excerpt:
      'A booking-first app lives or dies on the first three taps. Field notes from shipping a native-feel booking experience.',
    topic: 'Web & mobile',
    date: 'Mar 2026',
    iso: '2026-03-15',
    readingTime: '6 min',
    takeaways: [
      'The first three taps decide whether a booking happens.',
      'Show real availability, never a form that might fail.',
      'Reminders are part of the booking, not an afterthought.',
    ],
    body: [
      {
        heading: 'The first three taps',
        paras: [
          'On mobile, a booking either happens in the first three taps or it does not happen at all. Every extra field, every load, every moment of uncertainty is a chance to lose the customer.',
        ],
      },
      {
        heading: 'Show availability, not a form',
        paras: [
          'The flow that converts shows real, live availability up front, the customer picks a slot that is guaranteed to exist, rather than submitting a request and hoping. Confirmation and reminders are baked in so the booking actually turns into a visit.',
        ],
      },
    ],
  },
]

export function getArticle(slug: string) {
  return ARTICLES.find((a) => a.slug === slug)
}

export const LATEST_ARTICLES = [...ARTICLES]
  .sort((a, b) => b.iso.localeCompare(a.iso))
  .slice(0, 3)
