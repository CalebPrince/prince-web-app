"use client";

import * as React from "react";

// Ported from public/js/animations.js's setupStoryChapters — a scroll-spy
// over [data-story-chapter] sections that toggles .is-chapter-active (soft
// background glow + heading entrance, see globals.css). Homepage-only,
// mounted by page.tsx once the section markup below carries the matching
// data-story-chapter attributes.
export function StoryChapters() {
  React.useEffect(() => {
    const chapters = Array.from(document.querySelectorAll<HTMLElement>("[data-story-chapter]"));
    if (!chapters.length || !("IntersectionObserver" in window)) return;

    const activate = (active: Element | null) => {
      chapters.forEach((chapter) => chapter.classList.toggle("is-chapter-active", chapter === active));
    };

    const chapterObserver = new IntersectionObserver(
      (entries) => {
        let candidate: IntersectionObserverEntry | null = null;
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          if (!candidate || entry.intersectionRatio > candidate.intersectionRatio) {
            candidate = entry;
          }
        });
        if (candidate) activate((candidate as IntersectionObserverEntry).target);
      },
      { threshold: [0.25, 0.45, 0.65], rootMargin: "-12% 0px -28% 0px" }
    );

    chapters.forEach((chapter) => chapterObserver.observe(chapter));

    const inView = chapters.find((chapter) => {
      const rect = chapter.getBoundingClientRect();
      return rect.top < window.innerHeight * 0.62 && rect.bottom > window.innerHeight * 0.25;
    });
    if (inView) activate(inView);

    return () => chapterObserver.disconnect();
  }, []);

  return null;
}
