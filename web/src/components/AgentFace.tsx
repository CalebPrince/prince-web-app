import { cn } from "@/lib/utils";

// Lisa's chat-widget avatar. Ported from public/js/agent-face.js's "lisa"
// branch (icon + status dot + two radar rings - the generic multi-agent
// eyes/mouth/sheen variant isn't used here, only Lisa appears in this
// app's chat widget) and public/css/app.css's .agent-face--lisa rules.

const SIZES = {
  sm: { core: "size-8", icon: "size-[22px]", dot: "size-[7px]" },
  md: { core: "size-10", icon: "size-[27px]", dot: "size-[9px]" },
} as const;

export function AgentFace({
  thinking = false,
  speaking = false,
  size = "md",
}: {
  thinking?: boolean;
  speaking?: boolean;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  return (
    <span className="relative inline-flex shrink-0">
      {thinking && (
        <>
          <span className="absolute inset-0 animate-ping rounded-full border border-accent" />
          <span
            className="absolute inset-0 animate-ping rounded-full border border-accent"
            style={{ animationDelay: "0.6s" }}
          />
        </>
      )}
      <span
        className={cn(
          "relative z-[1] flex items-center justify-center overflow-hidden rounded-full border border-accent/50 bg-bg text-accent shadow-[0_0_15px_rgba(98,255,152,0.2)] transition-transform",
          s.core,
          speaking && "agent-breathe",
        )}
      >
        <svg
          viewBox="0 0 48 48"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={s.icon}
          aria-hidden="true"
        >
          <circle cx="24" cy="24" r="18" />
          <path d="M15 25h3l2.4-8 4.4 15 3.4-11 2.1 6H34" />
          <path d="M18 37c3.8 2.1 8.2 2.1 12 0" />
        </svg>
        <span
          className={cn(
            "absolute -bottom-px -right-px z-[2] rounded-full border-2 border-bg bg-accent",
            s.dot,
          )}
        />
      </span>
    </span>
  );
}
