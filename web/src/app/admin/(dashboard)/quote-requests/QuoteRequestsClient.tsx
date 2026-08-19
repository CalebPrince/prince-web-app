"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminApi, asList, Inquiry } from "@/lib/api";
import { Trash2, Flag, Archive, Check, Download, Paperclip, FileCheck } from "lucide-react";
import {
  PageHeader, Card, IconButton, Select, FilterBar, StatusPill,
  ErrorBanner, Pagination, formatDateTime,
} from "@/components/admin/ui";

const STAGES = {
  new: "New",
  reviewing: "Reviewing",
  proposal_sent: "Proposal Sent",
  won: "Won",
  lost: "Lost",
} as const;

const STAGE_TONE: Record<string, "amber" | "blue" | "green" | "red" | "neutral"> = {
  new: "amber",
  reviewing: "blue",
  proposal_sent: "blue",
  won: "green",
  lost: "red",
};

const PER_PAGE = 10;

/** Attachments arrive as a JSON-encoded array of paths on the inquiry row. */
function attachmentsOf(request: Inquiry): string[] {
  const raw = request.attachments;
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function QuoteRequestsClient({ initialRequests }: { initialRequests: Inquiry[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [status, setStatus] = useState("");
  const [stage, setStage] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(requests.length / PER_PAGE));
  const pageRows = requests.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const load = async (nextStatus = status, nextStage = stage) => {
    const params = new URLSearchParams({ type: "project_request" });
    if (nextStatus) params.set("status", nextStatus);
    if (nextStage) params.set("pipeline_stage", nextStage);
    try {
      setRequests(asList<Inquiry>(await adminApi.get(`/api/v1/admin/inquiries?${params}`)));
      setStatus(nextStatus);
      setStage(nextStage);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quote requests.");
    }
  };

  const setStatusFor = async (id: number, next: string) => {
    try {
      await adminApi.patch(`/api/v1/admin/inquiries/${id}`, { status: next });
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: next as Inquiry["status"] } : r))
      );
      window.dispatchEvent(new Event("admin:notifications-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the request.");
    }
  };

  const setStageFor = async (id: number, next: string) => {
    try {
      await adminApi.patch(`/api/v1/admin/inquiries/${id}`, { pipeline_stage: next });
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, pipeline_stage: next } : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move the request.");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this quote request permanently?")) return;
    try {
      await adminApi.del(`/api/v1/admin/inquiries/${id}`);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the request.");
    }
  };

  // Deep link from notifications: mark the target read and scroll to it.
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    const target = requests.find((r) => String(r.id) === openId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot sync from the URL/localStorage on mount
    if (target?.status === "unread") setStatusFor(target.id, "read");
    document.getElementById(`request-${openId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Leads & Clients"
        title="People asking what it costs."
        description="Structured project requests from the site, with the budget and timeline they gave you."
        actions={
          <a
            href="/api/v1/admin/inquiries/export?type=project_request"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </a>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <FilterBar>
        <Select
          className="w-auto min-w-44"
          value={status}
          onChange={(e) => load(e.target.value, stage)}
        >
          <option value="">All statuses</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
          <option value="flagged">Flagged</option>
          <option value="archived">Archived</option>
        </Select>

        <Select
          className="w-auto min-w-44"
          value={stage}
          onChange={(e) => load(status, e.target.value)}
        >
          <option value="">All stages</option>
          {Object.entries(STAGES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </FilterBar>

      {pageRows.length === 0 ? (
        <Card>
          <div className="px-6 py-16 text-center text-text-3">No quote requests match this view.</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {pageRows.map((r) => {
            const attachments = attachmentsOf(r);
            return (
              <article
                key={r.id}
                id={`request-${r.id}`}
                className="rounded-xl border border-hairline bg-bg-2 p-5 scroll-mt-24"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <strong>{r.name}</strong>
                    <span className="text-sm text-text-3 ml-2">{r.email}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill
                      status={STAGES[r.pipeline_stage as keyof typeof STAGES] ?? r.pipeline_stage}
                      tone={STAGE_TONE[r.pipeline_stage ?? ""] ?? "neutral"}
                    />
                    <StatusPill status={r.status} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-2 mb-2">
                  <span><strong className="text-text-3 font-medium">Type:</strong> {r.project_type || "—"}</span>
                  <span><strong className="text-text-3 font-medium">Budget:</strong> {r.budget || "—"}</span>
                  <span><strong className="text-text-3 font-medium">Timeline:</strong> {r.timeline || "—"}</span>
                </div>

                {r.features && (
                  <p className="text-sm text-text-2 mb-2">
                    <strong className="text-text-3 font-medium">Features:</strong> {r.features}
                  </p>
                )}

                <p className="text-sm mb-3 whitespace-pre-wrap">{r.message}</p>

                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {attachments.map((path, i) => (
                      <a
                        key={path}
                        href={path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-hairline text-xs hover:bg-bg-3 transition-colors"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        Attachment {i + 1}
                      </a>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-hairline">
                  <span className="text-xs text-text-3">{formatDateTime(r.created_at)}</span>

                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      className="w-auto h-9 py-0"
                      value={r.pipeline_stage ?? "new"}
                      onChange={(e) => setStageFor(r.id, e.target.value)}
                      aria-label="Pipeline stage"
                    >
                      {Object.entries(STAGES).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>

                    <Link
                      href={`/admin/proposals?inquiry_id=${r.id}`}
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
                    >
                      <FileCheck className="w-4 h-4" />
                      Create proposal
                    </Link>

                    <IconButton title="Mark read" onClick={() => setStatusFor(r.id, "read")}>
                      <Check className="w-4 h-4" />
                    </IconButton>
                    <IconButton title="Flag" onClick={() => setStatusFor(r.id, "flagged")}>
                      <Flag className="w-4 h-4" />
                    </IconButton>
                    <IconButton title="Archive" onClick={() => setStatusFor(r.id, "archived")}>
                      <Archive className="w-4 h-4" />
                    </IconButton>
                    <IconButton title="Delete permanently" tone="danger" onClick={() => remove(r.id)}>
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {requests.length > PER_PAGE && (
        <Card>
          <Pagination page={page} totalPages={totalPages} total={requests.length} onChange={setPage} />
        </Card>
      )}
    </div>
  );
}
