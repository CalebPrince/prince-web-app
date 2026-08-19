"use client";

import { useState } from "react";
import { adminApi, asList } from "@/lib/api";
import { Play, Trash2, ShieldCheck, ShieldAlert, Check } from "lucide-react";
import {
  PageHeader, Card, Table, Row, Cell, EmptyRow, Button, IconButton,
  Input, StatusPill, ErrorBanner, formatDateTime,
} from "@/components/admin/ui";

type Finding = { finding: string; detail: string };

export type RoadmapRun = {
  id: number;
  url: string;
  final_url: string | null;
  reachable: boolean;
  score: number | null;
  error: string | null;
  created_at: string;
  signals?: {
    uses_https?: boolean;
    response_time_ms?: number | null;
    tracking_tags?: string[];
  };
  findings?: {
    summary: string;
    score: number;
    traffic: Finding[];
    conversion: Finding[];
    tracking: Finding[];
    recommendations: { title: string; detail: string }[];
  } | null;
};

function FindingList({ items }: { items?: Finding[] }) {
  if (!items?.length) {
    return <p className="text-sm text-text-3">Nothing flagged here.</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-hairline bg-bg px-3 py-2">
          <span className="text-sm font-medium block">{item.finding}</span>
          <p className="text-sm text-text-2 mt-0.5">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function RunResult({ run }: { run: RoadmapRun }) {
  const url = run.final_url || run.url;

  if (!run.reachable) {
    return (
      <Card>
        <div className="p-5">
          <ErrorBanner message={`Could not audit ${url}: ${run.error || "unreachable"}`} />
        </div>
      </Card>
    );
  }

  if (!run.findings) {
    return (
      <Card>
        <div className="p-5">
          <ErrorBanner
            message={`Site was reachable, but the AI narrative could not be generated: ${run.error || "unknown error"}`}
          />
        </div>
      </Card>
    );
  }

  const { findings } = run;
  const signals = run.signals ?? {};
  const tracking = signals.tracking_tags?.length ? signals.tracking_tags.join(", ") : "none detected";

  return (
    <Card>
      <div className="p-5 border-b border-hairline flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-text-3 uppercase tracking-wider mb-1">{url}</div>
          <h3 className="text-lg font-semibold">{findings.summary || "Roadmap findings"}</h3>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            signals.uses_https ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
          }`}
        >
          {signals.uses_https ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
          {signals.uses_https ? "HTTPS OK" : "No HTTPS"}
        </span>
      </div>

      <div className="grid lg:grid-cols-[1fr_20rem] divide-y lg:divide-y-0 lg:divide-x divide-hairline">
        <div className="p-5 space-y-5">
          <section>
            <h4 className="text-sm font-semibold">Traffic</h4>
            <p className="text-xs text-text-3 mb-2">Readiness signals, not visitor counts</p>
            <FindingList items={findings.traffic} />
          </section>

          <section>
            <h4 className="text-sm font-semibold">Conversion</h4>
            <p className="text-xs text-text-3 mb-2">What happens once someone lands</p>
            <FindingList items={findings.conversion} />
          </section>

          <section>
            <h4 className="text-sm font-semibold">Tracking</h4>
            <p className="text-xs text-text-3 mb-2">Detected tags: {tracking}</p>
            <FindingList items={findings.tracking} />
          </section>

          <div className="flex items-center justify-between rounded-lg bg-bg-3 px-4 py-3">
            <span className="text-sm font-medium">Overall growth score</span>
            <strong className="text-lg tabular-nums">{findings.score} / 100</strong>
          </div>
        </div>

        <aside className="p-5 space-y-3">
          <span className="text-xs font-semibold text-text-3 uppercase tracking-wider">
            Recommended next steps
          </span>
          {(findings.recommendations ?? []).map((r, i) => (
            <div key={i} className="flex gap-2.5">
              <Check className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-sm block">{r.title}</strong>
                <small className="text-text-3">{r.detail}</small>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-hairline pt-3 text-sm">
            <span className="text-text-3">Response time</span>
            <strong className="tabular-nums">
              {signals.response_time_ms != null ? `${signals.response_time_ms}ms` : "—"}
            </strong>
          </div>
        </aside>
      </div>
    </Card>
  );
}

export default function GrowthRoadmapClient({ initialRuns }: { initialRuns: RoadmapRun[] }) {
  const [runs, setRuns] = useState(initialRuns);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<RoadmapRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setRuns(asList<RoadmapRun>(await adminApi.get("/api/v1/admin/growth-roadmap")));
  };

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setError(null);
    try {
      setResult(await adminApi.post<RoadmapRun>("/api/v1/admin/growth-roadmap", { url }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the roadmap.");
    } finally {
      setRunning(false);
    }
  };

  const view = async (id: number) => {
    try {
      setResult(await adminApi.get<RoadmapRun>(`/api/v1/admin/growth-roadmap/${id}`));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that run.");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this roadmap run?")) return;
    try {
      await adminApi.del(`/api/v1/admin/growth-roadmap/${id}`);
      setRuns((prev) => prev.filter((r) => r.id !== id));
      setResult((prev) => (prev?.id === id ? null : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that run.");
    }
  };

  const statusFor = (r: RoadmapRun) => {
    if (!r.reachable) return <StatusPill status="unreachable" tone="red" />;
    if (r.score == null) return <StatusPill status="no AI narrative" tone="blue" />;
    return <StatusPill status="reachable" tone="green" />;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Leads & Clients"
        title="Audit a site before you pitch it."
        description="Runs a real fetch against a prospect's site, then turns the signals into a growth narrative."
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Card>
        <form onSubmit={run} className="p-5 flex flex-col sm:flex-row gap-3">
          <Input
            type="url"
            required
            value={url}
            placeholder="https://prospect-site.com"
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={running || !url} className="flex-shrink-0">
            <Play className="w-4 h-4" />
            {running ? "Running…" : "Run roadmap"}
          </Button>
        </form>
      </Card>

      {result && <RunResult run={result} />}

      <Card title="Past runs">
        <Table head={["Site", "Status", "Score", "Run at", "Actions"]}>
          {runs.length === 0 ? (
            <EmptyRow colSpan={5}>No roadmaps run yet.</EmptyRow>
          ) : (
            runs.map((r) => (
              <Row key={r.id}>
                <Cell>
                  <button
                    onClick={() => view(r.id)}
                    className="font-medium text-text hover:text-accent transition-colors text-left"
                  >
                    {r.final_url || r.url}
                  </button>
                </Cell>
                <Cell>{statusFor(r)}</Cell>
                <Cell className="tabular-nums text-text-2">
                  {r.score != null ? `${r.score} / 100` : "—"}
                </Cell>
                <Cell className="text-text-3 whitespace-nowrap">{formatDateTime(r.created_at)}</Cell>
                <Cell>
                  <div className="flex justify-end">
                    <IconButton title="Delete run" tone="danger" onClick={() => remove(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </Cell>
              </Row>
            ))
          )}
        </Table>
      </Card>
    </div>
  );
}
