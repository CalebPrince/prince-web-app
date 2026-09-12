"use client";

import { useMemo, useState } from "react";
import { adminApi } from "@/lib/api";
import { RefreshCw, Search, Activity, AlertTriangle, CheckCircle2, Radio } from "lucide-react";
import {
  PageHeader, Card, StatCard, Button, Input, Tabs, StatusPill, ErrorBanner,
  formatDateTime, formatLabel,
} from "@/components/admin/ui";

export type ChloeIncident = {
  id: number;
  category: string;
  source_type: string;
  source_id: number;
  title: string;
  narrative: string;
  evidence_json: string;
  confidence: number;
  status: string;
  started_at: string;
  resolved_at: string | null;
  escalated_at: string | null;
  emailed_at: string | null;
  whatsapp_sent_at: string | null;
};

export type ChloeSnapshot = {
  monitors: { total: number; up: number; down: number };
  open_incidents_by_category: Record<string, number>;
  recent_incidents: unknown[];
  generated_at: string;
};

type Filter = "open" | "escalated" | "resolved" | "dismissed" | "all";

const OPEN_STATUSES = ["investigating", "confirmed", "escalated"];

export default function ChloeClient({
  initialIncidents,
  initialSnapshot,
  chloeName,
}: {
  initialIncidents: ChloeIncident[];
  initialSnapshot: ChloeSnapshot;
  chloeName: string;
}) {
  const [incidents, setIncidents] = useState(initialIncidents);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [filter, setFilter] = useState<Filter>("open");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const [siteQuery, setSiteQuery] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ narrative?: string; error?: string } | null>(null);

  const counts = useMemo(
    () => incidents.reduce<Record<string, number>>((acc, i) => {
      acc[i.status] = (acc[i.status] || 0) + 1;
      return acc;
    }, {}),
    [incidents]
  );
  const openCount = OPEN_STATUSES.reduce((n, s) => n + (counts[s] || 0), 0);

  const visible = useMemo(
    () => incidents.filter((i) =>
      filter === "all" ? true : filter === "open" ? OPEN_STATUSES.includes(i.status) : i.status === filter
    ),
    [incidents, filter]
  );

  const load = async () => {
    setRefreshing(true);
    try {
      const data = await adminApi.get<{ incidents: ChloeIncident[]; snapshot: ChloeSnapshot }>(
        "/api/v1/admin/chloe/incidents"
      );
      setIncidents(data.incidents ?? []);
      setSnapshot(data.snapshot);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Chloe's incidents.");
    } finally {
      setRefreshing(false);
    }
  };

  const dismiss = async (id: number) => {
    try {
      await adminApi.post(`/api/v1/admin/chloe/incidents/${id}/dismiss`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss the incident.");
    }
  };

  const investigateNow = async () => {
    const site = siteQuery.trim();
    if (!site) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const data = await adminApi.post<{ narrative?: string; error?: string }>(
        "/api/v1/admin/chloe/investigate",
        { site }
      );
      setCheckResult(data);
      await load();
    } catch (err) {
      setCheckResult({ error: err instanceof Error ? err.message : "Could not run the investigation." });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Technical Operations & Monitoring"
        title={`What ${chloeName} is watching.`}
        description={"Continuous investigation across every monitored site — DNS, HTTP status, cross-site "
          + "correlation, deployment timing. She escalates by email or WhatsApp only once she's confident and "
          + "the problem has actually persisted."}
        actions={
          <Button variant="outline" onClick={load} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sites up" value={snapshot.monitors.up} icon={<Radio className="w-4 h-4" />} />
        <StatCard label="Sites down" value={snapshot.monitors.down} icon={<AlertTriangle className="w-4 h-4" />} />
        <StatCard label="Open incidents" value={openCount} icon={<Activity className="w-4 h-4" />} />
        <StatCard label="Escalated" value={counts.escalated || 0} icon={<CheckCircle2 className="w-4 h-4" />} />
      </div>

      <Card title="Investigate a site now">
        <div className="space-y-3">
          <p className="text-sm text-text-2">
            Runs a fresh DNS check and HTTP probe against a monitored site right now, rather than waiting for
            the next cron pass.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={siteQuery}
              onChange={(e) => setSiteQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && investigateNow()}
              placeholder="Site name, project name, or URL"
              className="flex-1"
            />
            <Button variant="outline" onClick={investigateNow} disabled={checking || !siteQuery.trim()}>
              <Search className={`w-4 h-4 ${checking ? "animate-pulse" : ""}`} />
              {checking ? "Checking…" : "Check now"}
            </Button>
          </div>
          {checkResult && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${
                checkResult.error ? "border border-red-500/30 bg-red-500/10 text-red-400" : "bg-bg-3"
              }`}
            >
              {checkResult.error || checkResult.narrative}
            </div>
          )}
        </div>
      </Card>

      <Tabs<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "open", label: "Open", count: openCount },
          { value: "escalated", label: "Escalated", count: counts.escalated || 0 },
          { value: "resolved", label: "Resolved", count: counts.resolved || 0 },
          { value: "dismissed", label: "Dismissed", count: counts.dismissed || 0 },
          { value: "all", label: "All", count: incidents.length },
        ]}
      />

      {visible.length === 0 ? (
        <Card>
          <div className="px-6 py-12 text-center text-text-3">
            Nothing here — {filter === "open" ? "no open incidents right now." : "no incidents match this filter."}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((incident) => {
            let evidence: Record<string, unknown> = {};
            try {
              evidence = JSON.parse(incident.evidence_json || "{}");
            } catch {
              evidence = {};
            }
            return (
              <article key={incident.id} className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill status={incident.status} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-3">
                      {formatLabel(incident.category)}
                    </span>
                    <span className="text-xs text-text-3">Confidence {incident.confidence}%</span>
                  </div>
                  <div className="text-xs text-text-3">
                    Started {formatDateTime(incident.started_at)}
                    {incident.escalated_at && ` · Escalated ${formatDateTime(incident.escalated_at)}`}
                    {incident.resolved_at && ` · Resolved ${formatDateTime(incident.resolved_at)}`}
                  </div>
                </div>

                <strong className="block text-base">{incident.title}</strong>
                <p className="text-sm text-text-2">{incident.narrative}</p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setExpanded(expanded === incident.id ? null : incident.id)}
                    className="text-xs text-text-3 underline hover:text-text-2"
                  >
                    {expanded === incident.id ? "Hide evidence" : "Show evidence"}
                  </button>
                  {(incident.emailed_at || incident.whatsapp_sent_at) && (
                    <span className="text-xs text-text-3">
                      Notified via {[incident.emailed_at && "email", incident.whatsapp_sent_at && "WhatsApp"]
                        .filter(Boolean).join(" & ")}
                    </span>
                  )}
                </div>

                {expanded === incident.id && (
                  <pre className="rounded-md bg-bg-3 px-3 py-2 text-xs overflow-x-auto">
                    {JSON.stringify(evidence, null, 2)}
                  </pre>
                )}

                {!["resolved", "dismissed"].includes(incident.status) && (
                  <div>
                    <Button variant="outline" onClick={() => dismiss(incident.id)}>
                      Dismiss
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
