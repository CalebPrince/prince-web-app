"use client";

import { useMemo, useState } from "react";
import { adminApi, asList } from "@/lib/api";
import { Plus, Pencil, Trash2, CalendarDays, User, Link2, TrendingUp } from "lucide-react";
import {
  PageHeader, Card, StatCard, Button, IconButton, Modal, Field, Input,
  Textarea, Select, FilterBar, ErrorBanner, Pagination, formatLabel,
} from "@/components/admin/ui";

export type Task = {
  id: number;
  title: string;
  notes: string | null;
  priority: string;
  status: string;
  due_at: string | null;
  completed_at: string | null;
  assignee: string | null;
  related_url: string | null;
  is_revenue: number | boolean;
  activity_type: string | null;
  /** Stored in minor units (pesewas/cents) — the form edits major units. */
  estimated_value: number | null;
  currency: string | null;
};

const PER_PAGE = 10;

const PRIORITY_TONE: Record<string, string> = {
  high: "bg-red-500/10 text-red-500",
  normal: "bg-blue-500/10 text-blue-500",
  low: "bg-bg-3 text-text-2",
};

const emptyForm = {
  title: "",
  notes: "",
  priority: "normal",
  due_at: "",
  assignee: "Prince Caleb",
  related_url: "",
  is_revenue: false,
  activity_type: "follow_up",
  estimated_value: "0",
  currency: "GHS",
};

/** An open task whose due date has passed. */
const isOverdue = (t: Task) =>
  t.status === "open" && !!t.due_at && new Date(t.due_at).getTime() <= Date.now();

function formatTaskDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime())
    ? value
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function TasksClient({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const counts = useMemo(() => {
    const today = new Date().toDateString();
    return {
      open: tasks.filter((t) => t.status === "open").length,
      due: tasks.filter(isOverdue).length,
      revenueToday: tasks.filter(
        (t) =>
          Number(t.is_revenue) &&
          t.status === "completed" &&
          t.completed_at &&
          new Date(t.completed_at).toDateString() === today
      ).length,
      completed: tasks.filter((t) => t.status === "completed").length,
    };
  }, [tasks]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      const matchesQuery =
        !q ||
        [t.title, t.notes, t.assignee, t.activity_type].some((v) =>
          String(v || "").toLowerCase().includes(q)
        );
      const matchesFilter =
        filter === "all" ||
        filter === t.status ||
        (filter === "due" && isOverdue(t)) ||
        (filter === "revenue" && Number(t.is_revenue) && t.status === "open");
      return matchesQuery && matchesFilter;
    });
  }, [tasks, search, filter]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const pageRows = visible.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const refresh = async () => {
    setTasks(asList<Task>(await adminApi.get("/api/v1/admin/tasks")));
  };

  const openTask = (task?: Task) => {
    setEditingId(task?.id ?? null);
    setForm(
      task
        ? {
            title: task.title || "",
            notes: task.notes || "",
            priority: task.priority || "normal",
            due_at: task.due_at || "",
            assignee: task.assignee || "Prince Caleb",
            related_url: task.related_url || "",
            is_revenue: Boolean(Number(task.is_revenue)),
            activity_type: task.activity_type || "follow_up",
            estimated_value: String(Number(task.estimated_value || 0) / 100),
            currency: task.currency || "GHS",
          }
        : emptyForm
    );
    setError(null);
    setIsOpen(true);
  };

  const payload = () => ({
    title: form.title.trim(),
    notes: form.notes.trim(),
    priority: form.priority,
    due_at: form.due_at,
    assignee: form.assignee.trim(),
    related_url: form.related_url.trim(),
    is_revenue: form.is_revenue,
    activity_type: form.is_revenue ? form.activity_type : "",
    estimated_value: form.is_revenue ? form.estimated_value : 0,
    currency: form.currency,
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editingId) await adminApi.put(`/api/v1/admin/tasks/${editingId}`, payload());
      else await adminApi.post("/api/v1/admin/tasks", payload());
      setIsOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the task.");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (task: Task, status: string) => {
    // Optimistic: the checkbox should feel instant, so roll back only on failure.
    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status, completed_at: status === "completed" ? new Date().toISOString() : null }
          : t
      )
    );
    try {
      await adminApi.put(`/api/v1/admin/tasks/${task.id}`, { ...task, status });
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : "Could not update the task.");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this task permanently?")) return;
    try {
      await adminApi.del(`/api/v1/admin/tasks/${id}`);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the task.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Overview"
        title="The next thing to actually do."
        description="Your working list, with revenue-producing actions called out separately."
        actions={
          <Button variant="primary" onClick={() => openTask()}>
            <Plus className="w-4 h-4" />
            New task
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open" value={counts.open} />
        <StatCard label="Overdue" value={counts.due} />
        <StatCard label="Revenue actions today" value={counts.revenueToday} />
        <StatCard label="Completed" value={counts.completed} />
      </div>

      <FilterBar>
        <Input
          className="w-auto min-w-64"
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          className="w-auto min-w-48"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All tasks</option>
          <option value="open">Open</option>
          <option value="completed">Completed</option>
          <option value="due">Overdue</option>
          <option value="revenue">Revenue actions</option>
        </Select>
      </FilterBar>

      {pageRows.length === 0 ? (
        <Card>
          <div className="px-6 py-16 text-center text-text-3">Nothing here. Add your first task.</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {pageRows.map((t) => (
            <article
              key={t.id}
              className={`rounded-xl border border-hairline bg-bg-2 p-4 flex gap-4 ${
                t.status === "completed" ? "opacity-60" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={t.status === "completed"}
                onChange={(e) => setStatus(t, e.target.checked ? "completed" : "open")}
                aria-label={`Mark ${t.title} ${t.status === "completed" ? "open" : "complete"}`}
                className="mt-1 accent-accent flex-shrink-0 w-4 h-4"
              />

              <div className="flex-1 min-w-0">
                {Number(t.is_revenue) === 1 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs mb-1.5">
                    <span className="inline-flex items-center gap-1 text-accent font-medium">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Revenue action
                    </span>
                    <span className="text-text-3">{formatLabel(t.activity_type || "revenue action")}</span>
                    {Number(t.estimated_value) > 0 && (
                      <strong className="tabular-nums">
                        {t.currency}{" "}
                        {(Number(t.estimated_value) / 100).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </strong>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                      PRIORITY_TONE[t.priority] ?? PRIORITY_TONE.low
                    }`}
                  >
                    {t.priority}
                  </span>
                  <span className={`font-medium ${t.status === "completed" ? "line-through" : ""}`}>
                    {t.title}
                  </span>
                </div>

                {t.notes && <p className="text-sm text-text-2 mt-1">{t.notes}</p>}

                <div className="flex flex-wrap items-center gap-4 text-xs text-text-3 mt-2">
                  {t.due_at && (
                    <span className={`inline-flex items-center gap-1 ${isOverdue(t) ? "text-red-500" : ""}`}>
                      <CalendarDays className="w-3.5 h-3.5" />
                      {isOverdue(t) ? "Due " : ""}
                      {formatTaskDate(t.due_at)}
                    </span>
                  )}
                  {t.assignee && (
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {t.assignee}
                    </span>
                  )}
                  {t.related_url && (
                    <a href={t.related_url} className="inline-flex items-center gap-1 hover:text-accent">
                      <Link2 className="w-3.5 h-3.5" />
                      Related record
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2 flex-shrink-0">
                <IconButton title="Edit" onClick={() => openTask(t)}>
                  <Pencil className="w-4 h-4" />
                </IconButton>
                <IconButton title="Delete task" tone="danger" onClick={() => remove(t.id)}>
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
            </article>
          ))}
        </div>
      )}

      {visible.length > PER_PAGE && (
        <Card>
          <Pagination page={page} totalPages={totalPages} total={visible.length} onChange={setPage} />
        </Card>
      )}

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingId ? "Edit task" : "New task"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving || !form.title.trim()}>
              {saving ? "Saving…" : "Save task"}
            </Button>
          </>
        }
      >
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <Field label="Title">
          <Input
            value={form.title}
            autoFocus
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>

        <Field label="Notes">
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Priority">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </Select>
          </Field>
          <Field label="Due">
            <Input
              type="datetime-local"
              value={form.due_at}
              onChange={(e) => setForm({ ...form, due_at: e.target.value })}
            />
          </Field>
          <Field label="Assignee">
            <Input
              value={form.assignee}
              onChange={(e) => setForm({ ...form, assignee: e.target.value })}
            />
          </Field>
          <Field label="Related URL">
            <Input
              type="url"
              value={form.related_url}
              placeholder="/admin/proposals"
              onChange={(e) => setForm({ ...form, related_url: e.target.value })}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_revenue}
            onChange={(e) => setForm({ ...form, is_revenue: e.target.checked })}
            className="accent-accent w-4 h-4"
          />
          This is a revenue-producing action
        </label>

        {form.is_revenue && (
          <div className="grid gap-4 sm:grid-cols-3 rounded-lg border border-hairline p-4">
            <Field label="Activity type">
              <Select
                value={form.activity_type}
                onChange={(e) => setForm({ ...form, activity_type: e.target.value })}
              >
                <option value="follow_up">Follow up</option>
                <option value="outreach">Outreach</option>
                <option value="proposal">Proposal</option>
                <option value="demo">Demo</option>
                <option value="close">Close</option>
              </Select>
            </Field>
            <Field label="Estimated value">
              <Input
                inputMode="decimal"
                value={form.estimated_value}
                onChange={(e) => setForm({ ...form, estimated_value: e.target.value })}
              />
            </Field>
            <Field label="Currency">
              <Input
                maxLength={8}
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
