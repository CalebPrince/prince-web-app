"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { api } from "@/lib/api";

const PROJECTS = [
  { name: "Think of Fashion", category: "Fashion / Brand film", image: "fashion", headline: "Wear your\nown story.", detail: "A beat-led fashion film with kinetic type, fast transitions and a collection of the brand’s own looks.", duration: "30 sec", shape: "9:16", color: "fashion" },
  { name: "BuineePay", category: "Fintech / Product commercial", image: "payment", headline: "Everyday life.\nOne easy pay.", detail: "A fintech commercial built around everyday moments, notification cards, voice-led storytelling and a clear product reveal.", duration: "36 sec", shape: "9:16", color: "payment" },
  { name: "The Long Table", category: "Podcast / Season trailer", image: "podcast", headline: "Good stories.\nGreat company.", detail: "A podcast season trailer with an audio-player visual, waveform-led motion, captions and a platform reveal.", duration: "32.6 sec", shape: "9:16 + 16:9", color: "podcast" },
] as const;

const SERVICES = [
  { no: "01", title: "Ads that get to the point.", category: "Brand & social ads", body: "A sharp hook, a clear offer and a reason to act. Short-form ads for launches, campaigns and everyday business.", tags: "Reels / TikTok / Shorts" },
  { no: "02", title: "Show what makes it work.", category: "Product & app videos", body: "Turn your product, website or app into a story people can follow, with screen captures, device frames and motion.", tags: "Demos / Launch films / Walkthroughs" },
  { no: "03", title: "Make the complex click.", category: "Explainers & motion graphics", body: "Scripts, animated type and clear visual sequences that make your idea easier to understand and remember.", tags: "Explainers / Kinetic type / Brand motion" },
  { no: "04", title: "Give your voice a visual.", category: "Creator & talking-head content", body: "Bring a speaker’s story into focus with purposeful cuts, caption treatments and graphics that support the message.", tags: "Founder stories / Educational clips" },
  { no: "05", title: "Let the sound lead.", category: "Music & podcast promos", body: "Beat-led edits, lyric animation and podcast trailers that put the audio at the centre of the visual story.", tags: "Lyric videos / Trailers / Promos" },
  { no: "06", title: "One story. Every screen.", category: "Captions & platform versions", body: "Readable captions and carefully framed versions for vertical, landscape, square and feed placements.", tags: "9:16 / 16:9 / 1:1 / 4:5" },
] as const;

const STEPS = [
  ["The brief", "Your audience, your offer, your goal. We agree the format, scope and quote before production."],
  ["The story", "A script and visual direction give the work a clear spine. You review the plan before the edit."],
  ["The cut", "Footage, design, voice, music and motion come together. Your feedback shapes the agreed revisions."],
  ["The delivery", "Approved files in the agreed formats, with captions and platform versions where included in your scope."],
];

export default function VidKre8Studio() {
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [service, setService] = useState<string>(SERVICES[0].category);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setSelected((index) => (index + 1) % PROJECTS.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [playing]);

  const selectProject = (index: number) => {
    setPlaying(false);
    setSelected((index + PROJECTS.length) % PROJECTS.length);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const brief = String(form.get("brief") ?? "").trim();
    if (!name || !email || brief.length < 10) {
      setError("Add your name, email and a short brief of at least 10 characters.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      await api.submitInquiry({
        name, email,
        message: `VidKre8 video enquiry\nService: ${service}\nBudget: ${String(form.get("budget") ?? "Not sure yet")}\n\n${brief}`,
        website: String(form.get("website") ?? ""),
        source_project_id: null,
        attribution: { source: "vidkre8", landing_page: "/vidkre8" },
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your brief could not be sent. Please try again or use the contact page.");
    } finally {
      setSending(false);
    }
  };

  const project = PROJECTS[selected];

  return (
    <div className="vk-studio">
      <a href="#vk-main" className="vk-skip">Skip to content</a>
      <header className="vk-header">
        <a href="#" aria-label="VidKre8 home" className="vk-brand">
          <Image src="/vidkre8/logo.svg" width={622} height={216} priority alt="VidKre8 by PrinceCaleb.dev" />
        </a>
        <nav aria-label="Studio navigation" className="vk-nav">
          <a href="#vk-work">The work</a><a href="#vk-services">What we do</a><a href="#vk-process">The process</a>
        </nav>
        <a className="vk-button vk-button-small" href="#vk-brief">Start a project <ArrowUpRight size={16} aria-hidden="true" /></a>
      </header>

      <main id="vk-main">
        <section className="vk-hero vk-container">
          <div className="vk-hero-top"><span className="vk-eyebrow"><i /> Independent video & motion studio</span><Link href="/" className="vk-parent">By PrinceCaleb.dev <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
          <div className="vk-hero-grid">
            <div className="vk-hero-copy">
              <h1>Make them<br /><span>stop.</span><br />Give them<br />a story<span className="vk-period">.</span></h1>
              <p>Video ads, product films and motion with a point of view. From the first idea to the final frame.</p>
              <div className="vk-hero-actions"><a href="#vk-brief" className="vk-button">Let’s make something <ArrowUpRight size={18} aria-hidden="true" /></a><a href="#vk-work" className="vk-text-link">Explore the work <ArrowDown size={16} aria-hidden="true" /></a></div>
            </div>
            <div className="vk-reel-wrap">
              <div className="vk-reel-note"><span>STUDIO SELECTS</span><span>VOL. 01 / 2026</span></div>
              <div className={`vk-reel vk-reel-${project.color}`}>
                {PROJECTS.map((item, i) => (
                  <div className={`vk-reel-frame ${selected === i ? "is-selected" : ""}`} key={item.name} aria-hidden={selected !== i}>
                    <Image src={`/vidkre8/${item.image}.svg`} fill sizes="(max-width: 760px) 90vw, 48vw" priority={i === 0} alt="" className="vk-reel-photo" />
                    <div className="vk-reel-shade" />
                    <div className="vk-frame-tag">{item.category}</div>
                    <p className="vk-frame-headline">{item.headline}</p>
                    <span className="vk-frame-credit">{item.name}</span>
                  </div>
                ))}
                <div className="vk-frame-corners" aria-hidden="true"><span /><span /><span /><span /></div>
                <div className="vk-reel-controls">
                  <button type="button" className="vk-play" aria-label={playing ? "Pause motion preview" : "Play motion preview"} aria-pressed={playing} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}</button>
                  <div className="vk-preview-label"><strong>Motion preview</strong><span>Project stills / studio motion</span></div>
                  <button type="button" className="vk-arrow" aria-label="Previous project" onClick={() => selectProject(selected - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
                  <button type="button" className="vk-arrow" aria-label="Next project" onClick={() => selectProject(selected + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
                </div>
              </div>
              <div className="vk-reel-bottom"><span>IDEA → STORY → MOTION</span><span>Sound. Timing. Feeling.</span></div>
            </div>
          </div>
        </section>

        <div className="vk-ticker" aria-label="Ads, explainers, product films and creator content"><div aria-hidden="true">BRAND FILMS <span>✳</span> MOTION DESIGN <span>✳</span> SOCIAL ADS <span>✳</span> PRODUCT STORIES <span>✳</span> CREATOR CONTENT <span>✳</span></div></div>

        <section id="vk-work" className="vk-work vk-container">
          <div className="vk-section-head"><div><span className="vk-eyebrow">01 / Selected projects</span><h2>Different stories.<br />Same attention to detail.</h2></div><p>A few directions from the studio.<br />Real project imagery. Every frame intentional.</p></div>
          <div className="vk-project-grid">
            {PROJECTS.map((item, i) => (
              <article key={item.name} className={`vk-project vk-project-${item.color}`}>
                <button type="button" className="vk-project-image" aria-label={`Preview ${item.name}`} onClick={() => { selectProject(i); document.getElementById("vk-project-detail")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" }); }} aria-pressed={selected === i}>
                  <Image src={`/vidkre8/${item.image}.svg`} fill sizes="(max-width: 640px) 90vw, 30vw" alt={item.name === "Think of Fashion" ? "A look featured in the Think of Fashion project" : item.name === "BuineePay" ? "Shopping imagery from the BuineePay commercial" : "A studio microphone from The Long Table trailer"} />
                  <span className="vk-project-stamp">{item.duration} / {item.shape}</span>
                  <span className="vk-project-overlay">{item.headline}</span>
                  <span className="vk-project-view">Explore project <ArrowUpRight size={18} aria-hidden="true" /></span>
                </button>
                <div className="vk-project-title"><h3>{item.name}</h3><span>0{i + 1}</span></div><p>{item.category}</p>
              </article>
            ))}
          </div>
          <div id="vk-project-detail" className="vk-project-detail" aria-live="polite" aria-atomic="true"><span className="vk-eyebrow">In focus / {project.name}</span><p>{project.detail}</p><a href="#vk-brief" className="vk-text-link">Have something like this in mind? <ArrowUpRight size={17} aria-hidden="true" /></a></div>
        </section>

        <section id="vk-services" className="vk-services">
          <div className="vk-container">
            <div className="vk-section-head"><div><span className="vk-eyebrow">02 / What we make</span><h2>Your message.<br />Made to move.</h2></div><p>For the launch. The feed. The big idea.<br />We shape the format around the story.</p></div>
            <div className="vk-services-grid">{SERVICES.map((item) => <article key={item.no} className="vk-service"><div className="vk-service-top"><span>{item.no}</span><ArrowUpRight size={25} aria-hidden="true" /></div><p className="vk-service-category">{item.category}</p><h3>{item.title}</h3><p className="vk-service-body">{item.body}</p><span className="vk-service-tags">{item.tags}</span></article>)}</div>
          </div>
        </section>

        <section className="vk-formats vk-container" aria-labelledby="vk-formats-title">
          <div><span className="vk-eyebrow">Built for where it plays</span><h2 id="vk-formats-title">Not every screen<br />tells it the same way.</h2><p>Vertical for the scroll. Wide for the full picture. Versions framed for your placements, with captions that stay readable.</p><span className="vk-formats-note">Formats and caption deliverables agreed in your quote.</span></div>
          <div className="vk-format-diagram" aria-label="Available formats: 9 by 16, 4 by 5, 1 by 1 and 16 by 9"><div className="vk-format vk-format-tall"><Play aria-hidden="true" /><span>9:16</span></div><div className="vk-format vk-format-feed"><span>4:5</span></div><div className="vk-format vk-format-square"><span>1:1</span></div><div className="vk-format vk-format-wide"><span>16:9</span></div><span className="vk-format-caption">ONE STORY / MULTIPLE PERSPECTIVES</span></div>
        </section>

        <section id="vk-process" className="vk-process vk-container">
          <div className="vk-section-head"><div><span className="vk-eyebrow">03 / From brief to final cut</span><h2>Good work.<br />A clear process.</h2></div><p>You know what’s happening<br />before we hit the next frame.</p></div>
          <ol className="vk-steps">{STEPS.map(([title, body], i) => <li key={title}><span className="vk-step-no">0{i + 1}</span><h3>{title}</h3><p>{body}</p></li>)}</ol>
        </section>

        <section id="vk-brief" className="vk-brief">
          <div className="vk-container vk-brief-grid">
            <div className="vk-brief-copy"><span className="vk-eyebrow">04 / Your next story</span><h2>Got a brief?<br />An idea?<br /><span>Let’s roll.</span></h2><p>Tell us what you’re making, who it’s for and where it needs to play. We’ll come back with a scope, timeline and quote.</p><p className="vk-quote-note">Every project is quoted to its scope. Production, revisions and deliverables are agreed before work begins.</p><Link href="/contact" className="vk-text-link">Prefer a conversation? Get in touch <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
            {sent ? <div className="vk-success" role="status"><Check size={42} aria-hidden="true" /><h3>Your story starts here.</h3><p>Your VidKre8 brief has been sent. We’ll reply using the email address you provided.</p><button type="button" className="vk-button" onClick={() => setSent(false)}>Send another brief <ArrowRight size={17} aria-hidden="true" /></button></div> :
              <form className="vk-brief-form" onSubmit={submit} aria-label="VidKre8 project brief">
                <div className="vk-form-row"><label>Your name<input name="name" autoComplete="name" required maxLength={120} placeholder="What should we call you?" /></label><label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@yourbrand.com" /></label></div>
                <label>What are we making?<select name="service" value={service} onChange={(event) => setService(event.target.value)}>{SERVICES.map((item) => <option key={item.no} value={item.category}>{item.category}</option>)}<option>Something else / help me choose</option></select></label>
                <label>Budget range<select name="budget" defaultValue="Not sure yet"><option>Not sure yet</option><option>Under GHS 3,000</option><option>GHS 3,000–7,000</option><option>GHS 7,000–15,000</option><option>GHS 15,000+</option></select></label>
                <label>The idea<textarea name="brief" rows={4} required minLength={10} maxLength={4000} placeholder="The goal, audience, platform, deadline… and any references you love." /></label>
                <div className="vk-honeypot" aria-hidden="true"><label>Leave this field blank<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
                {error && <p className="vk-error" role="alert">{error}</p>}
                <button className="vk-button vk-submit" type="submit" disabled={sending}>{sending ? "Sending your brief…" : "Send the brief"}<ArrowUpRight size={19} aria-hidden="true" /></button>
                <p className="vk-form-privacy">Your details are used to respond to your enquiry. <Link href="/privacy">Privacy policy</Link>.</p>
              </form>}
          </div>
        </section>
      </main>

      <footer className="vk-footer vk-container"><div className="vk-footer-top"><a href="#" aria-label="VidKre8 home"><Image src="/vidkre8/logo.svg" width={622} height={216} alt="VidKre8 by PrinceCaleb.dev" /></a><p>Ideas into frames.<br />Frames into feeling.</p><nav aria-label="Studio footer"><a href="#vk-work">The work</a><a href="#vk-services">Services</a><a href="#vk-brief">Start a project</a></nav></div><div className="vk-footer-bottom"><span>© {new Date().getFullYear()} VidKre8 / PrinceCaleb.dev</span><Link href="/"><ArrowLeft size={14} aria-hidden="true" /> Back to Prince Caleb</Link><Link href="/privacy">Privacy</Link></div></footer>
    </div>
  );
}
