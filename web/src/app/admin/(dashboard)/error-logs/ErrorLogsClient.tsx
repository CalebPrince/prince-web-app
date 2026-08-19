"use client";

import { useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/api";
import { RefreshCw, Trash2, Eraser } from "lucide-react";
import {
  PageHeader, Card, Button, IconButton, Select, Input,
  StatusPill, ErrorBanner, formatDateTime,
} from "@/components/admin/ui";

export type LogSource = {
  id: string;
  label: string;
  readable: boolean;
  writable: boolean;
  size: number;
  modified_at: string | null;
};

export type LogEntry = {
  entry_id: string;
  source_id: string;
  source_label: string;
  severity: string;
  timestamp: string | null;
  message: string;
};

export type ErrorLogResponse = {
  sources: LogSource[];
  entries: LogEntry[];
};

const SEVERITY_TONE: Record<string, "red" | "amber" | "blue" | "neutral"> = {
  fatal: "red",
  error: "red",
  warning: "amber",
  notice: "blue",
  info: "neutral",
};

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function ErrorLogsClient({ initial }: { initial: ErrorLogResponse }) {
  const [data, setData] = useState(initial);
  const [source, setSource] = useState("");
  const [severity, setSeverity] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const firstRender = useRef(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ source, severity, q: query.trim(), limit });
      setData(await adminApi.get<ErrorLogResponse>(`/api/v1/admin/error-logs?${qs}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the log files.");
    } finally {
      setLoading(false);
    }
  };

  // Debounced re-fetch: the text query types freely, the selects apply at once.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, severity, limit, query]);

  const deleteEntry = async (entry: LogEntry) => {
    if (!entry.source_id || !entry.entry_id) return;
    if (!confirm("Delete this log entry?")) return;
    try {
      await adminApi.post("/api/v1/admin/error-logs/delete-entry", {
        source_id: entry.source_id,
        entry_id: entry.entry_id,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that entry.");
    }
  };

  const clearLogs = async (clearAll: boolean) => {
    if (!clearAll && !source) {
      setError("Choose a single source first, or use Clear all.");
      return;
    }
    const label = clearAll ? "all writable log files" : "the selected log file";
    if (!confirm(`Clear ${label}? This cannot be undone.`)) return;
    try {
      await adminApi.post("/api/v1/admin/error-logs/clear", { source_id: clearAll ? "" : source });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear the logs.");
    }
  };

  const readable = data.sources.filter((s) => s.readable);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="System"
        title="What broke, and when."
        description="Reads the PHP, application and storage log files straight off the server."
        actions={
          <>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => clearLogs(false)}>
              <Eraser className="w-4 h-4" />
              Clear source
            </Button>
            <Button variant="danger" onClick={() => clearLogs(true)}>
              <Trash2 className="w-4 h-4" />
              Clear all
            </Button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* One full-width row: the four filters share the grid rather than
          sitting inline at their own intrinsic widths. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <Select
          className="lg:col-span-4"
          aria-label="Log source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">All readable logs</option>
          {data.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
              {!s.readable ? " (unreadable/missing)" : s.writable ? "" : " (read only)"}
            </option>
          ))}
        </Select>

        <Select
          className="lg:col-span-2"
          aria-label="Severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="">All severities</option>
          {["fatal", "error", "warning", "notice", "info"].map((s) => (
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </Select>

        <Input
          className="lg:col-span-4"
          aria-label="Search log text"
          placeholder="Search log text…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <Select
          className="lg:col-span-2"
          aria-label="How many entries"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        >
          {["50", "100", "250", "500"].map((n) => (
            <option key={n} value={n}>Last {n}</option>
          ))}
        </Select>
      </div>

      <p className="text-xs text-text-3">
        {readable.length
          ? readable
              .map((s) =>
                `${s.label}: ${formatBytes(s.size)}` +
                (s.modified_at ? `, updated ${formatDateTime(s.modified_at)}` : "")
              )
              .join(" · ")
          : "No readable log files were found in the known app/public/storage locations."}
      </p>

      {data.entries.length === 0 ? (
        <Card>
          <div className="px-6 py-16 text-center text-text-3">
            No log entries match these filters.
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.entries.map((entry) => (
            <div
              key={`${entry.source_id}:${entry.entry_id}`}
              className="rounded-xl border border-hairline bg-bg-2 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill
                    status={entry.severity || "info"}
                    tone={SEVERITY_TONE[entry.severity] ?? "amber"}
                  />
                  <span className="text-sm font-semibold">{entry.source_label || "Log"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-3">
                    {entry.timestamp ? formatDateTime(entry.timestamp) : "No timestamp"}
                  </span>
                  <IconButton title="Delete entry" tone="danger" onClick={() => deleteEntry(entry)}>
                    <Trash2 className="w-4 h-4" />
                  </IconButton>
                </div>
              </div>
              <pre className="text-xs text-text-2 whitespace-pre-wrap break-words max-h-80 overflow-auto custom-scrollbar font-mono">
                {entry.message || ""}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
