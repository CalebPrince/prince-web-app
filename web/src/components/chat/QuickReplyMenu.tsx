"use client";

import { cn } from "@/lib/utils";

export type MenuButton = { label: string; onClick: () => void; back?: boolean };

export function QuickReplyMenu({ buttons }: { buttons: MenuButton[] }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-hairline px-3 py-3">
      <p className="mb-0.5 text-xs text-muted">Tap an option below to reply:</p>
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          onClick={b.onClick}
          className={cn(
            "rounded-[var(--radius)] border px-3 py-2 text-left text-sm transition-colors",
            b.back
              ? "border-transparent text-muted hover:text-text"
              : "border-hairline bg-bg-2/50 text-text-2 hover:border-accent/40 hover:text-text",
          )}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
