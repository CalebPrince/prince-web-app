"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { RefreshCw, ShieldCheck, Play, Gauge, AlertTriangle, ListChecks } from "lucide-react";
import {
  PageHeader, Card, StatCard, Button, Tabs, StatusPill, ErrorBanner,
  formatDateTime, formatLabel,
} from "@/components/admin/ui";

type GateCost = {
  gate_per_call: number | null;
  full_per_call: number | null;
  calls: number;
  skipped: number;
  would_skip: number;
  gate_spend: number | null;
  actual_saved: number | null;
  actual_net: number | null;
  projected_saved: number | null;
  projected_net: number | null;
};

const usd = (n: number | null) => (n === null ? "Not set" : `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`);

type SweepRow = { threshold: number; rejected: number; saved_pct: number; missed: number; current: boolean };
type KindStats = { candidates: number; qualified: number; sweep: SweepRow[] };

export type RoccoOverview = {
  report: {
    mode: "shadow" | "enforce" | "off";
    has_key: boolean;
    table_missing: boolean;
    total: number;
    first_logged_at: string | null;
    min_sample: number;
    sample: number;
    score_threshold: number;
    competitor_cutoff: number;
    kinds: Record<string, KindStats>;
    cost: GateCost | null;
    verdict: "collecting" | "safe" | "low_value" | "not_yet" | "not_worth_it" | "needs_migration";
    verdict_text: string;
  };
  recommendations: Recommendation[];
  reports: RoccoReport[];
  review_enabled: boolean;
  review_frequency: string;
  last_review_at: string | null;
};

type Recommendation = {
  id: number;
  category: string;
  summary: string;
  detail: string;
  evidence: string;
  action: "none" | "enforce" | "shadow" | "off" | "threshold";
  action_value: string | null;
  wants_attention: number;
  status: "open" | "applied" | "resolved" | "dismissed";
  created_at: string;
  resolved_at: string | null;
};

type RoccoReport = {
  id: number;
  verdict: string;
  summary: string;
  total: number;
  mode: string;
  created_at: string;
};

type Filter = "open" | "closed" | "all";

const VERDICT_STYLE: Record<string, string> = {
  safe: "border-emerald-500/30 bg-emerald-500/10",
  not_yet: "border-red-500/30 bg-red-500/10",
  low_value: "border-amber-500/30 bg-amber-500/10",
  not_worth_it: "border-amber-500/30 bg-amber-500/10",
  needs_migration: "border-red-500/30 bg-red-500/10",
  collecting: "border-hairline bg-bg-2",
};

const VERDICT_TITLE: Record<string, string> = {
  safe: "Safe to enforce",
  not_yet: "Not safe yet",
  low_value: "Safe, but small saving",
  not_worth_it: "Safe, but not worth the cost",
  needs_migration: "Setup needed",
  collecting: "Still collecting data",
};

const KIND_LABEL: Record<string, string> = {
  post: "Social posts (Beacon cron)",
  engagement: "LinkedIn engagers",
};

export default function RoccoClient({ initialOverview }: { initialOverview: RoccoOverview }) {
  const [data, setData] = useState(initialOverview);
  const [filter, setFilter] = useState<Filter>("open");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const { report } = data;

  const current = useMemo(() => {
    let rejected = 0;
    let missed = 0;
    for (const k of Object.values(report.kinds)) {
      const row = k.sweep.find((r) => r.current);
      if (row) {
        rejected += row.rejected;
        missed += row.missed;
      }
    }
    return {
      savedPct: report.total > 0 ? Math.round((rejected / report.total) * 100) : 0,
      missed,
    };
  }, [report]);

  const openCount = data.recommendations.filter((r) => r.status === "open").length;
  const visible = data.recommendations.filter((r) =>
    filter === "all" ? true : filter === "open" ? r.status === "open" : r.status !== "open"
  );

  const load = async () => {
    setRefreshing(true);
    try {
      setData(await adminApi.get<RoccoOverview>("/api/v1/admin/rocco/overview"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Rocco's report.");
    } finally {
      setRefreshing(false);
    }
  };

  const act = async (key: string, path: string, done?: string) => {
    setBusy(key);
    setNote(null);
    try {
      await adminApi.post(path);
      if (done) setNote(done);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Lead gate"
        title="Who Rocco is letting through."
        description={"Rocco stands at the door of Beacon's lead pipeline. He watches the TypeSafe gate in shadow "
          + "mode, reports how many expensive AI calls it would save and how many real leads it would wrongly "
          + "turn away, and recommends when it is safe to enforce."}
        actions={
          <>
            <Link href="/admin/agent-chat">
              <Button variant="outline">
                <ShieldCheck className="w-4 h-4" />
                Talk to Rocco
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => act("review", "/api/v1/admin/rocco/review", "Review finished. The new report and any recommendations are below.")}
              disabled={busy === "review"}
            >
              <Play className={`w-4 h-4 ${busy === "review" ? "animate-pulse" : ""}`} />
              {busy === "review" ? "Reviewing..." : "Run review now"}
            </Button>
            <Button variant="outline" onClick={load} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {note && <div className="rounded-md border border-hairline bg-bg-2 px-4 py-3 text-sm text-text-2">{note}</div>}

      <div className={`rounded-xl border p-5 space-y-1 ${VERDICT_STYLE[report.verdict] ?? VERDICT_STYLE.collecting}`}>
        <div className="text-xs font-semibold uppercase tracking-wider text-text-3">Verdict</div>
        <strong className="block text-lg">{VERDICT_TITLE[report.verdict] ?? formatLabel(report.verdict)}</strong>
        <p className="text-sm text-text-2">{report.verdict_text}</p>
        {!report.has_key && (
          <p className="text-sm text-text-2">
            No TypeSafe API key is saved yet. Add it under Settings, Integrations, or the gate stays idle.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Gate mode"
          value={formatLabel(report.mode)}
          icon={<ShieldCheck className="w-4 h-4" />}
          hint={report.mode === "shadow" ? "Watching, rejecting nothing" : undefined}
        />
        <StatCard
          label="Verdicts logged"
          value={report.total}
          icon={<ListChecks className="w-4 h-4" />}
          hint={report.sample < report.min_sample ? `${report.sample} of about ${report.min_sample} needed` : undefined}
        />
        <StatCard label="Calls it would save" value={`${current.savedPct}%`} icon={<Gauge className="w-4 h-4" />} />
        <StatCard
          label="Leads it would miss"
          value={current.missed}
          icon={<AlertTriangle className="w-4 h-4" />}
          hint="Real leads the full AI qualified"
        />
      </div>

      {report.cost && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">What it costs</h2>
          {report.cost.gate_per_call === null || report.cost.full_per_call === null ? (
            <Card>
              <div className="px-6 py-6 text-sm text-text-2 space-y-1">
                <p>
                  Rocco does not guess prices. Enter what one TypeSafe call costs and what one full Beacon AI
                  scoring call costs (both in US dollars) and this section shows whether the gate pays for itself.
                </p>
                <p>
                  <Link href="/admin/settings?tab=integrations" className="underline">
                    Enter them under Settings, Integrations
                  </Link>
                  . Calls made so far: {report.cost.calls}.
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Gate spend so far" value={usd(report.cost.gate_spend)} hint={`${report.cost.calls} calls`} />
              <StatCard
                label="Saved so far"
                value={usd(report.cost.actual_saved)}
                hint={`${report.cost.skipped} AI calls actually skipped`}
              />
              <StatCard label="Net so far" value={usd(report.cost.actual_net)} hint="Saved minus gate spend" />
              <StatCard
                label="Projected net (shadow)"
                value={usd(report.cost.projected_net)}
                hint={`If enforced over the ${report.sample} judged candidates`}
              />
            </div>
          )}
        </section>
      )}

      {Object.keys(report.kinds).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Threshold check</h2>
          <p className="text-sm text-text-3">
            Each row asks: if the gate rejected anything scoring below this number, how many expensive AI calls
            would be saved, and how many real leads would be lost? The current setting ({report.score_threshold},
            competitor cutoff {report.competitor_cutoff}) is marked. Change either under Settings, Integrations, or
            ask Rocco.
          </p>
          {Object.entries(report.kinds).map(([kind, k]) => (
            <Card key={kind} title={`${KIND_LABEL[kind] ?? formatLabel(kind)}: ${k.candidates} judged, ${k.qualified} real leads`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-text-3">
                      <th className="px-5 py-2">Score below</th>
                      <th className="px-5 py-2">Rejected</th>
                      <th className="px-5 py-2">Calls saved</th>
                      <th className="px-5 py-2">Leads missed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {k.sweep.map((row) => (
                      <tr key={row.threshold} className={`border-t border-hairline ${row.current ? "bg-bg-3" : ""}`}>
                        <td className="px-5 py-2">
                          {row.threshold.toFixed(2)}
                          {row.current && <span className="ml-2 text-xs text-text-3">current</span>}
                        </td>
                        <td className="px-5 py-2">{row.rejected}</td>
                        <td className="px-5 py-2">{row.saved_pct}%</td>
                        <td className={`px-5 py-2 ${row.missed > 0 ? "text-red-400" : ""}`}>{row.missed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Recommendations</h2>
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: "Open", count: openCount },
            { value: "closed", label: "Closed", count: data.recommendations.length - openCount },
            { value: "all", label: "All", count: data.recommendations.length },
          ]}
        />
        {visible.length === 0 ? (
          <Card>
            <div className="px-6 py-10 text-center text-text-3">
              {filter === "open"
                ? "Nothing to decide. Rocco has no open recommendation, or his review has not run yet."
                : "No recommendations match this filter."}
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {visible.map((r) => (
              <article key={r.id} className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill status={r.status} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-3">{formatLabel(r.category)}</span>
                    {r.wants_attention ? <span className="text-xs font-semibold text-accent">Needs your attention</span> : null}
                  </div>
                  <div className="text-xs text-text-3">
                    {formatDateTime(r.created_at)}
                    {r.resolved_at && ` · Closed ${formatDateTime(r.resolved_at)}`}
                  </div>
                </div>
                <strong className="block text-base">{r.summary}</strong>
                <p className="text-sm text-text-2 whitespace-pre-line">{r.detail}</p>
                <p className="text-xs text-text-3 whitespace-pre-line">
                  <strong>Based on: </strong>
                  {r.evidence}
                </p>
                {r.status === "open" && (
                  <div className="flex flex-wrap gap-2">
                    {r.action !== "none" && (
                      <Button
                        onClick={() => act(`apply-${r.id}`, `/api/v1/admin/rocco/recommendations/${r.id}/apply`, r.action === "threshold" ? `Score threshold set to ${r.action_value}.` : `Gate mode set to ${r.action}.`)}
                        disabled={busy === `apply-${r.id}`}
                      >
                        {r.action === "threshold"
                          ? `Apply: set score threshold to ${r.action_value}`
                          : `Apply: set gate to ${r.action}`}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => act(`dismiss-${r.id}`, `/api/v1/admin/rocco/recommendations/${r.id}/dismiss`)}
                      disabled={busy === `dismiss-${r.id}`}
                    >
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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Past reports</h2>
          <span className="text-xs text-text-3">
            {data.review_enabled
              ? `Scheduled ${data.review_frequency}${data.last_review_at ? `, last run ${formatDateTime(data.last_review_at)}` : ""}`
              : "Scheduled review is off. Turn it on under Settings, Site."}
          </span>
        </div>
        {data.reports.length === 0 ? (
          <Card>
            <div className="px-6 py-8 text-center text-text-3">No reports yet. Press Run review now to get the first one.</div>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.reports.map((rep) => (
              <article key={rep.id} className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill status={VERDICT_TITLE[rep.verdict] ?? rep.verdict} />
                    <span className="text-xs text-text-3">{rep.total} verdicts, mode {rep.mode}</span>
                  </div>
                  <div className="text-xs text-text-3">{formatDateTime(rep.created_at)}</div>
                </div>
                <p className="text-sm text-text-2 whitespace-pre-line">{rep.summary}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
