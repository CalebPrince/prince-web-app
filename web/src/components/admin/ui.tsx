"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";

/* ---------- Page header ---------- */

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-hairline pb-6">
      <div>
        <div className="text-sm font-medium text-text-3 uppercase tracking-wider mb-1">{kicker}</div>
        <h2 className="text-3xl font-bold tracking-tight mb-1">{title}</h2>
        {description && <p className="text-text-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- Buttons ---------- */

const BUTTON_BASE =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 gap-2";

const BUTTON_VARIANTS = {
  primary: "bg-text text-bg hover:bg-text/90 shadow-sm",
  accent: "bg-accent text-on-accent hover:bg-accent-strong shadow-sm",
  outline: "border border-hairline-strong text-text hover:bg-bg-3",
  ghost: "text-text-2 hover:bg-bg-3 hover:text-text",
  danger: "border border-red-500/40 text-red-500 hover:bg-red-500/10",
};

export function Button({
  variant = "outline",
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

/** Small square icon button for table row actions. */
export function IconButton({
  title,
  tone = "default",
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  title: string;
  tone?: "default" | "danger" | "success";
}) {
  const tones = {
    default: "hover:text-text",
    danger: "hover:text-red-500",
    success: "hover:text-green-500",
  };
  return (
    <button
      title={title}
      aria-label={title}
      className={`p-1.5 text-text-3 rounded hover:bg-bg-3 transition-colors ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---------- Cards / panels ---------- */

export function Card({
  title,
  actions,
  children,
  className = "",
  bodyClassName,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`rounded-xl border border-hairline bg-bg overflow-hidden ${className}`}>
      {title && (
        <div className="p-4 border-b border-hairline bg-bg-2 flex items-center justify-between gap-4">
          <h2 className="font-semibold mb-0">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName ?? ""}>{children}</div>
    </div>
  );
}

/** Headline metric tile used across dashboards and report pages. */
export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-bg-2 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-text-3 uppercase tracking-wider">{label}</div>
        {icon && <div className="text-text-3">{icon}</div>}
      </div>
      <div className="text-2xl font-bold tracking-tight mt-2 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-text-3 mt-1">{hint}</div>}
    </div>
  );
}

/* ---------- Table ---------- */

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-bg-2/50 text-text-2 text-xs uppercase border-b border-hairline">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 font-medium first:pl-6 last:pr-6 last:text-right">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`hover:bg-bg-2/50 transition-colors ${onClick ? "cursor-pointer" : ""}`}
    >
      {children}
    </tr>
  );
}

export function Cell({
  children,
  className = "",
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-4 py-4 first:pl-6 last:pr-6 align-middle ${className}`}>
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-10 text-center text-text-3">
        {children}
      </td>
    </tr>
  );
}

/* ---------- Status pill ---------- */

const PILL_TONES: Record<string, string> = {
  green: "bg-green-500/10 text-green-500",
  amber: "bg-amber-500/10 text-amber-500",
  red: "bg-red-500/10 text-red-500",
  blue: "bg-blue-500/10 text-blue-500",
  violet: "bg-violet-500/10 text-violet-400",
  neutral: "bg-bg-3 text-text-2",
};

/** Maps the legacy admin status vocabulary onto a small set of tones so
 *  every list page badges the same word the same colour. */
const STATUS_TONE: Record<string, keyof typeof PILL_TONES> = {
  approved: "green",
  active: "green",
  published: "green",
  completed: "green",
  paid: "green",
  succeeded: "green",
  success: "green",
  confirmed: "green",
  won: "green",
  sent: "green",
  subscribed: "green",
  up: "green",
  resolved: "green",
  created: "green",
  accepted: "green",
  pending: "amber",
  queued: "amber",
  draft: "amber",
  submitted: "amber",
  unread: "amber",
  new: "amber",
  open: "amber",
  requested: "amber",
  scheduled: "amber",
  leased: "blue",
  running: "blue",
  processing: "blue",
  contacted: "blue",
  in_progress: "blue",
  updated: "blue",
  read: "blue",
  failed: "red",
  rejected: "red",
  cancelled: "red",
  canceled: "red",
  error: "red",
  down: "red",
  lost: "red",
  bounced: "red",
  overdue: "red",
  unsubscribed: "red",
  deleted: "red",
  archived: "neutral",
  dismissed: "neutral",
  idea: "neutral",
  used: "violet",
  qualified: "violet",
};

export function StatusPill({
  status,
  tone,
}: {
  status?: string | null;
  tone?: keyof typeof PILL_TONES;
}) {
  if (!status) return <span className="text-text-3">—</span>;
  const key = String(status).toLowerCase();
  const resolved = tone ?? STATUS_TONE[key] ?? "neutral";
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${PILL_TONES[resolved]}`}
    >
      {String(status).replace(/_/g, " ")}
    </span>
  );
}

/* ---------- Modal ---------- */

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widths = { md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${widths[size]} rounded-xl border border-hairline bg-bg-2 shadow-2xl my-auto`}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-hairline">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            {description && <p className="text-sm text-text-2 mt-1">{description}</p>}
          </div>
          <IconButton title="Close" onClick={onClose}>
            <X className="w-4 h-4" />
          </IconButton>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 p-5 border-t border-hairline bg-bg/40">{footer}</div>
        )}
      </div>
    </div>
  );
}

/* ---------- Form fields ---------- */

const CONTROL =
  "w-full rounded-md border border-hairline bg-bg px-3 py-2 text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-text-3 mt-1">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

/* ---------- Filter bar ---------- */

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

/** Segmented tab control used by the queue/status filters on list pages. */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-hairline bg-bg-2 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            value === opt.value ? "bg-bg-3 text-text" : "text-text-2 hover:text-text"
          }`}
        >
          {opt.label}
          {opt.count !== undefined && (
            <span className="ml-1.5 text-xs text-text-3 tabular-nums">{opt.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------- Misc ---------- */

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
      <span>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-400/70 hover:text-red-400" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total?: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-hairline text-sm">
      <span className="text-text-3">
        Page {page} of {totalPages}
        {total !== undefined && ` (${total} total)`}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/* ---------- Formatting helpers ---------- */

/** The PHP controllers still build admin deep links against the legacy
 *  `/admin/*.html` pages (e.g. "/admin/inbox.html?open=chat:12"). Dropping the
 *  extension points them at the migrated Next routes instead. */
export function adminHref(url?: string | null): string {
  if (!url) return "#";
  return url.replace(/^(\/admin\/[a-z0-9-]+)\.html/i, "$1");
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  // The PHP API returns naive UTC timestamps ("2026-08-19 04:08:00"); the
  // legacy JS appended Z to stop the browser reading them as local time.
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function formatLabel(value?: string | null): string {
  if (!value) return "—";
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatMoney(amount?: number | string | null, currency = "USD"): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (n === null || n === undefined || isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}
