"use client";

import * as React from "react";
import Link from "next/link";
import hljs from "highlight.js";
import "highlight.js/styles/atom-one-dark.min.css";
import { api, type BlogPost } from "@/lib/api";
import { Button } from "@/components/ui/button";

// Ported from public/archive-post.html's inline script: same fenced-code
// body parser, same reading-progress hairline (capture-phase scroll
// listener, since scroll doesn't bubble), same related-articles selection
// (same category first, padded with recent others), same share links and
// copy-to-clipboard button, same newsletter form. Dynamic SEO tags are
// replicated as a document.title mutation only (see project-detail.tsx for
// why — the original's own meta-tag mutation isn't real SSR either).
type BodyPart = { type: "prose"; text: string } | { type: "code"; lang: string; code: string };

function parseBody(body: string): BodyPart[] {
  const parts = body.split(/```(\w*)\n?([\s\S]*?)```/g);
  const out: BodyPart[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    const prose = parts[i];
    if (prose && prose.trim()) out.push({ type: "prose", text: prose.trim() });
    const lang = parts[i + 1];
    const code = parts[i + 2];
    if (code !== undefined) out.push({ type: "code", lang: lang || "plaintext", code: code.trim() });
  }
  return out;
}

function publishedDate(p: BlogPost) {
  const raw = String(p.published_at || p.created_at || "").replace(" ", "T");
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const ref = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (ref.current) hljs.highlightElement(ref.current);
  }, [code]);
  return (
    <pre className="overflow-x-auto rounded-xl">
      <code ref={ref} className={`language-${lang}`}>
        {code}
      </code>
    </pre>
  );
}

export function ArchivePostDetail({ slug }: { slug: string }) {
  const [post, setPost] = React.useState<BlogPost | null>(null);
  const [related, setRelated] = React.useState<BlogPost[]>([]);
  const [notFound, setNotFound] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    api
      .blogPost(slug)
      .then((p) => {
        setPost(p);
        document.title = `${p.title}, Prince Caleb`;
        api
          .blog()
          .then((all) => {
            const others = all.filter((r) => r.slug !== slug);
            const withMatchingCategory = others.filter((r) => r.category && r.category === p.category);
            const rest = others.filter((r) => !r.category || r.category !== p.category);
            setRelated([...withMatchingCategory, ...rest].slice(0, 3));
          })
          .catch(() => {});
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  React.useEffect(() => {
    function onScroll() {
      const doc = document.scrollingElement || document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setProgress(max > 0 ? Math.min(doc.scrollTop / max, 1) : 0);
    }
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  if (notFound) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <h1 className="mb-3 text-3xl font-bold text-heading">Article not found</h1>
        <Link href="/archive" className="inline-flex items-center gap-2 text-heading">
          ← Back to the archive
        </Link>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-4 h-6 w-[200px] animate-pulse rounded bg-bg-soft" />
        <div className="mb-4 h-12 w-[70%] animate-pulse rounded bg-bg-soft" />
        <div className="h-[360px] animate-pulse rounded bg-bg-soft" />
      </main>
    );
  }

  const canonicalUrl = `https://princecaleb.dev/archive/${slug}`;
  const shareUrl = encodeURIComponent(canonicalUrl);
  const shareTitle = encodeURIComponent(post.title);
  const bodyParts = parseBody(String(post.body ?? ""));

  return (
    <main>
      <div
        className="fixed inset-x-0 top-0 z-[1100] h-[2px] origin-left bg-editorial-accent"
        style={{ transform: `scaleX(${progress})` }}
        aria-hidden="true"
      />

      <header className="border-b border-line bg-bg pt-40 pb-10 md:pt-44">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {post.category && (
              <p className="m-0 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">{post.category}</p>
            )}
            {publishedDate(post) && <span className="text-sm text-editorial-muted">{publishedDate(post)}</span>}
            <span className="text-sm text-editorial-muted">⏱ {post.reading_time} min read</span>
          </div>
          <h1 className="mb-3 max-w-[11ch] text-[clamp(2.5rem,7vw,5.4rem)] font-bold leading-[1.05] text-heading">{post.title}</h1>
          <p className="max-w-[65ch] text-lg leading-[1.65] text-ink-soft">{post.excerpt}</p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="mt-10 border-t border-line">
          <div
            className="grid items-start gap-6 border-b border-line py-8"
            style={{ gridTemplateColumns: "minmax(160px, 0.32fr) minmax(0, 1fr) minmax(130px, 0.22fr)" }}
          >
            <span className="font-mono text-[0.74rem] uppercase tracking-[0.08em] text-heading">[{post.category || "TECHNICAL NOTE"}]</span>
            <div>
              <h2 className="mb-[0.65rem] text-lg font-bold text-heading">Technical brief</h2>
              <p className="max-w-[68ch] text-ink-soft">{post.excerpt}</p>
            </div>
            <div className="justify-self-end border-l border-line pl-4 text-right">
              <strong className="block text-[clamp(1.35rem,3vw,2.1rem)] leading-none text-heading">{post.reading_time} min</strong>
              <span className="mt-[0.45rem] block text-[0.78rem] text-editorial-muted">Reading time</span>
            </div>
          </div>
        </div>

        <div className="mt-10 max-w-[760px]">
          <div className="mb-6 flex flex-wrap gap-2">
            <a
              href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareTitle}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-[0.9rem] py-[0.4rem] text-sm text-ink-soft transition-colors hover:border-editorial-accent hover:text-editorial-accent"
            >
              𝕏 Share
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-[0.9rem] py-[0.4rem] text-sm text-ink-soft transition-colors hover:border-editorial-accent hover:text-editorial-accent"
            >
              in Share
            </a>
            <a
              href={`https://wa.me/?text=${shareTitle}%20${shareUrl}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-[0.9rem] py-[0.4rem] text-sm text-ink-soft transition-colors hover:border-editorial-accent hover:text-editorial-accent"
            >
              💬 WhatsApp
            </a>
            <CopyLinkButton url={canonicalUrl} />
          </div>

          <div className="text-ink-soft">
            {bodyParts.map((part, i) =>
              part.type === "prose" ? (
                <p key={i} className="mb-4 whitespace-pre-line">
                  {part.text}
                </p>
              ) : (
                <CodeBlock key={i} lang={part.lang} code={part.code} />
              ),
            )}
          </div>
        </div>

        <PostNewsletter />

        <div className="mt-10 border-t border-line pt-8 text-center">
          <h4 className="mb-3 text-xl font-bold text-heading">Want something like this built for your business?</h4>
          <Button variant="brand" size="pill" className="group" nativeButton={false} render={<Link href="/contact" />}>
            Let&apos;s talk about your project{" "}
            <span className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
              →
            </span>
          </Button>
        </div>

        {related.length > 0 && (
          <div className="mt-16 border-t border-line pt-10">
            <p className="mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Keep reading</p>
            <h3 className="mb-6 text-2xl font-bold text-heading">Related articles</h3>
            <div className="grid gap-5 md:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/archive/${r.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-line transition-[transform,border-color,background-color] duration-300 hover:-translate-y-1.5 hover:border-line-strong hover:bg-card"
                >
                  <div className="border-b border-line bg-bg-soft px-8 py-16 text-center">
                    <code className="mb-2 block text-[0.85rem] text-heading">archive_record: {r.slug}</code>
                    <div className="font-mono text-[0.78rem] text-editorial-muted">{r.category || "Technical archive"}</div>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <div className="mb-2 flex items-center justify-between">
                      {r.category ? (
                        <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">{r.category}</span>
                      ) : (
                        <span />
                      )}
                      <span className="text-sm text-editorial-muted">⏱ {r.reading_time} min read</span>
                    </div>
                    <h5 className="mb-2 font-bold text-heading">{r.title}</h5>
                    <span className="mt-auto text-sm font-semibold text-heading">
                      Read article{" "}
                      <span className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                        →
                      </span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Could not copy the link, you can copy it from the address bar.");
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-[0.9rem] py-[0.4rem] text-sm text-ink-soft transition-colors hover:border-editorial-accent hover:text-editorial-accent"
    >
      {copied ? "✓ Copied!" : "🔗 Copy link"}
    </button>
  );
}

function PostNewsletter() {
  const [email, setEmail] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: "success" | "danger"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.subscribeNewsletter({ email, website, attribution: {} });
      setEmail("");
      setMsg({ type: "success", text: "You're on the list, watch your inbox for the next post." });
    } catch (err) {
      setMsg({ type: "danger", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-16 grid items-center gap-8 rounded-[18px] border border-line bg-card p-8 shadow-sm md:grid-cols-[1fr_0.85fr]">
      <div>
        <p className="mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Field notes</p>
        <h3 className="mb-1 text-xl font-bold text-heading">Get the next useful build note.</h3>
        <p className="text-ink-soft">Occasional, practical writing on shipping better digital products. No noise.</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="flex gap-[0.65rem] max-md:flex-col">
          <input
            type="email"
            required
            placeholder="you@company.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-4 py-3 text-ink outline-none focus:border-editorial-accent"
          />
          <div className="hidden" aria-hidden="true">
            <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <Button type="submit" variant="brand" size="pill" className="shrink-0" disabled={submitting}>
            {submitting ? "Joining…" : "Join the list"}
          </Button>
        </div>
        <p className="mt-2 text-sm text-editorial-muted">
          Unsubscribe anytime. See the{" "}
          <Link href="/privacy" className="text-editorial-accent underline">
            privacy policy
          </Link>
          .
        </p>
        {msg && (
          <p
            className={
              msg.type === "success"
                ? "mt-3 rounded-lg bg-status-ok-bg px-3 py-2 text-sm text-status-ok-text"
                : "mt-3 rounded-lg bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text"
            }
          >
            {msg.text}
          </p>
        )}
      </form>
    </section>
  );
}
