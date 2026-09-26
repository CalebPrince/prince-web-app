"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  Download,
  LayoutGrid,
  Users,
} from "lucide-react";

import {
  PageHeader,
  Card,
  StatCard,
  formatDateTime,
} from "@/components/admin/ui";

import {
  ChiefReport,
  ChiefBrief,
  ChiefDashboard,
} from "@/components/admin/ChiefReport";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type Capacity = {
  level?: string;
  active_projects?: number;
  overdue_projects?: number;
  due_soon?: number;
  next_deadline?: string | null;
  projects?: {
    id: number;
    title: string;
    next_deadline: string | null;
    is_overdue: boolean;
    progress_percent: number;
  }[];
};

export type Agent = {
  key: string;
  name: string;
  role: string;
  description: string;
  status: string;
  status_label: string;
  stat_value: number;
  stat_label: string;
  secondary_stat_value?: number | null;
  secondary_stat_label?: string;
  manage_url: string;
  manage_label: string;
  capacity?: Capacity;
};

export type ArchSite = {
  slug: string;
  business_name: string;
  business_type: string | null;
  client_name: string | null;
  client_email: string | null;
  revision_count: number;
  latest_feedback: string | null;
  latest_revision_at: string | null;
  created_at: string;
  has_cms: boolean;
  preview_url: string;
  download_url: string;
};

export type TeamData = {
  owner: {
    name: string;
    role: string;
    tagline: string;
    capacity?: Capacity;
  };
  agents: Agent[];
  arch_activity: ArchSite[];
  capacity_summary: {
    active_projects?: number;
    overdue_projects?: number;
    due_soon?: number;
    unassigned_projects?: number;
  };
};

/* -------------------------------------------------------------------------- */
/* Agent visual identities                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Drop the final portraits into:
 *
 * public/images/agents/lisa.webp
 * public/images/agents/jason.webp
 * public/images/agents/joan.webp
 * ...
 *
 * The visual identities are deliberately varied.
 * Do not turn these into identical corporate AI headshots.
 */
const AGENT_PROFILES: Record<
  string,
  {
    image: string;
    team: "growth" | "creative" | "operations";
    eyebrow?: string;
    position?: string;
  }
> = {
  lisa: {
    image: "/images/agents/lisa.webp",
    team: "growth",
    eyebrow: "Client experience",
    position: "center 25%",
  },

  nurturer: {
    image: "/images/agents/jason.webp",
    team: "growth",
    eyebrow: "Lifecycle marketing",
    position: "center 22%",
  },

  beacon: {
    image: "/images/agents/joan.webp",
    team: "growth",
    eyebrow: "Lead intelligence",
    position: "center 20%",
  },

  dossier: {
    image: "/images/agents/sharon.webp",
    team: "growth",
    eyebrow: "Research",
    position: "center 25%",
  },

  sage: {
    image: "/images/agents/sage.webp",
    team: "growth",
    eyebrow: "Marketing strategy",
    position: "center 20%",
  },

  proposal: {
    image: "/images/agents/ledger.webp",
    team: "creative",
    eyebrow: "Commercial",
    position: "center 22%",
  },

  sketch: {
    image: "/images/agents/sketch.webp",
    team: "creative",
    eyebrow: "Product design",
    position: "center 20%",
  },

  content: {
    image: "/images/agents/danielle.webp",
    team: "creative",
    eyebrow: "Content",
    position: "center 18%",
  },

  danielle: {
    image: "/images/agents/danielle.webp",
    team: "creative",
    eyebrow: "Content",
    position: "center 18%",
  },

  arch: {
    image: "/images/agents/arch.webp",
    team: "creative",
    eyebrow: "Web production",
    position: "center 20%",
  },

  reel: {
    image: "/images/agents/reel.webp",
    team: "creative",
    eyebrow: "Video creative",
    position: "center 18%",
  },

  ada: {
    image: "/images/agents/ada.webp",
    team: "operations",
    eyebrow: "Documents",
    position: "center 20%",
  },

  chief: {
    image: "/images/agents/chief.webp",
    team: "operations",
    eyebrow: "Command",
    position: "center 20%",
  },

  chloe: {
    image: "/images/agents/chloe.webp",
    team: "operations",
    eyebrow: "Technical operations",
    position: "center 18%",
  },

  wendy: {
    image: "/images/agents/wendy.webp",
    team: "operations",
    eyebrow: "Performance",
    position: "center 20%",
  },

  rocco: {
    image: "/images/agents/rocco.webp",
    team: "operations",
    eyebrow: "Lead quality",
    position: "center 20%",
  },

  allie: {
    image: "/images/agents/allie.webp",
    team: "operations",
    eyebrow: "AI strategy",
    position: "center 20%",
  },
};

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500",
  standby: "bg-amber-500",
  ondemand: "bg-sky-500",
  building: "bg-blue-500",
  paused: "bg-neutral-500",
  alert: "bg-red-500",
};

const CAPACITY_LABEL: Record<string, string> = {
  clear: "Clear",
  available: "Available",
  focused: "Focused",
  full: "At capacity",
};

const CAPACITY_TONE: Record<string, string> = {
  clear: "text-emerald-500",
  available: "text-emerald-500",
  focused: "text-amber-500",
  full: "text-red-500",
};

/** The API attaches an empty capacity object to every agent; only show the block when there is real project work. */
function hasCapacityData(capacity?: Capacity) {
  return (
    !!capacity &&
    (Number(capacity.active_projects || 0) > 0 ||
      Number(capacity.overdue_projects || 0) > 0 ||
      Number(capacity.due_soon || 0) > 0 ||
      (capacity.projects?.length ?? 0) > 0)
  );
}

function capacityDate(value?: string | null) {
  if (!value) return "No deadline set";

  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/* -------------------------------------------------------------------------- */
/* Capacity                                                                   */
/* -------------------------------------------------------------------------- */

function CapacityBlock({
  capacity,
  compact = false,
}: {
  capacity: Capacity;
  compact?: boolean;
}) {
  const level = capacity.level || "clear";

  return (
    <div className="rounded-xl border border-hairline bg-bg/70 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
            CAPACITY_TONE[level] ?? "text-text-3"
          }`}
        >
          {CAPACITY_LABEL[level] || "Clear"}
        </span>

        <strong className="text-xs tabular-nums">
          {Number(capacity.active_projects || 0)} active
        </strong>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-3">
        <span>{Number(capacity.overdue_projects || 0)} overdue</span>
        <span>{Number(capacity.due_soon || 0)} due in 14 days</span>
        <span>{capacityDate(capacity.next_deadline)}</span>
      </div>

      {!compact &&
        (capacity.projects?.length ? (
          <div className="space-y-1 pt-1">
            {capacity.projects.map((project) => (
              <Link
                key={project.id}
                href={`/admin/projects?edit=${project.id}`}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-bg-3"
              >
                <span className="truncate">{project.title}</span>

                <small
                  className={
                    project.is_overdue
                      ? "flex-shrink-0 text-red-500"
                      : "flex-shrink-0 text-text-3"
                  }
                >
                  {project.next_deadline
                    ? `${project.is_overdue ? "Overdue" : "Due"} ${capacityDate(
                        project.next_deadline
                      )}`
                    : `${Number(project.progress_percent)}% complete`}
                </small>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-3">
            No active project assignments.
          </p>
        ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Jev                                                                        */
/* -------------------------------------------------------------------------- */

type JevMode = "shadow" | "live" | "off";

/** Real state of the decision layer, read from the two admin decision APIs. */
export type JevStatus = {
  has_key: boolean;
  agents: { owner: JevMode; customer: JevMode; decisions: JevMode };
  lisa: { decisions: JevMode; followups: JevMode; quoting: JevMode } | null;
  recorded_7d: number;
  held: number;
};

const JEV_CAPABILITIES = [
  "Lisa message readings",
  "Cold follow-ups",
  "Price decisions",
  "Alert digest",
  "Customer send checks",
  "Reply classification",
  "Escalation assist",
  "Urgency ranking",
  "Evidence checks",
  "Spam checks",
];

const MODE_STYLE: Record<JevMode, { label: string; dot: string; text: string }> = {
  live: { label: "Live", dot: "bg-emerald-500", text: "text-emerald-500" },
  shadow: { label: "Shadow", dot: "bg-amber-500", text: "text-amber-500" },
  off: { label: "Off", dot: "bg-neutral-500", text: "text-text-3" },
};

function jevHeadline(status: JevStatus | null): { label: string; dot: string } {
  if (!status) return { label: "Status unavailable", dot: "bg-neutral-500" };
  if (!status.has_key) return { label: "No TypeSafe key, idle", dot: "bg-red-500" };
  const modes: JevMode[] = [
    status.agents.owner,
    status.agents.customer,
    status.agents.decisions,
    ...(status.lisa ? [status.lisa.decisions, status.lisa.followups, status.lisa.quoting] : []),
  ];
  const live = modes.filter((m) => m === "live").length;
  if (live > 0) return { label: `Live in ${live} of ${modes.length} areas`, dot: "bg-emerald-500" };
  if (modes.some((m) => m === "shadow")) return { label: "Shadow: recording, not acting", dot: "bg-amber-500" };
  return { label: "Switched off", dot: "bg-neutral-500" };
}

function ModeTile({ label, mode }: { label: string; mode: JevMode | null }) {
  const style = mode ? MODE_STYLE[mode] : null;

  return (
    <div className="rounded-2xl border border-hairline bg-bg/70 p-4">
      <div className="text-xs text-text-3">{label}</div>

      <strong
        className={`mt-2 flex items-center gap-2 text-sm ${style ? style.text : "text-text-3"}`}
      >
        <span className={`h-2 w-2 rounded-full ${style ? style.dot : "bg-neutral-500"}`} />
        {style ? style.label : "Unavailable"}
      </strong>
    </div>
  );
}

function JevDecisionLayer({ status }: { status: JevStatus | null }) {
  const headline = jevHeadline(status);

  return (
    <section className="relative overflow-hidden rounded-3xl border border-accent/20 bg-bg-2">
      {/* subtle background */}
      <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-72 rounded-full bg-sky-500/5 blur-3xl" />

      <div className="relative grid gap-8 p-6 md:p-8 xl:grid-cols-[1.2fr_.8fr] xl:items-start">
        <div>
          <div className="mb-5 flex items-center gap-4">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent-soft text-accent">
              <BrainCircuit className="h-7 w-7" />

              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-bg-2">
                <span className={`h-2 w-2 rounded-full ${headline.dot}`} />
              </span>
            </div>

            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight">Jev</h2>

                <span className="rounded-full border border-accent/20 bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-accent">
                  Decision Layer
                </span>
              </div>

              <p className="flex items-center gap-2 text-sm text-text-3">
                <span className={`h-1.5 w-1.5 rounded-full ${headline.dot}`} />
                {headline.label}
              </p>
            </div>
          </div>

          <h3 className="max-w-2xl text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
            The decision layer behind the team.
          </h3>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-2 md:text-base">
            Jev makes the small judgments before agent work begins, and the AI providers only write
            the words afterwards. It reads Lisa&apos;s customer messages, decides which follow-ups
            and price quotes go out, rates what your agents send you, checks their messages to
            customers, and backs specific agent calls like escalations and recommendations. Every
            area starts in shadow mode, which records what it would do and changes nothing.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {JEV_CAPABILITIES.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-bg px-3 py-1.5 text-xs font-medium text-text-2"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                {item}
              </span>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/admin/agent-decisions"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline bg-bg px-3.5 text-sm font-medium transition-colors hover:border-accent/30 hover:bg-accent-soft hover:text-accent"
            >
              Agent decisions
              <ArrowUpRight className="h-4 w-4" />
            </Link>

            <Link
              href="/admin/lisa-decisions"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline bg-bg px-3.5 text-sm font-medium transition-colors hover:border-accent/30 hover:bg-accent-soft hover:text-accent"
            >
              Lisa decisions
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <ModeTile label="Messages to you" mode={status?.agents.owner ?? null} />
            <ModeTile label="Messages to customers" mode={status?.agents.customer ?? null} />
            <ModeTile label="Agent decisions" mode={status?.agents.decisions ?? null} />
            <ModeTile label="Lisa readings" mode={status?.lisa?.decisions ?? null} />
            <ModeTile label="Lisa follow-ups" mode={status?.lisa?.followups ?? null} />
            <ModeTile label="Lisa quoting" mode={status?.lisa?.quoting ?? null} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-hairline bg-bg/70 p-4">
              <div className="text-xs text-text-3">Recorded, last 7 days</div>
              <strong className="mt-2 block text-2xl font-semibold tabular-nums">
                {status ? status.recorded_7d.toLocaleString() : "n/a"}
              </strong>
            </div>

            <div className="rounded-2xl border border-hairline bg-bg/70 p-4">
              <div className="text-xs text-text-3">Held for the digest</div>
              <strong className="mt-2 block text-2xl font-semibold tabular-nums">
                {status ? status.held.toLocaleString() : "n/a"}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Portrait                                                                   */
/* -------------------------------------------------------------------------- */

function AgentPortrait({ agent }: { agent: Agent }) {
  const profile = AGENT_PROFILES[agent.key];
  const [failed, setFailed] = useState(false);

  // No profile, or the image failed to load: show the agent's initial instead of an empty box.
  if (!profile || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-accent-soft text-3xl font-semibold text-accent">
        {agent.name.trim().charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <Image
      src={profile.image}
      alt={`${agent.name}, ${agent.role}`}
      fill
      unoptimized
      sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
      className="object-cover transition-transform duration-500 group-hover:scale-[1.035]"
      style={{ objectPosition: profile.position || "center" }}
      onError={() => setFailed(true)}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Agent card                                                                 */
/* -------------------------------------------------------------------------- */

function AgentCard({ agent }: { agent: Agent }) {
  const profile = AGENT_PROFILES[agent.key];

  return (
    <article className="group overflow-hidden rounded-2xl border border-hairline bg-bg-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-lg">
      {/* Portrait */}
      <div className="relative h-52 overflow-hidden bg-bg-3 sm:h-56">
        <AgentPortrait agent={agent} />

        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />

        <div className="absolute left-4 top-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-white backdrop-blur-md">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                STATUS_COLOR[agent.status] ?? "bg-neutral-400"
              }`}
            />
            {agent.status_label}
          </span>
        </div>

        {profile?.eyebrow && (
          <div className="absolute bottom-4 left-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
            {profile.eyebrow}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-h-[330px] flex-col p-5">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">{agent.name}</h3>

          <p className="mt-0.5 text-xs font-medium text-accent">
            {agent.role}
          </p>

          <p className="mt-4 text-sm leading-6 text-text-2">
            {agent.description}
          </p>
        </div>

        {hasCapacityData(agent.capacity) && (
          <div className="mt-5">
            <CapacityBlock capacity={agent.capacity ?? {}} compact />
          </div>
        )}

        <div className="mt-auto pt-5">
          <div className="mb-4 border-t border-hairline pt-4">
            <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
              <div>
                <strong className="block text-2xl font-semibold tabular-nums tracking-tight">
                  {Number(agent.stat_value).toLocaleString()}
                </strong>

                <span className="text-[11px] text-text-3">
                  {agent.stat_label}
                </span>
              </div>

              {agent.secondary_stat_value != null && (
                <div>
                  <strong className="block text-lg font-semibold tabular-nums">
                    {Number(agent.secondary_stat_value).toLocaleString()}
                  </strong>

                  <span className="text-[11px] text-text-3">
                    {agent.secondary_stat_label}
                  </span>
                </div>
              )}
            </div>
          </div>

          <a
            href={agent.manage_url}
            className="flex h-10 w-full items-center justify-between rounded-xl border border-hairline bg-bg px-3.5 text-sm font-medium transition-colors hover:border-accent/30 hover:bg-accent-soft hover:text-accent"
          >
            {agent.manage_label}

            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Team group                                                                 */
/* -------------------------------------------------------------------------- */

function TeamGroup({
  eyebrow,
  title,
  description,
  agents,
}: {
  eyebrow: string;
  title: string;
  description: string;
  agents: Agent[];
}) {
  if (!agents.length) return null;

  return (
    <section>
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
            {eyebrow}
          </div>

          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>

          <p className="mt-1 max-w-2xl text-sm text-text-3">{description}</p>
        </div>

        <div className="inline-flex items-center gap-2 text-xs text-text-3">
          <Users className="h-4 w-4" />
          {agents.length} {agents.length === 1 ? "agent" : "agents"}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard key={agent.key} agent={agent} />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function TeamClient({
  team,
  initialBrief,
  initialDashboard,
  jev,
}: {
  team: TeamData;
  initialBrief: ChiefBrief | null;
  initialDashboard: ChiefDashboard;
  jev: JevStatus | null;
}) {
  const summary = team.capacity_summary ?? {};

  const growthAgents = team.agents.filter(
    (agent) => AGENT_PROFILES[agent.key]?.team === "growth"
  );

  const creativeAgents = team.agents.filter(
    (agent) => AGENT_PROFILES[agent.key]?.team === "creative"
  );

  const operationsAgents = team.agents.filter(
    (agent) => AGENT_PROFILES[agent.key]?.team === "operations"
  );

  const knownKeys = new Set(Object.keys(AGENT_PROFILES));

  const ungroupedAgents = team.agents.filter(
    (agent) => !knownKeys.has(agent.key)
  );

  return (
    <div className="space-y-12 pb-10">
      {/* Header */}
      <PageHeader
        kicker="AI Workforce"
        title="Meet the team."
        description="The agents running client experience, growth, creative production, delivery and operations across the studio."
      />

      {/* Jev */}
      <JevDecisionLayer status={jev} />

      {/* Delivery capacity */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Studio workload</h3>

            <p className="mt-1 text-xs text-text-3">
              Live delivery capacity across operational projects and milestones.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Active projects"
            value={Number(summary.active_projects || 0)}
          />

          <StatCard
            label="Overdue"
            value={Number(summary.overdue_projects || 0)}
          />

          <StatCard
            label="Due in 14 days"
            value={Number(summary.due_soon || 0)}
          />

          <StatCard
            label="Without AI support"
            value={Number(summary.unassigned_projects || 0)}
          />
        </div>
      </section>

      {/* Owner */}
      <section className="overflow-hidden rounded-2xl border border-hairline bg-bg-2">
        <div className="grid md:grid-cols-[auto_1fr]">
          <div className="flex items-center gap-4 border-b border-hairline p-5 md:border-b-0 md:border-r">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-xl font-bold text-accent">
              {(team.owner.name || "P").trim().charAt(0).toUpperCase()}
            </div>

            <div className="min-w-[190px]">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-3">
                Human in command
              </div>

              <h3 className="mt-1 text-lg font-semibold">{team.owner.name}</h3>

              <span className="text-xs text-accent">{team.owner.role}</span>
            </div>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <p className="text-sm leading-6 text-text-2">
              {team.owner.tagline}
            </p>

            <CapacityBlock capacity={team.owner.capacity ?? {}} />
          </div>
        </div>
      </section>

      {/* Team */}
      <TeamGroup
        eyebrow="01 / Growth"
        title="Growth & Client Experience"
        description="The front line: finding opportunities, understanding prospects, nurturing relationships and helping visitors become clients."
        agents={growthAgents}
      />

      <TeamGroup
        eyebrow="02 / Studio"
        title="Creative & Delivery"
        description="The production side of the workforce: turning opportunities into proposals, interfaces, websites, content and creative direction."
        agents={creativeAgents}
      />

      <TeamGroup
        eyebrow="03 / Command"
        title="Operations & Intelligence"
        description="The agents watching the system itself: documents, performance, technical health, lead quality, reporting and AI strategy."
        agents={operationsAgents}
      />

      {ungroupedAgents.length > 0 && (
        <TeamGroup
          eyebrow="04 / Additional"
          title="Additional agents"
          description="Agents connected to the studio that have not yet been assigned to a workforce group."
          agents={ungroupedAgents}
        />
      )}

      {/* Chief */}
      <section>
        <div className="mb-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
            Command intelligence
          </div>

          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            Chief&apos;s desk
          </h2>

          <p className="mt-1 text-sm text-text-3">
            Daily operational reporting from across the workforce.
          </p>
        </div>

        <ChiefReport
          initialBrief={initialBrief}
          initialDashboard={initialDashboard}
        />
      </section>

      {/* Arch activity */}
      <Card title="Arch site activity" bodyClassName="p-4 space-y-2">
        {team.arch_activity.length === 0 ? (
          <div className="py-10 text-center">
            <LayoutGrid className="mx-auto mb-2 h-7 w-7 text-text-3" />

            <strong className="block text-sm">
              No Arch sites recorded yet.
            </strong>

            <p className="mt-1 text-sm text-text-3">
              Generated sites and client revision requests will appear here.
            </p>
          </div>
        ) : (
          team.arch_activity.map((item) => {
            const revised = Number(item.revision_count || 0) > 0;

            return (
              <article
                key={item.slug}
                className="grid items-center gap-4 rounded-xl border border-hairline p-4 lg:grid-cols-[1fr_1fr_1.5fr_auto]"
              >
                <div className="min-w-0">
                  <strong className="block truncate text-sm">
                    {item.business_name}
                  </strong>

                  <small className="text-xs text-text-3">
                    {item.business_type || item.slug}
                  </small>
                </div>

                <div className="min-w-0">
                  <span className="block text-xs text-text-3">Client</span>

                  <strong className="block truncate text-sm">
                    {item.client_name ||
                      item.client_email ||
                      "Visitor details not provided"}
                  </strong>

                  {item.client_name && item.client_email && (
                    <small className="text-xs text-text-3">
                      {item.client_email}
                    </small>
                  )}
                </div>

                <div className="min-w-0">
                  <span className="block text-xs text-text-3">
                    {revised
                      ? `${Number(item.revision_count)} revision${
                          Number(item.revision_count) === 1 ? "" : "s"
                        }`
                      : "No revisions"}
                  </span>

                  <strong className="block truncate text-sm">
                    {revised
                      ? item.latest_feedback
                      : "Client accepted the first preview"}
                  </strong>

                  <small className="text-xs text-text-3">
                    {revised
                      ? `Last changed ${formatDateTime(
                          item.latest_revision_at
                        )}`
                      : `Built ${formatDateTime(item.created_at)}`}
                  </small>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  {item.has_cms && (
                    <span className="rounded bg-bg-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-2">
                      CMS
                    </span>
                  )}

                  <a
                    href={item.preview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline-strong px-3 text-sm font-medium transition-colors hover:bg-bg-3"
                  >
                    Preview
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>

                  <a
                    href={item.download_url}
                    title="Download deployable package"
                    aria-label="Download deployable package"
                    className="rounded-md border border-hairline-strong p-2 transition-colors hover:bg-bg-3"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>
              </article>
            );
          })
        )}
      </Card>
    </div>
  );
}