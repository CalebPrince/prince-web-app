"use client";

import { useMemo, useState } from "react";
import { adminApi, asList } from "@/lib/api";
import { Plus, Pencil, Trash2, Pause, Play, ArrowUpRight } from "lucide-react";
import {
  PageHeader, Card, StatCard, Table, Row, Cell, EmptyRow, Button, IconButton,
  Modal, Field, Input, Select, StatusPill, ErrorBanner, formatDateTime,
} from "@/components/admin/ui";

export type Monitor = {
  id: number;
  name: string;
  url: string;
  client_id: number | null;
  client_name: string | null;
  is_active: boolean | number;
  last_status: string | null;
  last_checked_at: string | null;
  uptime_24h: number | null;
  uptime_30d: number | null;
  avg_response_ms: number | null;
};

export type MonitorClient = { id: number; name: string; email: string };

const emptyForm = { name: "", url: "", client_id: "" };

export default function UptimeClient({
  initialMonitors,
  clients,
}: {
  initialMonitors: Monitor[];
  clients: MonitorClient[];
}) {
  const [monitors, setMonitors] = useState(initialMonitors);
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const active = monitors.filter((m) => !!m.is_active);
    const speeds = active.map((m) => m.avg_response_ms).filter((v): v is number => v != null);
    return {
      up: active.filter((m) => m.last_status === "up").length,
      down: active.filter((m) => m.last_status === "down").length,
      avg: speeds.length
        ? `${Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)}ms`
        : "—",
      total: monitors.length,
      activeCount: active.length,
    };
  }, [monitors]);

  const refresh = async () => {
    setMonitors(asList<Monitor>(await adminApi.get("/api/v1/admin/uptime")));
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setIsOpen(true);
  };

  const openEdit = (m: Monitor) => {
    setEditingId(m.id);
    setForm({ name: m.name, url: m.url, client_id: m.client_id ? String(m.client_id) : "" });
    setError(null);
    setIsOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name,
      url: form.url,
      client_id: form.client_id ? Number(form.client_id) : null,
    };
    try {
      if (editingId) {
        await adminApi.patch(`/api/v1/admin/uptime/${editingId}`, payload);
      } else {
        await adminApi.post("/api/v1/admin/uptime", payload);
      }
      setIsOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the monitor.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m: Monitor) => {
    try {
      await adminApi.patch(`/api/v1/admin/uptime/${m.id}`, { is_active: !m.is_active });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the monitor.");
    }
  };

  const remove = async (m: Monitor) => {
    if (!confirm("Delete this monitor and its check history?")) return;
    try {
      await adminApi.del(`/api/v1/admin/uptime/${m.id}`);
      setMonitors((prev) => prev.filter((x) => x.id !== m.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the monitor.");
    }
  };

  const renderStatus = (m: Monitor) => {
    if (!m.is_active) return <StatusPill status="paused" tone="neutral" />;
    if (!m.last_status) return <StatusPill status="waiting" tone="blue" />;
    return <StatusPill status={m.last_status} />;
  };

  const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="System"
        title="Is everything still up?"
        description="Ping the sites you're responsible for and catch outages before clients do."
        actions={
          <Button variant="primary" onClick={openNew}>
            <Plus className="w-4 h-4" />
            Add monitor
          </Button>
        }
      />

      {error && !isOpen && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Up" value={stats.up} />
        <StatCard label="Down" value={stats.down} />
        <StatCard label="Avg response" value={stats.avg} />
        <StatCard label="Monitors" value={stats.total} hint={`${stats.activeCount} active`} />
      </div>

      <Card title="Monitors">
        <Table head={["Site", "Status", "24h", "30d", "Response", "Last check", "Actions"]}>
          {monitors.length === 0 ? (
            <EmptyRow colSpan={7}>No monitors yet. Add your first site.</EmptyRow>
          ) : (
            monitors.map((m) => (
              <Row key={m.id}>
                <Cell>
                  <div className="font-medium text-text">
                    {m.name}
                    {m.client_name && <span className="text-text-3 font-normal"> · {m.client_name}</span>}
                  </div>
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-text-3 hover:text-accent inline-flex items-center gap-1 mt-0.5"
                  >
                    {m.url}
                    <ArrowUpRight className="w-3 h-3" />
                  </a>
                </Cell>
                <Cell>{renderStatus(m)}</Cell>
                <Cell className="tabular-nums text-text-2">{pct(m.uptime_24h)}</Cell>
                <Cell className="tabular-nums text-text-2">{pct(m.uptime_30d)}</Cell>
                <Cell className="tabular-nums text-text-2">
                  {m.avg_response_ms != null ? `${m.avg_response_ms}ms` : "—"}
                </Cell>
                <Cell className="text-text-3 whitespace-nowrap">
                  {m.last_checked_at ? formatDateTime(m.last_checked_at) : "never"}
                </Cell>
                <Cell>
                  <div className="flex items-center justify-end gap-2">
                    <IconButton title="Edit" onClick={() => openEdit(m)}>
                      <Pencil className="w-4 h-4" />
                    </IconButton>
                    <IconButton
                      title={m.is_active ? "Pause" : "Resume"}
                      onClick={() => toggleActive(m)}
                    >
                      {m.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </IconButton>
                    <IconButton title="Delete" tone="danger" onClick={() => remove(m)}>
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </Cell>
              </Row>
            ))
          )}
        </Table>
      </Card>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingId ? "Edit monitor" : "Add monitor"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving || !form.name || !form.url}>
              {saving ? "Saving…" : "Save monitor"}
            </Button>
          </>
        }
      >
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <Field label="Name">
          <Input
            value={form.name}
            placeholder="Client site"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="URL" hint="The full address to ping, including https://">
          <Input
            type="url"
            value={form.url}
            placeholder="https://example.com"
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
        </Field>
        <Field label="Client" hint="Optional — links this monitor to a client record.">
          <Select
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
          >
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
            ))}
          </Select>
        </Field>
      </Modal>
    </div>
  );
}
