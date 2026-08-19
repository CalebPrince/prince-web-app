"use client";

import { useState } from "react";
import { adminApi, asList } from "@/lib/api";
import { Check, X, Trash2 } from "lucide-react";
import {
  PageHeader, Card, Table, Row, Cell, EmptyRow, IconButton, Select,
  FilterBar, StatusPill, ErrorBanner,
} from "@/components/admin/ui";

export type Appointment = {
  id: number;
  appointment_date: string;
  appointment_time: string;
  client_name: string;
  client_email: string;
  topic: string | null;
  status: string;
};

const STATUSES = [
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "", label: "All bookings" },
];

export default function AppointmentsClient({
  initialAppointments,
}: {
  initialAppointments: Appointment[];
}) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [status, setStatus] = useState("confirmed");
  const [error, setError] = useState<string | null>(null);

  const load = async (nextStatus: string) => {
    setStatus(nextStatus);
    try {
      const query = nextStatus ? `?status=${encodeURIComponent(nextStatus)}` : "";
      const rows = asList<Appointment>(await adminApi.get(`/api/v1/admin/appointments${query}`));
      // The endpoint ignores the filter for some statuses, so narrow client-side too.
      setAppointments(nextStatus ? rows.filter((r) => r.status === nextStatus) : rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bookings.");
    }
  };

  const setStatusFor = async (id: number, next: string) => {
    try {
      await adminApi.patch(`/api/v1/admin/appointments/${id}`, { status: next });
      await load(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the booking.");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this booking permanently? This can't be undone.")) return;
    try {
      await adminApi.del(`/api/v1/admin/appointments/${id}`);
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the booking.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Bookings & Payments"
        title="Who's on the calendar."
        description="Confirmed calls, completed sessions, and anything that fell through."
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <FilterBar>
        <Select className="w-auto min-w-48" value={status} onChange={(e) => load(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </FilterBar>

      <Card title="Bookings">
        <Table head={["When", "Client", "Topic", "Status", "Actions"]}>
          {appointments.length === 0 ? (
            <EmptyRow colSpan={5}>No bookings yet.</EmptyRow>
          ) : (
            appointments.map((a) => (
              <Row key={a.id}>
                <Cell className="whitespace-nowrap font-medium">
                  {a.appointment_date}
                  <div className="text-xs font-normal text-text-3 mt-0.5">{a.appointment_time}</div>
                </Cell>
                <Cell>
                  <div className="font-medium text-text">{a.client_name}</div>
                  <div className="text-xs text-text-3 mt-0.5">{a.client_email}</div>
                </Cell>
                <Cell className="text-text-2">{a.topic || "—"}</Cell>
                <Cell><StatusPill status={a.status} /></Cell>
                <Cell>
                  <div className="flex items-center justify-end gap-2">
                    {a.status === "confirmed" && (
                      <>
                        <IconButton
                          title="Mark completed"
                          tone="success"
                          onClick={() => setStatusFor(a.id, "completed")}
                        >
                          <Check className="w-4 h-4" />
                        </IconButton>
                        <IconButton
                          title="Cancel booking"
                          tone="danger"
                          onClick={() => setStatusFor(a.id, "cancelled")}
                        >
                          <X className="w-4 h-4" />
                        </IconButton>
                      </>
                    )}
                    <IconButton title="Delete permanently" tone="danger" onClick={() => remove(a.id)}>
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
