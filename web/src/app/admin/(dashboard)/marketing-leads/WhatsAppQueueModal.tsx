"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Check, Sparkles } from "lucide-react";
import { adminApi } from "@/lib/api";
import { Button, Modal, Input } from "@/components/admin/ui";

type QueueRow = {
  id: number;
  business_name: string;
  contact_name: string | null;
  contact_phone: string;
  website_url: string | null;
  pitch_body: string | null;
};

const PAGE = 20;

/** wa.me wants digits only, country code first, no leading 0 or 00. */
function waDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

/** A local-format number (0244…) opens WhatsApp on the wrong number or nothing. */
function looksLocal(phone: string): boolean {
  const trimmed = phone.trim();
  return !trimmed.startsWith("+") && !trimmed.startsWith("00") && trimmed.replace(/\D/g, "").startsWith("0");
}

/**
 * The manual WhatsApp outreach list: every lead with a reviewed WhatsApp
 * draft and a phone number. "Open WhatsApp" opens the chat with the message
 * already filled in; nothing is sent from the server, you press Send in
 * WhatsApp yourself, then mark the lead as messaged so it leaves the list.
 */
export function WhatsAppQueueModal({
  isOpen,
  onClose,
  onChanged,
}: {
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.get<{ queue?: QueueRow[] }>("/api/v1/admin/outreach/whatsapp-queue");
      setRows(data.queue ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the WhatsApp list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setShown(PAGE);
    void load();
  }, [isOpen]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.business_name, r.contact_name ?? "", r.contact_phone].some((v) => v.toLowerCase().includes(q))
    );
  }, [rows, query]);

  const open = (row: QueueRow) => {
    window.open(
      `https://wa.me/${waDigits(row.contact_phone)}?text=${encodeURIComponent((row.pitch_body ?? "").trim())}`,
      "_blank",
      "noopener"
    );
  };

  const markMessaged = async (row: QueueRow) => {
    if (!confirm(`Confirm you sent the WhatsApp message to ${row.business_name}?`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      await adminApi.post(`/api/v1/admin/marketing-leads/${row.id}/send`);
      setRows((list) => list.filter((r) => r.id !== row.id));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark as messaged.");
    } finally {
      setBusyId(null);
    }
  };

  const redraft = async (row: QueueRow) => {
    setBusyId(row.id);
    setError(null);
    try {
      await adminApi.post(`/api/v1/admin/marketing-leads/${row.id}/generate-pitch`, { channel: "phone" });
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate the draft.");
    } finally {
      setBusyId(null);
    }
  };

  const visible = matches.slice(0, shown);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="WhatsApp list"
      description="Open WhatsApp with the message already filled in, press Send yourself, then mark the lead as messaged."
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <Input
        placeholder="Search business, contact or number"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShown(PAGE);
        }}
      />
      <p className="text-xs text-text-2">
        {loading ? "Loading…" : `${matches.length} ${matches.length === 1 ? "contact" : "contacts"} ready to message`}
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!loading && matches.length === 0 && (
        <p className="text-sm text-text-2">
          {rows.length === 0
            ? "Nothing queued. Leads appear here once they have a reviewed WhatsApp draft and a phone number."
            : "No contacts match that search."}
        </p>
      )}

      <div className="space-y-3">
        {visible.map((row) => (
          <div key={row.id} className="rounded-lg border border-hairline p-4 space-y-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0">
                <div className="font-medium">{row.business_name}</div>
                <div className="text-sm text-text-2">
                  {row.contact_name || "No contact name"} · {row.contact_phone}
                </div>
                {looksLocal(row.contact_phone) && (
                  <div className="text-xs text-amber-400 mt-1">
                    Local format. Add the country code before opening WhatsApp or it may not connect.
                  </div>
                )}
              </div>
              <Button variant="primary" className="ml-auto" onClick={() => open(row)}>
                <MessageCircle className="w-4 h-4" />
                Open WhatsApp
              </Button>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-text-2">Message</summary>
              <p className="mt-2 text-sm whitespace-pre-wrap">{row.pitch_body}</p>
            </details>
            <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
              <Button variant="outline" disabled={busyId === row.id} onClick={() => markMessaged(row)}>
                <Check className="w-4 h-4" />
                Mark as messaged
              </Button>
              <Button variant="ghost" disabled={busyId === row.id} onClick={() => redraft(row)}>
                <Sparkles className="w-4 h-4" />
                Regenerate draft
              </Button>
              <span className="text-xs text-text-2">Mark it only after you have pressed Send in WhatsApp.</span>
            </div>
          </div>
        ))}
      </div>

      {matches.length > shown && (
        <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({matches.length - shown} left)
        </Button>
      )}
    </Modal>
  );
}
