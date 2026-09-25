"use client";

import { useMemo, useState } from "react";
import { adminApi } from "@/lib/api";
import { RefreshCw, CheckCircle2, XCircle, Compass as AllieIcon, Clock } from "lucide-react";
import {
  PageHeader, Card, StatCard, Button, Tabs, StatusPill, ErrorBanner,
  formatDateTime, formatLabel,
} from "@/components/admin/ui";

export type AllieEvaluation = {
  id: number;
  tool_name: string;
  vendor_url: string | null;
  category: string | null;
  discovery_note: string | null;
  evaluation_findings: string | null;
  test_notes: string | null;
  comparison_findings: string | null;
  recommendation: "adopt" | "pilot" | "reject" | null;
  recommendation_rationale: string | null;
  pilot_metric: string | null;
  pilot_owner: string | null;
  pilot_stop_loss: string | null;
  status: string;
  wendy_review_notes: string | null;
  wendy_reviewed_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

type Filter = "pending_approval" | "in_progress" | "approved" | "rejected" | "all";

const IN_PROGRESS_STATUSES = ["discovered", "evaluating", "tested", "compared", "recommended", "wendy_review"];

export default function AllieClient({ initialEvaluations }: { initialEvaluations: AllieEvaluation[] }) {
  const [evaluations, setEvaluations] = useState(initialEvaluations);
  const [filter, setFilter] = useState<Filter>("pending_approval");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [deciding, setDeciding] = useState<number | null>(null);

  const counts = useMemo(
    () => evaluations.reduce<Record<string, number>>((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    }, {}),
    [evaluations]
  );
  const inProgressCount = IN_PROGRESS_STATUSES.reduce((n, s) => n + (counts[s] || 0), 0);

  const visible = useMemo(
    () => evaluations.filter((e) =>
      filter === "all" ? true
        : filter === "in_progress" ? IN_PROGRESS_STATUSES.includes(e.status)
        : e.status === filter
    ),
    [evaluations, filter]
  );

  const load = async () => {
    setRefreshing(true);
    try {
      const data = await adminApi.get<{ evaluations: AllieEvaluation[] }>("/api/v1/admin/allie-evaluations");
      setEvaluations(data.evaluations ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Allie's evaluations.");
    } finally {
      setRefreshing(false);
    }
  };

  const decide = async (id: number, action: "approve" | "reject") => {
    setDeciding(id);
    try {
      await adminApi.post(`/api/v1/admin/allie-evaluations/${id}/${action}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} that evaluation.`);
    } finally {
      setDeciding(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="AI Strategy & Experiments"
        title="What Allie is tracking."
        description={"Ideas grounded in Allie K. Miller's public posts and interviews become practical tools, workflows, "
          + "or bounded experiments before Wendy checks their impact and they land here for your final call."}
        actions={
          <Button variant="outline" onClick={load} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Awaiting your call" value={counts.pending_approval || 0} icon={<Clock className="w-4 h-4" />} />
        <StatCard label="In progress" value={inProgressCount} icon={<AllieIcon className="w-4 h-4" />} />
        <StatCard label="Approved" value={counts.approved || 0} icon={<CheckCircle2 className="w-4 h-4" />} />
        <StatCard label="Rejected" value={counts.rejected || 0} icon={<XCircle className="w-4 h-4" />} />
      </div>

      <Tabs<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "pending_approval", label: "Awaiting approval", count: counts.pending_approval || 0 },
          { value: "in_progress", label: "In progress", count: inProgressCount },
          { value: "approved", label: "Approved", count: counts.approved || 0 },
          { value: "rejected", label: "Rejected", count: counts.rejected || 0 },
          { value: "all", label: "All", count: evaluations.length },
        ]}
      />

      {visible.length === 0 ? (
        <Card>
          <div className="px-6 py-12 text-center text-text-3">
            Nothing here — {filter === "pending_approval" ? "nothing waiting on your call right now." : "no evaluations match this filter."}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((evaluation) => (
            <article key={evaluation.id} className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill status={evaluation.status} />
                  {evaluation.category && (
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-3">
                      {evaluation.category}
                    </span>
                  )}
                  {evaluation.recommendation && (
                    <span className="text-xs text-text-3">Allie recommends: {formatLabel(evaluation.recommendation)}</span>
                  )}
                </div>
                <div className="text-xs text-text-3">
                  Updated {formatDateTime(evaluation.updated_at)}
                  {evaluation.decided_at && ` · Decided ${formatDateTime(evaluation.decided_at)}`}
                </div>
              </div>

              <strong className="block text-base">
                {evaluation.tool_name}
                {evaluation.vendor_url && (
                  <a
                    href={evaluation.vendor_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-xs font-normal text-accent underline"
                  >
                    site
                  </a>
                )}
              </strong>
              {evaluation.recommendation_rationale && (
                <p className="text-sm text-text-2">{evaluation.recommendation_rationale}</p>
              )}

              <div>
                <button
                  onClick={() => setExpanded(expanded === evaluation.id ? null : evaluation.id)}
                  className="text-xs text-text-3 underline hover:text-text-2"
                >
                  {expanded === evaluation.id ? "Hide details" : "Show details"}
                </button>
              </div>

              {expanded === evaluation.id && (
                <div className="space-y-2 text-sm text-text-2">
                  {evaluation.discovery_note && <p><strong className="text-text-3">Discovery: </strong>{evaluation.discovery_note}</p>}
                  {evaluation.evaluation_findings && <p><strong className="text-text-3">Evaluation: </strong>{evaluation.evaluation_findings}</p>}
                  {evaluation.test_notes && <p><strong className="text-text-3">Testing: </strong>{evaluation.test_notes}</p>}
                  {evaluation.comparison_findings && <p><strong className="text-text-3">Vs current stack: </strong>{evaluation.comparison_findings}</p>}
                  {(evaluation.pilot_metric || evaluation.pilot_owner || evaluation.pilot_stop_loss) && (
                    <p>
                      <strong className="text-text-3">Pilot plan: </strong>
                      {[
                        evaluation.pilot_metric && `metric — ${evaluation.pilot_metric}`,
                        evaluation.pilot_owner && `owner — ${evaluation.pilot_owner}`,
                        evaluation.pilot_stop_loss && `stop-loss — ${evaluation.pilot_stop_loss}`,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {evaluation.wendy_review_notes && (
                    <p>
                      <strong className="text-text-3">Wendy&apos;s review: </strong>
                      {evaluation.wendy_review_notes}
                      {evaluation.wendy_reviewed_at && ` (${formatDateTime(evaluation.wendy_reviewed_at)})`}
                    </p>
                  )}
                  {evaluation.decided_by && (
                    <p><strong className="text-text-3">Decided by: </strong>{evaluation.decided_by}</p>
                  )}
                </div>
              )}

              {evaluation.status === "pending_approval" && (
                <div className="flex items-center gap-3">
                  <Button onClick={() => decide(evaluation.id, "approve")} disabled={deciding === evaluation.id}>
                    <CheckCircle2 className="w-4 h-4" />
                    Approve
                  </Button>
                  <Button variant="outline" onClick={() => decide(evaluation.id, "reject")} disabled={deciding === evaluation.id}>
                    <XCircle className="w-4 h-4" />
                    Reject
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
