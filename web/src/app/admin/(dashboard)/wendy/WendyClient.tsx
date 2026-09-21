"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { RefreshCw, MessageSquareHeart, Eye, BellRing, ClipboardCheck } from "lucide-react";
import {
  PageHeader, Card, StatCard, Button, Tabs, StatusPill, ErrorBanner,
  formatDateTime, formatLabel,
} from "@/components/admin/ui";

export type WendyObservation = {
  id: number;
  category: "pattern" | "tension" | "mediation";
  summary: string;
  detail: string;
  evidence: string;
  wants_session: number;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  resolved_at: string | null;
};

export type WendyToolReview = {
  id: number;
  tool_name: string;
  recommendation: "adopt" | "pilot" | "reject" | null;
  recommendation_rationale: string | null;
  status: string;
  wendy_review_notes: string | null;
  wendy_reviewed_at: string | null;
  updated_at: string;
};

type Filter = "open" | "resolved" | "dismissed" | "all";

export default function WendyClient({
  initialObservations,
  initialReviews,
}: {
  initialObservations: WendyObservation[];
  initialReviews: WendyToolReview[];
}) {
  const [observations, setObservations] = useState(initialObservations);
  const [reviews, setReviews] = useState(initialReviews);
  const [filter, setFilter] = useState<Filter>("open");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissing, setDismissing] = useState<number | null>(null);

  const counts = useMemo(
    () => observations.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {}),
    [observations]
  );
  const wantsSession = observations.filter((o) => o.status === "open" && o.wants_session).length;

  const waitingReviews = reviews.filter((r) => r.status === "wendy_review");
  const doneReviews = reviews.filter((r) => r.wendy_review_notes);

  const visible = useMemo(
    () => observations.filter((o) => (filter === "all" ? true : o.status === filter)),
    [observations, filter]
  );

  const load = async () => {
    setRefreshing(true);
    try {
      const [obs, evals] = await Promise.all([
        adminApi.get<{ observations: WendyObservation[] }>("/api/v1/admin/wendy/observations"),
        adminApi.get<{ evaluations: WendyToolReview[] }>("/api/v1/admin/allie-evaluations"),
      ]);
      setObservations(obs.observations ?? []);
      setReviews(evals.evaluations ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Wendy's findings.");
    } finally {
      setRefreshing(false);
    }
  };

  const dismiss = async (id: number) => {
    setDismissing(id);
    try {
      await adminApi.post(`/api/v1/admin/wendy/observations/${id}/dismiss`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss that observation.");
    } finally {
      setDismissing(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Team coaching"
        title="What Wendy has noticed."
        description={"Patterns, tensions and mediations she has found across the team and the business, "
          + "plus her team-impact reviews of Allie's tool recommendations. She only messages you about "
          + "the ones that need a conversation. Everything else waits here."}
        actions={
          <>
            <Link href="/admin/agent-chat">
              <Button variant="outline">
                <MessageSquareHeart className="w-4 h-4" />
                Talk to Wendy
              </Button>
            </Link>
            <Button variant="outline" onClick={load} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open observations" value={counts.open || 0} icon={<Eye className="w-4 h-4" />} />
        <StatCard label="Wants a session" value={wantsSession} icon={<BellRing className="w-4 h-4" />} />
        <StatCard label="Tool reviews waiting" value={waitingReviews.length} icon={<ClipboardCheck className="w-4 h-4" />} />
        <StatCard label="Tool reviews done" value={doneReviews.length} icon={<MessageSquareHeart className="w-4 h-4" />} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Observations</h2>
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: "Open", count: counts.open || 0 },
            { value: "resolved", label: "Resolved", count: counts.resolved || 0 },
            { value: "dismissed", label: "Dismissed", count: counts.dismissed || 0 },
            { value: "all", label: "All", count: observations.length },
          ]}
        />

        {visible.length === 0 ? (
          <Card>
            <div className="px-6 py-12 text-center text-text-3">
              {filter === "open"
                ? "Nothing open. Wendy hasn't found anything worth flagging, or her scheduled review hasn't run yet."
                : "No observations match this filter."}
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {visible.map((o) => (
              <article key={o.id} className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill status={o.status} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-3">
                      {formatLabel(o.category)}
                    </span>
                    {o.wants_session ? (
                      <span className="text-xs font-semibold text-accent">Wants a session with you</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-text-3">
                    Noticed {formatDateTime(o.created_at)}
                    {o.resolved_at && ` · Closed ${formatDateTime(o.resolved_at)}`}
                  </div>
                </div>

                <strong className="block text-base">{o.summary}</strong>
                <p className="text-sm text-text-2 whitespace-pre-line">{o.detail}</p>
                <p className="text-xs text-text-3 whitespace-pre-line">
                  <strong>Based on: </strong>
                  {o.evidence}
                </p>

                {o.status === "open" && (
                  <div>
                    <Button variant="outline" onClick={() => dismiss(o.id)} disabled={dismissing === o.id}>
                      Dismiss
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tool reviews</h2>
        <p className="text-sm text-text-3">
          Allie's recommendations pass through Wendy for a team-impact read before they reach you on the
          Allie Reviews page.
        </p>
        {waitingReviews.length === 0 && doneReviews.length === 0 ? (
          <Card>
            <div className="px-6 py-8 text-center text-text-3">No tool reviews yet.</div>
          </Card>
        ) : (
          <div className="space-y-3">
            {[...waitingReviews, ...doneReviews.filter((r) => r.status !== "wendy_review")].map((r) => (
              <article key={r.id} className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill status={r.status === "wendy_review" ? "waiting for Wendy" : r.status} />
                    {r.recommendation && (
                      <span className="text-xs text-text-3">Allie recommends: {formatLabel(r.recommendation)}</span>
                    )}
                  </div>
                  <div className="text-xs text-text-3">
                    {r.wendy_reviewed_at
                      ? `Reviewed ${formatDateTime(r.wendy_reviewed_at)}`
                      : `Flagged ${formatDateTime(r.updated_at)}`}
                  </div>
                </div>
                <strong className="block text-base">{r.tool_name}</strong>
                {r.recommendation_rationale && (
                  <p className="text-sm text-text-2">{r.recommendation_rationale}</p>
                )}
                {r.wendy_review_notes && (
                  <p className="text-sm text-text-2">
                    <strong className="text-text-3">Wendy&apos;s review: </strong>
                    {r.wendy_review_notes}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
