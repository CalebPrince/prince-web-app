"use client";

import Link from "next/link";
import { ArrowUpRight, Download, LayoutGrid } from "lucide-react";
import { PageHeader, Card, StatCard, formatDateTime } from "@/components/admin/ui";
import { ChiefReport, ChiefBrief, ChiefDashboard } from "@/components/admin/ChiefReport";

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
  owner: { name: string; role: string; tagline: string; capacity?: Capacity };
  agents: Agent[];
  arch_activity: ArchSite[];
  capacity_summary: {
    active_projects?: number;
    overdue_projects?: number;
    due_soon?: number;
    unassigned_projects?: number;
  };
};


const STATUS_COLOR: Record<string, string> = {
  active: "bg-green-500",
  standby: "bg-amber-500",
  ondemand: "bg-sky-500",
  building: "bg-blue-500",
  paused: "bg-neutral-500",
};

const CAPACITY_LABEL: Record<string, string> = {
  clear: "Clear",
  available: "Available",
  focused: "Focused",
  full: "At capacity",
};

const CAPACITY_TONE: Record<string, string> = {
  clear: "text-green-500",
  available: "text-green-500",
  focused: "text-amber-500",
  full: "text-red-500",
};

function capacityDate(value?: string | null) {
  if (!value) return "No deadline set";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}


function CapacityBlock({ capacity, compact = false }: { capacity: Capacity; compact?: boolean }) {
  const level = capacity.level || "clear";
  return (
    <div className="rounded-lg border border-hairline bg-bg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold uppercase tracking-wider ${CAPACITY_TONE[level] ?? "text-text-3"}`}>
          {CAPACITY_LABEL[level] || "Clear"}
        </span>
        <strong className="text-sm tabular-nums">
          {Number(capacity.active_projects || 0)} active
        </strong>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-3">
        <span>{Number(capacity.overdue_projects || 0)} overdue</span>
        <span>{Number(capacity.due_soon || 0)} due in 14 days</span>
        <span>{capacityDate(capacity.next_deadline)}</span>
      </div>

      {!compact &&
        (capacity.projects?.length ? (
          <div className="space-y-1 pt-1">
            {capacity.projects.map((p) => (
              <Link
                key={p.id}
                href={`/admin/projects?edit=${p.id}`}
                className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-bg-3 transition-colors"
              >
                <span className="truncate">{p.title}</span>
                <small className={p.is_overdue ? "text-red-500 flex-shrink-0" : "text-text-3 flex-shrink-0"}>
                  {p.next_deadline
                    ? `${p.is_overdue ? "Overdue" : "Due"} ${capacityDate(p.next_deadline)}`
                    : `${Number(p.progress_percent)}% complete`}
                </small>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-xs text-text-3">No active project assignments.</p>
        ))}
    </div>
  );
}

export default function TeamClient({
  team,
  initialBrief,
  initialDashboard,
}: {
  team: TeamData;
  initialBrief: ChiefBrief | null;
  initialDashboard: ChiefDashboard;
}) {
  const summary = team.capacity_summary ?? {};

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Overview"
        title="Who's on the team."
        description="You, plus the AI agents — with the workload each one is actually carrying."
      />

      <ChiefReport initialBrief={initialBrief} initialDashboard={initialDashboard} />

      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Delivery capacity</h3>
          <p className="text-xs text-text-3">
            Live workload from operational projects and milestones
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active projects" value={Number(summary.active_projects || 0)} />
          <StatCard label="Overdue" value={Number(summary.overdue_projects || 0)} />
          <StatCard label="Due in 14 days" value={Number(summary.due_soon || 0)} />
          <StatCard label="Without AI support" value={Number(summary.unassigned_projects || 0)} />
        </div>
      </div>

      <Card title="Owner" bodyClassName="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-accent-soft text-accent flex items-center justify-center text-lg font-bold flex-shrink-0">
            {(team.owner.name || "P").trim().charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-lg font-semibold">{team.owner.name}</h4>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent-soft text-accent">
                {team.owner.role}
              </span>
            </div>
            <p className="text-sm text-text-3 mt-0.5">{team.owner.tagline}</p>
          </div>
        </div>
        <CapacityBlock capacity={team.owner.capacity ?? {}} />
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-3">AI agents</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {team.agents.map((agent) => (
            <div
              key={agent.key}
              className="rounded-xl border border-hairline bg-bg-2 p-4 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h5 className="font-semibold truncate">{agent.name}</h5>
                  <div className="text-xs text-text-3">{agent.role}</div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap flex-shrink-0">
                  <span
                    className={`w-2 h-2 rounded-full ${STATUS_COLOR[agent.status] ?? "bg-neutral-500"}`}
                  />
                  {agent.status_label}
                </span>
              </div>

              <p className="text-sm text-text-2 flex-1">{agent.description}</p>

              <CapacityBlock capacity={agent.capacity ?? {}} compact />

              <div className="flex items-end justify-between gap-3 pt-1">
                <div>
                  <span className="text-lg font-semibold tabular-nums">
                    {Number(agent.stat_value).toLocaleString()}
                  </span>
                  <span className="text-xs text-text-3 ml-1.5">{agent.stat_label}</span>
                  {agent.secondary_stat_value != null && (
                    <div className="text-xs text-text-3">
                      {Number(agent.secondary_stat_value).toLocaleString()}{" "}
                      {agent.secondary_stat_label}
                    </div>
                  )}
                </div>
                <a
                  href={agent.manage_url}
                  className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-accent transition-colors whitespace-nowrap"
                >
                  {agent.manage_label}
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Card title="Arch site activity" bodyClassName="p-4 space-y-2">
        {team.arch_activity.length === 0 ? (
          <div className="py-8 text-center">
            <LayoutGrid className="w-7 h-7 mx-auto text-text-3 mb-2" />
            <strong className="block text-sm">No Arch sites recorded yet.</strong>
            <p className="text-sm text-text-3 mt-1">
              Generated sites and client revision requests will appear here.
            </p>
          </div>
        ) : (
          team.arch_activity.map((item) => {
            const revised = Number(item.revision_count || 0) > 0;
            return (
              <article
                key={item.slug}
                className="rounded-lg border border-hairline p-4 grid gap-4 lg:grid-cols-[1fr_1fr_1.5fr_auto] items-center"
              >
                <div className="min-w-0">
                  <strong className="block text-sm truncate">{item.business_name}</strong>
                  <small className="text-xs text-text-3">{item.business_type || item.slug}</small>
                </div>

                <div className="min-w-0">
                  <span className="text-xs text-text-3 block">Client</span>
                  <strong className="text-sm truncate block">
                    {item.client_name || item.client_email || "Visitor details not provided"}
                  </strong>
                  {item.client_name && item.client_email && (
                    <small className="text-xs text-text-3">{item.client_email}</small>
                  )}
                </div>

                <div className="min-w-0">
                  <span className="text-xs text-text-3 block">
                    {revised
                      ? `${Number(item.revision_count)} revision${Number(item.revision_count) === 1 ? "" : "s"}`
                      : "No revisions"}
                  </span>
                  <strong className="text-sm block truncate">
                    {revised ? item.latest_feedback : "Client accepted the first preview"}
                  </strong>
                  <small className="text-xs text-text-3">
                    {revised
                      ? `Last changed ${formatDateTime(item.latest_revision_at)}`
                      : `Built ${formatDateTime(item.created_at)}`}
                  </small>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.has_cms && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-bg-3 text-text-2">
                      CMS
                    </span>
                  )}
                  <a
                    href={item.preview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
                  >
                    Preview
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={item.download_url}
                    title="Download deployable package"
                    aria-label="Download deployable package"
                    className="p-2 rounded-md border border-hairline-strong hover:bg-bg-3 transition-colors"
                  >
                    <Download className="w-4 h-4" />
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
