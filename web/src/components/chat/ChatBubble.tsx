"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { CodeCard } from "./CodeCard";
import { hasCode, parseSegments } from "@/lib/chat-format";
import { cn } from "@/lib/utils";

export type ChatMsg = {
  id: string;
  role: "user" | "bot";
  text: string;
  typing?: boolean;
  // Only true for the AI's real chat replies (resolveMessage) — these get
  // the word-by-word typewriter reveal. Instant messages (greeting, menu
  // prompts, canned answers) render immediately, same as the legacy widget.
  animate?: boolean;
  links?: { href: string; label: string }[];
};

// Reveal text word-by-word for a natural, "alive" feel. Honors
// prefers-reduced-motion and skips very short strings. Ported from
// ai-widget.js's typewriterReveal. `skip` covers both "still a typing
// placeholder" (nothing to reveal yet) and "a code-card message" (the
// caller renders structured segments instead and reports its own onDone) —
// in both cases this hook must stay fully inert.
function useTypewriter(text: string, enabled: boolean, skip: boolean, onDone: () => void) {
  const [shown, setShown] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    if (skip) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const tokens = text.split(/(\s+)/);
    if (!enabled || reduced || tokens.length <= 3) {
      // Deferred one tick so the state update happens in a callback rather
      // than synchronously inside the effect body.
      const t = setTimeout(() => {
        setShown(text);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone();
        }
      }, 0);
      return () => clearTimeout(t);
    }
    let i = 0;
    let cancelled = false;
    const step = () => {
      if (cancelled) return;
      i += 2;
      setShown(tokens.slice(0, i).join(""));
      if (i < tokens.length) {
        setTimeout(step, 26);
      } else if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
    };
    const t = setTimeout(step, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, enabled, skip]);

  return shown;
}

export function ChatBubble({
  msg,
  speaking,
  canSpeak,
  onRevealDone,
  onSpeakClick,
}: {
  msg: ChatMsg;
  speaking: boolean;
  canSpeak: boolean;
  onRevealDone: (id: string, text: string) => void;
  onSpeakClick: (id: string, text: string) => void;
}) {
  const withCode = hasCode(msg.text);
  const revealed = useTypewriter(msg.text, !!msg.animate, !!msg.typing || withCode, () =>
    onRevealDone(msg.id, msg.text),
  );

  // Structured (code-card) replies render immediately — report done on mount.
  useEffect(() => {
    if (withCode && !msg.typing) onRevealDone(msg.id, msg.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withCode, msg.typing]);

  if (msg.typing) {
    return (
      <div
        className="flex max-w-[85%] gap-1 rounded-2xl rounded-bl-sm border border-hairline bg-bg-2/60 px-4 py-3"
        aria-label="typing"
      >
        <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted" />
      </div>
    );
  }

  if (msg.role === "user") {
    return (
      <p className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm border border-hairline bg-bg px-4 py-2.5 text-sm text-text-2">
        {msg.text}
      </p>
    );
  }

  return (
    <div className="max-w-[92%] space-y-1">
      <div className="rounded-2xl rounded-bl-sm border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm leading-relaxed text-text">
        {withCode ? (
          parseSegments(msg.text).map((seg, i) =>
            seg.type === "code" ? (
              <CodeCard key={i} lang={seg.lang} value={seg.value} />
            ) : (
              seg.value.trim() && (
                <span key={i} className="whitespace-pre-wrap">
                  {seg.value.trim()}
                </span>
              )
            ),
          )
        ) : (
          <span className="whitespace-pre-wrap">{revealed}</span>
        )}
        {canSpeak && (!msg.animate || revealed === msg.text || withCode) && (
          <button
            type="button"
            onClick={() => onSpeakClick(msg.id, msg.text)}
            title="Read aloud"
            aria-label="Read this message aloud"
            className={cn(
              "ml-1.5 inline-flex size-5 shrink-0 -translate-y-0.5 items-center justify-center align-middle text-muted transition-colors hover:text-accent",
              speaking && "text-accent",
            )}
          >
            {speaking ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </button>
        )}
      </div>
      {msg.links && msg.links.length > 0 && (
        <div className="flex flex-col gap-1 pl-1">
          {msg.links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-xs text-accent underline underline-offset-2 hover:text-accent-strong"
            >
              → {l.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
