"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type ClarityWindow = Window & {
  clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] };
};

const isPrivate = (path: string) =>
  path.startsWith("/admin") || path.startsWith("/client");

// The inline tag in the root layout decides once, on a full page load, whether
// Clarity runs. Moving between the public site and the admin or client apps
// without a reload never re-runs it, so this follows the route instead: it
// stops the recording on the way into a private app, and starts it (or starts
// it again) on the way back out to a public page.
//
// A layout effect rather than a plain one: it runs before Clarity's own
// observer is handed the new page, so the private app's first screen is not
// caught in the last upload.
export function ClarityGuard({
  projectId,
  siteHost,
}: {
  projectId: string;
  siteHost: string;
}) {
  const pathname = usePathname() ?? "";
  const stopped = useRef(false);

  useLayoutEffect(() => {
    // Production only, the same rule as the inline tag.
    if (location.hostname.replace(/^www\./, "") !== siteHost) return;
    const w = window as ClarityWindow;

    if (isPrivate(pathname)) {
      if (typeof w.clarity === "function") {
        w.clarity("stop");
        stopped.current = true;
      }
      return;
    }

    // Public page. Nothing to do unless the tag never loaded (the visit began
    // inside a private app) or this component stopped it earlier.
    if (typeof w.clarity === "function" && !stopped.current) return;

    // Always a fresh queue, also over a stopped Clarity: the tag pushes onto
    // window.clarity.q as it loads, and the real function Clarity leaves
    // behind after a stop has no queue, so the tag throws without this.
    const queue: NonNullable<ClarityWindow["clarity"]> = (...args) => {
      (queue.q = queue.q || []).push(args);
    };
    w.clarity = queue;
    // Loading the tag again is what restarts a stopped recording: it carries
    // the project's settings, which a bare "start" call would not have.
    const tag = document.createElement("script");
    tag.async = true;
    tag.src = `https://www.clarity.ms/tag/${projectId}`;
    document.head.appendChild(tag);
    stopped.current = false;
  }, [pathname, projectId, siteHost]);

  return null;
}
