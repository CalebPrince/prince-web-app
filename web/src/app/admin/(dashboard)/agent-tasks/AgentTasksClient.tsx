"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { RefreshCw, Cpu, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import {
  PageHeader, Card, StatCard, Button, Tabs, StatusPill, ErrorBanner,
  formatDateTime, formatLabel,
} from "@/components/admin/ui";

export type AgentTask = {
  id: number;
  status: string;
  kind: string;
  agent_key: string;
  priority: number;
  reschedule_reason: string | null;
  due_at: string | null;
  attempts: number;
  max_attempts: number;
  entity_type: string | null;
  entity_id: number | null;
  outcome: string | null;
  last_error: string | null;
};

type Filter = "active" | "all" | "completed" | "failed" | "cancelled";

const STATUS_ICON: Record<string, typeof Cpu> = {
  leased: Cpu,
  completed: CheckCircle2,
  failed: AlertTriangle,
};

export default function AgentTasksClient({ initialTasks }: { initialTasks: AgentTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [filter, setFilter] = useState<Filter>("active");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const counts = useMemo(
    () => tasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {}),
    [tasks]
  );

  const visible = useMemo(
    () => tasks.filter((t) =>
      filter === "all"
        ? true
        : filter === "active"
          ? ["queued", "leased"].includes(t.status)
          : t.status === filter
    ),
    [tasks, filter]
  );

  const load = async () => {
    setRefreshing(true);
    try {
      const data = await adminApi.get<{ tasks: AgentTask[] }>("/api/v1/admin/agent-tasks");
      setTasks(data.tasks ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the agent queue.");
    } finally {
      setRefreshing(false);
    }
  };

  const mutate = async (id: number, action: "retry" | "cancel") => {
    try {
      await adminApi.post(`/api/v1/admin/agent-tasks/${id}/${action}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} the task.`);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="System"
        title="What the agents are working on."
        description="The durable task queue behind Beacon, Nurturer, Radar and the rest."
        actions={
          <Button variant="outline" onClick={load} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ready" value={counts.queued || 0} icon={<Clock className="w-4 h-4" />} />
        <StatCard label="Running" value={counts.leased || 0} icon={<Cpu className="w-4 h-4" />} />
        <StatCard label="Failed" value={counts.failed || 0} icon={<AlertTriangle className="w-4 h-4" />} />
        <StatCard label="Completed" value={counts.completed || 0} icon={<CheckCircle2 className="w-4 h-4" />} />
      </div>

      <Tabs<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "active", label: "Active", count: (counts.queued || 0) + (counts.leased || 0) },
          { value: "completed", label: "Completed", count: counts.completed || 0 },
          { value: "failed", label: "Failed", count: counts.failed || 0 },
          { value: "cancelled", label: "Cancelled", count: counts.cancelled || 0 },
          { value: "all", label: "All", count: tasks.length },
        ]}
      />

      {visible.length === 0 ? (
        <Card>
          <div className="px-6 py-12 text-center text-text-3">
            Nothing in the queue for this filter.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((task) => {
            const Icon = STATUS_ICON[task.status] ?? Clock;
            return (
              <article
                key={task.id}
                className="rounded-xl border border-hairline bg-bg-2 p-5 flex flex-col lg:flex-row gap-5"
              >
                <div className="flex lg:flex-col items-center lg:items-start gap-2 lg:w-32 flex-shrink-0">
                  <Icon className="w-5 h-5 text-text-3" />
                  <StatusPill status={task.status} />
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <strong className="text-base">{formatLabel(task.kind)}</strong>
                    <span className="text-sm text-text-2">{task.agent_key}</span>
                    <span className="text-xs text-text-3 uppercase tracking-wider">
                      Priority {task.priority}
                    </span>
                  </div>

                  <p className="text-sm text-text-2">
                    {task.reschedule_reason || "No scheduling reason recorded."}
                  </p>

                  <div className="text-xs text-text-3">
                    Due {formatDateTime(task.due_at)} · Attempt {task.attempts}/{task.max_attempts}
                    {task.entity_type && ` · ${formatLabel(task.entity_type)} #${task.entity_id}`}
                  </div>

                  {task.outcome && (
                    <div className="rounded-md bg-bg-3 px-3 py-2 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wider text-text-3 block mb-0.5">
                        Outcome
                      </span>
                      {task.outcome}
                    </div>
                  )}

                  {task.last_error && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                      <span className="text-xs font-semibold uppercase tracking-wider block mb-0.5">
                        Last error
                      </span>
                      {task.last_error}
                    </div>
                  )}
                </div>

                <div className="flex lg:flex-col gap-2 flex-shrink-0">
                  {["failed", "cancelled"].includes(task.status) && (
                    <Button variant="outline" onClick={() => mutate(task.id, "retry")}>Retry</Button>
                  )}
                  {["queued", "leased"].includes(task.status) && (
                    <Button variant="danger" onClick={() => mutate(task.id, "cancel")}>Cancel</Button>
                  )}
                  {task.entity_type === "pipeline_lead" && (
                    <Link
                      href={`/admin/pipeline?open=${task.entity_id}`}
                      className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
                    >
                      Open lead
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
