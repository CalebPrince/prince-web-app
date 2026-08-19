"use client";

import { useState } from "react";
import { adminApi, asList } from "@/lib/api";
import { Trash2, Download, Send, ArrowUpRight } from "lucide-react";
import {
  PageHeader, Card, Table, Row, Cell, EmptyRow, Button, IconButton,
  StatusPill, ErrorBanner, Pagination, formatDate, formatDateTime,
} from "@/components/admin/ui";

export type Subscriber = {
  id: number;
  email: string;
  status: string;
  created_at: string;
};

export type NewsletterDraft = {
  id: number;
  subject_line: string | null;
  article_title: string;
  article_url: string;
  status: string;
  email_body: string | null;
  error_note: string | null;
  sent_at: string | null;
  recipient_count: number | null;
};

const PER_PAGE = 25;

export default function NewsletterClient({
  initialSubscribers,
  initialDrafts,
}: {
  initialSubscribers: Subscriber[];
  initialDrafts: NewsletterDraft[];
}) {
  const [subscribers, setSubscribers] = useState(initialSubscribers);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);

  const totalPages = Math.max(1, Math.ceil(subscribers.length / PER_PAGE));
  const pageRows = subscribers.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((s) => selected.has(s.id));

  const refreshSubscribers = async () => {
    setSubscribers(asList<Subscriber>(await adminApi.get("/api/v1/admin/newsletter")));
    setSelected(new Set());
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((s) => next.delete(s.id));
      else pageRows.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const remove = async (id: number) => {
    if (!confirm("Remove this subscriber?")) return;
    try {
      await adminApi.del(`/api/v1/admin/newsletter/${id}`);
      await refreshSubscribers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the subscriber.");
    }
  };

  const removeSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Remove ${ids.length} subscriber${ids.length === 1 ? "" : "s"}?`)) return;
    try {
      await Promise.all(ids.map((id) => adminApi.del(`/api/v1/admin/newsletter/${id}`)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove all selected subscribers.");
    } finally {
      await refreshSubscribers();
    }
  };

  const sendDraft = async (draft: NewsletterDraft) => {
    if (!confirm("Send this newsletter to all current subscribers now? This cannot be undone.")) return;
    setSendingId(draft.id);
    try {
      await adminApi.post<{ recipients: number }>(
        `/api/v1/admin/newsletter-drafts/${draft.id}/send`
      );
      setDrafts(asList<NewsletterDraft>(await adminApi.get("/api/v1/admin/newsletter-drafts")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the newsletter.");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Leads & Clients"
        title="The list you actually own."
        description="Subscribers, and the blog announcements queued to go out to them."
        actions={
          <a
            href="/api/v1/admin/newsletter/export"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </a>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-hairline bg-bg-2 px-4 py-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button variant="danger" onClick={removeSelected}>
              <Trash2 className="w-4 h-4" />
              Remove selected
            </Button>
          </div>
        </div>
      )}

      <Card title={`Subscribers (${subscribers.length})`}>
        <Table
          head={[
            <input
              key="all"
              type="checkbox"
              aria-label="Select all on this page"
              checked={allOnPageSelected}
              onChange={toggleAllOnPage}
              className="accent-accent"
            />,
            "Email",
            "Status",
            "Subscribed",
            "Actions",
          ]}
        >
          {pageRows.length === 0 ? (
            <EmptyRow colSpan={5}>No subscribers yet.</EmptyRow>
          ) : (
            pageRows.map((s) => (
              <Row key={s.id}>
                <Cell className="w-10">
                  <input
                    type="checkbox"
                    aria-label={`Select ${s.email}`}
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="accent-accent"
                  />
                </Cell>
                <Cell className="font-medium">{s.email}</Cell>
                <Cell><StatusPill status={s.status} /></Cell>
                <Cell className="text-text-3">{formatDate(s.created_at)}</Cell>
                <Cell>
                  <div className="flex justify-end">
                    <IconButton title="Remove subscriber" tone="danger" onClick={() => remove(s.id)}>
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </Cell>
              </Row>
            ))
          )}
        </Table>
        {subscribers.length > PER_PAGE && (
          <Pagination page={page} totalPages={totalPages} total={subscribers.length} onChange={setPage} />
        )}
      </Card>

      <Card title="Blog announcements" bodyClassName="p-4 space-y-3">
        {drafts.length === 0 ? (
          <p className="text-sm text-text-3">No blog announcements queued yet.</p>
        ) : (
          drafts.map((d) => {
            const sendable = d.status === "drafted" && d.email_body && !d.sent_at;
            return (
              <article key={d.id} className="rounded-lg border border-hairline p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <strong className="text-sm">{d.subject_line || d.article_title}</strong>
                  <StatusPill status={d.sent_at ? "sent" : d.status} />
                </div>

                <p className="text-xs text-text-3 mb-2">
                  Promotes:{" "}
                  <a
                    href={d.article_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-accent inline-flex items-center gap-1"
                  >
                    {d.article_title}
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                </p>

                {d.email_body ? (
                  <p className="text-sm text-text-2 whitespace-pre-wrap">{d.email_body}</p>
                ) : (
                  <p className="text-sm text-text-3">
                    {d.error_note || "Waiting for the newsletter drafting cron."}
                  </p>
                )}

                {sendable && (
                  <Button
                    variant="primary"
                    className="mt-3"
                    disabled={sendingId === d.id}
                    onClick={() => sendDraft(d)}
                  >
                    <Send className="w-4 h-4" />
                    {sendingId === d.id ? "Sending…" : "Send to subscribers"}
                  </Button>
                )}

                {d.sent_at && (
                  <p className="text-xs text-green-500 mt-2">
                    Sent {formatDateTime(d.sent_at)} to {d.recipient_count ?? 0} subscriber
                    {d.recipient_count === 1 ? "" : "s"}
                  </p>
                )}
              </article>
            );
          })
        )}
      </Card>
    </div>
  );
}
