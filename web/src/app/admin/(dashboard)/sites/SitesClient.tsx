"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader, Card, StatCard, StatusPill, formatDateTime } from "@/components/admin/ui";

export type Site = {
  id: number;
  slug: string;
  title: string;
  client_name: string | null;
  live_url: string | null;
  repo_url: string | null;
  stack: { name: string; icon: string }[];
  ssl_expires_at: string | null;
  domain_expires_at: string | null;
  domain_registrar: string | null;
  perf_desktop_score: number | null;
  perf_mobile_score: number | null;
  perf_lcp_ms: number | null;
  perf_cls: number | null;
  last_deployed_at: string | null;
  technical_checked_at: string | null;
  tracking_key: string | null;
  monitor_id: number | null;
  last_status: string | null;
  last_checked_at: string | null;
  uptime_24h: number | null;
  uptime_30d: number | null;
  avg_response_ms: number | null;
};

const SOON_MS = 14 * 24 * 60 * 60 * 1000;

function expiresSoon(value: string | null): boolean {
  if (!value) return false;
  const t = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").getTime();
  return !isNaN(t) && t - Date.now() < SOON_MS;
}

export default function SitesClient({ initialSites }: { initialSites: Site[] }) {
  const sites = initialSites;

  const stats = useMemo(() => {
    const monitored = sites.filter((s) => s.monitor_id);
    const down = monitored.filter((s) => s.last_status === "down").length;
    const expiring = sites.filter(
      (s) => expiresSoon(s.ssl_expires_at) || expiresSoon(s.domain_expires_at)
    ).length;
    return {
      total: sites.length,
      online: monitored.filter((s) => s.last_status === "up").length,
      issues: down + expiring,
    };
  }, [sites]);

  const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Portfolio"
        title="Is everything still up?"
        description="The live operational state of every site you've built and shipped."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Sites" value={stats.total} />
        <StatCard label="Online" value={stats.online} />
        <StatCard label="Issues" value={stats.issues} hint={stats.issues > 0 ? "Down, or SSL/domain expiring soon" : undefined} />
      </div>

      {sites.length === 0 ? (
        <Card>
          <div className="px-6 py-10 text-center text-text-3">
            No sites with a live URL yet. Add one on the Projects page.
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((site) => {
            const flagged = expiresSoon(site.ssl_expires_at) || expiresSoon(site.domain_expires_at);
            return (
              <Link key={site.id} href={`/admin/sites/${site.id}`} className="block">
                <div className="rounded-xl border border-hairline bg-bg hover:bg-bg-2/50 transition-colors p-5 h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-text">{site.title}</div>
                      {site.live_url && (
                        <div className="text-xs text-text-3 inline-flex items-center gap-1 mt-0.5">
                          {site.live_url.replace(/^https?:\/\//, "")}
                          <ArrowUpRight className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                    {site.monitor_id ? (
                      <StatusPill status={site.last_status ?? "waiting"} tone={site.last_status ? undefined : "blue"} />
                    ) : (
                      <StatusPill status="unmonitored" tone="neutral" />
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-4 text-sm">
                    <div>
                      <div className="text-text-3 text-xs uppercase tracking-wider">30d uptime</div>
                      <div className="tabular-nums font-medium">{pct(site.uptime_30d)}</div>
                    </div>
                    <div>
                      <div className="text-text-3 text-xs uppercase tracking-wider">Response</div>
                      <div className="tabular-nums font-medium">
                        {site.avg_response_ms != null ? `${site.avg_response_ms}ms` : "—"}
                      </div>
                    </div>
                  </div>

                  {flagged && (
                    <div className="mt-3 text-xs text-amber-500">
                      {expiresSoon(site.ssl_expires_at) && "SSL expiring soon"}
                      {expiresSoon(site.ssl_expires_at) && expiresSoon(site.domain_expires_at) && " · "}
                      {expiresSoon(site.domain_expires_at) && "Domain expiring soon"}
                    </div>
                  )}

                  {site.last_checked_at && (
                    <div className="mt-3 text-xs text-text-3">Last checked {formatDateTime(site.last_checked_at)}</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
