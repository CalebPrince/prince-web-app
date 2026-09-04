// Quarterly project-intake status. The three `quarterly_*` Site Content keys
// (SettingsController::CONTENT_KEYS) are the single source of truth; this
// resolves them — with sensible fallbacks — into the shape every entry point
// (homepage strip, /request, /book, and the shared IntakeCta) reads.
//
// Fail-open: anything other than an explicit "closed" is treated as open, and
// that must stay in lockstep with the PHP guards (ProjectRequestController and
// AppointmentController both gate on the status being exactly "closed").

import type { SiteContent } from "@/lib/api";

export type QuarterlyIntake = {
  isOpen: boolean;
  /** Remaining project slots for the quarter; only meaningful when open. */
  slots: number;
  /** e.g. "Q3 2026" */
  quarter: string;
  /** Human date the next intake opens, e.g. "1 October 2026". */
  nextOpening: string;
};

/** Current quarter label and the first day of the next quarter, computed
 *  locally so the copy still reads correctly if the admin never set a date. */
export function quarterDetails(now = new Date()): { label: string; nextOpening: string } {
  const quarterNumber = Math.floor(now.getMonth() / 3) + 1;
  const nextQuarterStart = new Date(now.getFullYear(), quarterNumber * 3, 1);
  return {
    label: `Q${quarterNumber} ${now.getFullYear()}`,
    nextOpening: nextQuarterStart.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
}

function parseSlots(value: string | undefined, fallback: number): number {
  const n = parseInt((value ?? "").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

export function resolveQuarterlyIntake(content: SiteContent | null | undefined): QuarterlyIntake {
  const { label, nextOpening } = quarterDetails();
  const status = (content?.quarterly_project_status || "open").trim().toLowerCase();
  return {
    isOpen: status !== "closed",
    slots: parseSlots(content?.quarterly_project_slots, 2),
    quarter: label,
    nextOpening: content?.quarterly_next_open_date?.trim() || nextOpening,
  };
}
