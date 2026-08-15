"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { api } from "@/lib/api";

type Repo = {
  html_url: string;
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
};

// Ported from public/about.html's inline script: reads the admin-configured
// github_username from site content, then fetches recent repos directly from
// the GitHub API (no backend involved). Section stays hidden until repos
// actually load, matching the original's #github-feed-section.d-none reveal.
function relativeTime(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (days < 365) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function GithubActivity() {
  const [repos, setRepos] = React.useState<Repo[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const content = await api.content();
        const raw = (content.github_username || "").trim();
        const username = raw.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\/+$/, "");
        if (!username) return;

        const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=5`);
        if (!res.ok) return;
        const data: Repo[] = await res.json();
        if (!cancelled && Array.isArray(data) && data.length) setRepos(data);
      } catch {
        // GitHub unreachable, rate-limited, or no username configured — section stays hidden
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!repos) return null;

  return (
    <section className="bg-bg-soft py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <p className="mb-2 text-center text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">
          Recent activity
        </p>
        <h3 className="mb-10 text-center text-2xl font-bold">What I&apos;ve been building lately.</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {repos.map((repo) => (
            <a
              key={repo.html_url}
              href={repo.html_url}
              target="_blank"
              rel="noopener"
              className="block rounded-[var(--radius)] border border-line bg-card p-5 transition-colors hover:border-line-strong"
            >
              <h6 className="mb-1 font-bold text-heading">{repo.name}</h6>
              <p className="mb-2 text-sm text-ink-soft">{repo.description || "No description provided."}</p>
              <div className="flex flex-wrap gap-3 text-sm text-editorial-muted">
                {repo.language && <span>● {repo.language}</span>}
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3.5" aria-hidden="true" /> {repo.stargazers_count || 0}
                </span>
                <span>Updated {relativeTime(repo.pushed_at)}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
