"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { categoriesOf, getFeaturedSystems, getSystems, type SystemView } from "@/lib/systems";
import { IntakeCta } from "@/components/IntakeCta";

export function ProjectDevices({ system }: { system: SystemView }) {
  const [failed, setFailed] = useState(false);
  if (!system.img || system.img.includes("/placeholder-") || failed) {
    return <div className="project-devices project-image-empty"><span>{system.name}<small>Project preview unavailable</small></span></div>;
  }
  // Existing covers include composed device photography: preserve the whole image.
  return <div className="project-devices"><img src={system.img} alt={`${system.name} website preview`} loading="lazy" onError={() => setFailed(true)} /></div>;
}

export function PortfolioPreview({ system }: { system?: SystemView }) {
  if (!system) return null;
  return <Link href={`/work/${system.slug}`} className="portfolio-preview">
    <ProjectDevices system={system} />
    <span>{system.name}<span>Explore project <ArrowRight size={16} /></span></span>
  </Link>;
}

export function PortfolioCta() {
  return <section className="portfolio-cta">
    <div><p className="portfolio-eyebrow">Let’s work together</p><h2>Ready to build<br />your next website?</h2><p>Tell me what your business needs. We’ll agree the scope, cost and delivery before work begins.</p><IntakeCta kind="project">Start a project <ArrowRight size={16} /></IntakeCta></div>
    <div className="portfolio-cta-details"><span>Based in Accra.<br /><strong>Building worldwide.</strong></span><p>Custom websites · Applications · AI tools</p><Link href="/working-together">How we’ll work together <ArrowRight size={16} /></Link></div>
  </section>;
}

export function PortfolioShowcase({ featured = false }: { featured?: boolean }) {
  const [systems, setSystems] = useState<SystemView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (featured ? getFeaturedSystems(6) : getSystems()).then((items) => {
      if (active) setSystems(items);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [featured, attempt]);
  const shown = systems?.filter((s) => filter === null || s.category === filter);
  return <div>
    <div className="portfolio-filters" role="group" aria-label="Project categories">
      {categoriesOf(systems ?? []).map((category) => <button key={category} type="button" aria-pressed={filter === category} onClick={() => setFilter(filter === category ? null : category)}>{category}</button>)}
    </div>
    <div aria-live="polite" className="portfolio-status">{systems ? `${shown?.length} project${shown?.length === 1 ? "" : "s"}` : ""}</div>
    {failed ? <div role="alert" className="portfolio-message">Projects couldn’t load. <button onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Try again</button></div> : systems === null ? <div className="portfolio-grid" aria-label="Loading projects" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div className="portfolio-skeleton" key={i} />)}</div> : shown?.length === 0 ? <p className="portfolio-message">No projects to show yet.</p> : <div className="portfolio-grid">{shown?.map((system) => <article className="portfolio-card" key={system.slug}>
      <Link href={`/work/${system.slug}`} aria-label={`Explore ${system.name}`}><ProjectDevices system={system} /></Link>
      <div className="portfolio-card-body"><h3><Link href={`/work/${system.slug}`}>{system.name}</Link></h3><p>{system.desc}</p><div className="portfolio-card-footer"><div className="portfolio-tags"><span>{system.category}</span>{system.stack.slice(0, 1).map((tag) => <span key={tag.name}>{tag.name}</span>)}</div>{system.live ? <a href={system.live} target="_blank" rel="noopener noreferrer" aria-label={`View ${system.name} live site (opens in new tab)`}>View live site <ArrowRight size={16} /></a> : <Link href={`/work/${system.slug}`}>View project <ArrowRight size={16} /></Link>}</div></div>
    </article>)}</div>}
  </div>;
}
