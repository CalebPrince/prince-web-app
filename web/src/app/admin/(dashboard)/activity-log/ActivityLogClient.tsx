"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import {
  PageHeader, Card, Table, Row, Cell, EmptyRow, Select, FilterBar,
  StatusPill, Pagination, ErrorBanner, formatDateTime, formatLabel,
} from "@/components/admin/ui";

export type ActivityLogEntry = {
  id: number;
  created_at: string;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  entity_label: string | null;
  details: string | null;
};

export type ActivityLogPage = {
  rows: ActivityLogEntry[];
  total: number;
  per_page: number;
};

/** The API stores `details` as a JSON blob; the legacy page flattened it to a
 *  "key: value, key: value" line next to the entity label. */
function describe(entry: ActivityLogEntry): string {
  const parts: string[] = [];
  if (entry.entity_label) parts.push(entry.entity_label);
  if (entry.details) {
    try {
      const parsed = JSON.parse(entry.details) as Record<string, unknown>;
      parts.push(
        Object.entries(parsed)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
          .join(", ")
      );
    } catch {
      /* details is not valid JSON — fall back to the label alone */
    }
  }
  return parts.join(" — ");
}

export default function ActivityLogClient({
  initialLog,
  entityTypes,
}: {
  initialLog: ActivityLogPage;
  entityTypes: string[];
}) {
  const [log, setLog] = useState(initialLog);
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async (nextPage: number, nextType: string) => {
    const qs = new URLSearchParams({ page: String(nextPage) });
    if (nextType) qs.set("entity_type", nextType);
    try {
      setLog(await adminApi.get<ActivityLogPage>(`/api/v1/admin/activity-log?${qs}`));
      setPage(nextPage);
      setEntityType(nextType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the activity log.");
    }
  };

  const totalPages = Math.max(1, Math.ceil(log.total / (log.per_page || 50)));

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="System"
        title="Every change, on the record."
        description="An append-only trail of who changed what, across the whole admin."
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <FilterBar>
        <Select
          className="w-auto min-w-56"
          value={entityType}
          onChange={(e) => load(1, e.target.value)}
        >
          <option value="">All entity types</option>
          {entityTypes.map((type) => (
            <option key={type} value={type}>{formatLabel(type)}</option>
          ))}
        </Select>
      </FilterBar>

      <Card title="Activity">
        <Table head={["When", "Who", "Action", "Entity", "Details"]}>
          {log.rows.length === 0 ? (
            <EmptyRow colSpan={5}>No activity recorded yet.</EmptyRow>
          ) : (
            log.rows.map((entry) => (
              <Row key={entry.id}>
                <Cell className="text-text-3 whitespace-nowrap">{formatDateTime(entry.created_at)}</Cell>
                <Cell className="text-text-2">{entry.user_email || "System"}</Cell>
                <Cell><StatusPill status={entry.action} /></Cell>
                <Cell className="text-text-2 whitespace-nowrap">
                  {formatLabel(entry.entity_type)}
                  {entry.entity_id ? ` #${entry.entity_id}` : ""}
                </Cell>
                <Cell className="text-text-2 !text-left max-w-md">
                  {describe(entry) || <span className="text-text-3">—</span>}
                </Cell>
              </Row>
            ))
          )}
        </Table>
        {log.rows.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={log.total}
            onChange={(p) => load(p, entityType)}
          />
        )}
      </Card>
    </div>
  );
}
