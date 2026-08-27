"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, GitBranch } from "lucide-react";
import { adminApi } from "@/lib/api";
import {
  PageHeader, Card, StatCard, Tabs, StatusPill, Button, ErrorBanner, formatDateTime,
} from "@/components/admin/ui";
import { Site } from "../SitesClient";

type SiteAnalytics = {
  days: number;
  pageviews: number;
  visitors: number;
  sessions: number;
  bounce_rate: number | null;
  pages_per_session: number | null;
  traffic_sources: Record<string, number>;
  top_pages: { path: string; views: number }[];
  conversions: { name: string; count: number }[];
};

type Tab = "overview" | "analytics" | "health" | "technical";
const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "analytics", label: "Analytics" },
  { value: "health", label: "Health" },
  { value: "technical", label: "Technical" },
];

const SOON_MS = 14 * 24 * 60 * 60 * 1000;
function expiresSoon(value: string | null): boolean {
  if (!value) return false;
  const t = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").getTime();
  return !isNaN(t) && t - Date.now() < SOON_MS;
}

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

export default function SiteDetailClient({ site }: { site: Site }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [settingUpMonitor, setSettingUpMonitor] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setUpMonitoring = async () => {
    if (!site.live_url) return;
    setSettingUpMonitor(true);
    setError(null);
    try {
      await adminApi.post("/api/v1/admin/uptime", { name: site.title, url: site.live_url, project_id: site.id });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set up monitoring.");
    } finally {
      setSettingUpMonitor(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker={site.client_name ?? "Site"}
        title={site.title}
        description={site.live_url ?? undefined}
        actions={
          <>
            {site.live_url && (
              <a href={site.live_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  Visit <ArrowUpRight className="w-4 h-4" />
                </Button>
              </a>
            )}
            {site.repo_url && (
              <a href={site.repo_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  <GitBranch className="w-4 h-4" /> Repo
                </Button>
              </a>
            )}
          </>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Tabs<Tab> value={tab} onChange={setTab} options={TABS} />

      {tab === "overview" && <OverviewTab site={site} />}
      {tab === "analytics" && <AnalyticsTab siteId={site.id} trackingKey={site.tracking_key} />}
      {tab === "health" && (
        <HealthTab site={site} onSetUpMonitoring={setUpMonitoring} settingUp={settingUpMonitor} />
      )}
      {tab === "technical" && <TechnicalTab site={site} />}
    </div>
  );
}

function OverviewTab({ site }: { site: Site }) {
  const flagged = expiresSoon(site.ssl_expires_at) || expiresSoon(site.domain_expires_at);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Status"
        value={site.monitor_id ? <StatusPill status={site.last_status ?? "waiting"} /> : <StatusPill status="unmonitored" tone="neutral" />}
      />
      <StatCard label="30d uptime" value={pct(site.uptime_30d)} />
      <StatCard
        label="Attention needed"
        value={flagged ? "Yes" : "No"}
        hint={flagged ? "Check the Technical tab" : undefined}
      />
      <StatCard
        label="Stack"
        value={site.stack.length > 0 ? site.stack.map((s) => s.name).join(", ") : "—"}
      />
    </div>
  );
}

function HealthTab({
  site,
  onSetUpMonitoring,
  settingUp,
}: {
  site: Site;
  onSetUpMonitoring: () => void;
  settingUp: boolean;
}) {
  if (!site.monitor_id) {
    return (
      <Card title="Uptime monitoring">
        <div className="p-6 flex items-center justify-between gap-4">
          <p className="text-text-2 text-sm">
            This site isn&apos;t monitored yet — set up a check so outages surface here instead of a client telling you.
          </p>
          <Button variant="primary" onClick={onSetUpMonitoring} disabled={settingUp || !site.live_url}>
            {settingUp ? "Setting up…" : "Set up monitoring"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Status" value={<StatusPill status={site.last_status ?? "waiting"} />} />
        <StatCard label="24h uptime" value={pct(site.uptime_24h)} />
        <StatCard label="30d uptime" value={pct(site.uptime_30d)} />
        <StatCard label="Avg response" value={site.avg_response_ms != null ? `${site.avg_response_ms}ms` : "—"} />
      </div>
      <Card title="SSL">
        <div className="p-6 flex items-center justify-between">
          <span className="text-text-2 text-sm">Certificate expiry</span>
          <span className={`font-medium tabular-nums ${expiresSoon(site.ssl_expires_at) ? "text-amber-500" : ""}`}>
            {formatDateTime(site.ssl_expires_at)}
          </span>
        </div>
      </Card>
      {site.last_checked_at && (
        <p className="text-xs text-text-3">Last checked {formatDateTime(site.last_checked_at)}</p>
      )}
    </div>
  );
}

function TechnicalTab({ site }: { site: Site }) {
  return (
    <div className="space-y-4">
      <Card title="Stack">
        <div className="p-6">
          {site.stack.length === 0 ? (
            <span className="text-text-3 text-sm">No stack tags set on this project yet.</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {site.stack.map((tech) => (
                <span key={tech.name} className="px-2.5 py-1 rounded-full text-xs font-medium bg-bg-3 text-text-2">
                  {tech.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Domain">
          <div className="p-6 space-y-3 text-sm">
            <Row label="Registrar" value={site.domain_registrar ?? "—"} />
            <Row
              label="Expires"
              value={formatDateTime(site.domain_expires_at)}
              warn={expiresSoon(site.domain_expires_at)}
            />
          </div>
        </Card>
        <Card title="Deployment">
          <div className="p-6 space-y-3 text-sm">
            <Row label="Last deployed" value={formatDateTime(site.last_deployed_at)} />
            <Row label="Last checked" value={formatDateTime(site.technical_checked_at)} />
          </div>
        </Card>
      </div>

      <Card title="Performance">
        <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Desktop" value={site.perf_desktop_score ?? "—"} />
          <StatCard label="Mobile" value={site.perf_mobile_score ?? "—"} />
          <StatCard label="LCP" value={site.perf_lcp_ms != null ? `${(site.perf_lcp_ms / 1000).toFixed(1)}s` : "—"} />
          <StatCard label="CLS" value={site.perf_cls ?? "—"} />
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-2">{label}</span>
      <span className={`font-medium tabular-nums ${warn ? "text-amber-500" : ""}`}>{value}</span>
    </div>
  );
}

function AnalyticsTab({ siteId, trackingKey }: { siteId: number; trackingKey: string | null }) {
  const [data, setData] = useState<SiteAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .get<SiteAnalytics>(`/api/v1/admin/sites/${siteId}/analytics?days=30`)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Could not load analytics."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (loading) return <p className="text-text-3 text-sm">Loading analytics…</p>;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  if (data.pageviews === 0) {
    return (
      <Card title="Analytics">
        <div className="p-6 text-sm text-text-2">
          No analytics yet. Add the tracking pixel to this site to start seeing visitors, sessions, and conversions here:
          <pre className="mt-3 p-3 rounded-md bg-bg-3 text-xs overflow-x-auto">
            {`<script async src="https://princecaleb.dev/js/pixel.js" data-site="${trackingKey ?? ""}"></script>`}
          </pre>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Visitors (30d)" value={data.visitors} />
        <StatCard label="Sessions" value={data.sessions} />
        <StatCard label="Bounce rate" value={pct(data.bounce_rate)} />
        <StatCard label="Pages / session" value={data.pages_per_session ?? "—"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Traffic sources">
          <div className="p-6 space-y-2 text-sm">
            {Object.entries(data.traffic_sources).map(([label, count]) => (
              <Row key={label} label={label} value={String(count)} />
            ))}
          </div>
        </Card>
        <Card title="Top pages">
          <div className="p-6 space-y-2 text-sm">
            {data.top_pages.length === 0 ? (
              <span className="text-text-3">No page views recorded.</span>
            ) : (
              data.top_pages.map((p) => <Row key={p.path} label={p.path} value={String(p.views)} />)
            )}
          </div>
        </Card>
      </div>

      <Card title="Conversions">
        <div className="p-6 space-y-2 text-sm">
          {data.conversions.length === 0 ? (
            <span className="text-text-3">No conversion events tracked yet.</span>
          ) : (
            data.conversions.map((c) => <Row key={c.name} label={c.name.replace(/_/g, " ")} value={String(c.count)} />)
          )}
        </div>
      </Card>
    </div>
  );
}
