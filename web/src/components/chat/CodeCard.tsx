"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { highlightCode } from "@/lib/chat-format";
import { cn } from "@/lib/utils";

// Carbon-style code snippet card for a fenced ```code``` block in a chat
// reply. Ported from ai-widget.js's buildCodeCard(); highlightCode()
// HTML-escapes every token and every gap between tokens, so the
// dangerouslySetInnerHTML below is always safe — no bot output is ever
// interpreted as markup.
export function CodeCard({ lang, value }: { lang: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const mark = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        mark();
        return;
      } catch {
        // fall through to the legacy path below
      }
    }
    // execCommand fallback for insecure contexts / browsers where the async
    // Clipboard API is present but rejects (e.g. no permission).
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand("copy")) mark();
    } catch {
      // Clipboard truly unavailable — nothing more we can do.
    }
    document.body.removeChild(ta);
  }

  return (
    <div className="mt-2 overflow-hidden rounded-[calc(var(--radius)*0.75)] border border-hairline bg-bg">
      <div className="flex items-center justify-between border-b border-hairline bg-bg-2/60 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-hairline-strong" />
          <i className="size-2.5 rounded-full bg-hairline-strong" />
          <i className="size-2.5 rounded-full bg-hairline-strong" />
        </span>
        <span className="label text-muted">{lang || "code"}</span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-xs text-text-2 transition-colors hover:border-accent/40 hover:text-text",
            copied && "border-accent/40 text-accent",
          )}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code
          className="font-mono [&_.tok-com]:text-muted [&_.tok-kw]:text-accent [&_.tok-num]:text-amber-300 [&_.tok-str]:text-emerald-300"
          dangerouslySetInnerHTML={{ __html: highlightCode(value) }}
        />
      </pre>
    </div>
  );
}
