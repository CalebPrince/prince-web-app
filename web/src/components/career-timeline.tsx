"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Ported from public/about.html's #career-timeline + public/css/app.css's
// .timeline/.timeline-item/.timeline-marker/.timeline-desc rules. Click (not
// hover) expands one stage at a time, matching the original's plain click
// listener that clears every other .expanded class first.
const STAGES = [
  { label: "Stage 1", title: "Getting started", desc: "Began building small websites and scripts, learning by shipping real projects for real clients instead of just tutorials." },
  { label: "Stage 2", title: "Going full-stack", desc: "Expanded into full-stack API development, database schema design, and CMS architecture, moving from “make it work” to “make it work well.”" },
  { label: "Stage 3", title: "Mobile & cross-platform", desc: "Added React Native to the toolkit, building apps that feel native on both iOS and Android from a single codebase." },
  { label: "Stage 4", title: "AI, where it earns its place", desc: "Started folding custom AI features, chat, automation, content, into projects, but only when they genuinely improve the product." },
  { label: "Today", title: "Working with founders & small teams", desc: "Focused on people who need something built right the first time, not a stack of plugins, and not a six-month engagement for a problem that doesn't need one." },
];

export function CareerTimeline() {
  const [expanded, setExpanded] = React.useState<number | null>(null);

  return (
    <div className="relative pl-10 before:absolute before:left-[0.65rem] before:top-[0.4rem] before:bottom-[0.4rem] before:w-0.5 before:bg-line">
      {STAGES.map((stage, i) => {
        const open = expanded === i;
        return (
          <div
            key={stage.title}
            className={cn("relative cursor-pointer pb-8 last:pb-0")}
            onClick={() => setExpanded(open ? null : i)}
          >
            <span
              className={cn(
                "absolute -left-10 top-1 size-[1.3rem] rounded-full border-[3px] border-editorial-accent bg-card transition-colors duration-150",
                open && "bg-editorial-accent",
              )}
              aria-hidden="true"
            />
            <span className="mb-1 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-muted">
              {stage.label}
            </span>
            <h5 className="mb-1 text-lg font-bold text-heading">{stage.title}</h5>
            <p
              className={cn(
                "mb-0 overflow-hidden text-ink-soft transition-[max-height] duration-[250ms] ease-in-out",
                open ? "max-h-48" : "max-h-0",
              )}
            >
              {stage.desc}
            </p>
            <span className="text-[0.8rem] text-editorial-accent">{open ? "Tap to collapse ↑" : "Tap to expand ↓"}</span>
          </div>
        );
      })}
    </div>
  );
}
