"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, Play } from "lucide-react";
import { api } from "@/lib/api";

import VideoShowcase, { VideoHero } from "./VideoShowcase";

const SERVICES = [
  { no: "01", title: "Keep the feeling.", category: "Wedding films & highlights", body: "Cinematic highlights and thoughtful social edits from the wedding footage you provide. Shaped around the moments that matter to you.", tags: "Highlights / Memories / Social cuts" },
  { no: "02", title: "Ads that get to the point.", category: "Brand & social ads", body: "A sharp hook, a clear offer and a reason to act. Short-form ads for launches, campaigns and everyday business.", tags: "Reels / TikTok / Shorts" },
  { no: "03", title: "Show what makes it work.", category: "Product & app videos", body: "Turn your product, website or app into a story people can follow, with screen captures, device frames and motion.", tags: "Demos / Launch films / Walkthroughs" },
  { no: "04", title: "Make the complex click.", category: "Explainers & motion graphics", body: "Scripts, animated type and clear visual sequences that make your idea easier to understand and remember.", tags: "Explainers / Kinetic type / Brand motion" },
  { no: "05", title: "Give your voice a visual.", category: "Creator & talking-head content", body: "Bring a speaker’s story into focus with purposeful cuts, caption treatments and graphics that support the message.", tags: "Founder stories / Educational clips" },
  { no: "06", title: "Let the sound lead.", category: "Music & podcast promos", body: "Beat-led edits, lyric animation and podcast trailers that put the audio at the centre of the visual story.", tags: "Lyric videos / Trailers / Promos" },
  { no: "07", title: "One story. Every screen.", category: "Captions & platform versions", body: "Readable captions and carefully framed versions for vertical, landscape, square and feed placements.", tags: "9:16 / 16:9 / 1:1 / 4:5" },
] as const;

const STEPS = [
  ["The brief", "Your audience, your offer, your goal. We agree the format, scope and quote before production."],
  ["The story", "A script and visual direction give the work a clear spine. You review the plan before the edit."],
  ["The cut", "Footage, design, voice, music and motion come together. Your feedback shapes the agreed revisions."],
  ["The delivery", "Approved files in the agreed formats, with captions and platform versions where included in your scope."],
];

export default function VidKre8Studio() {
  const [service, setService] = useState<string>(SERVICES[0].category);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="vk-studio">
      <a href="#vk-main" className="vk-skip">Skip to content</a>
      <header className="vk-header">
        <a href="#" aria-label="VidKre8 home" className="vk-brand">
          <Image src="/vidkre8/logo.svg" width={622} height={216} priority alt="VidKre8 by PrinceCaleb.dev" />
        </a>
        <nav aria-label="Studio navigation" className="vk-nav">
          <a href="#vk-work">Watch the work</a><a href="#vk-services">What we do</a><a href="#vk-process">The process</a>
        </nav>
        <a className="vk-button vk-button-small" href="#vk-brief">Start a project <ArrowUpRight size={16} aria-hidden="true" /></a>
      </header>

      <main id="vk-main">
        <section className="vk-hero vk-container">
          <div className="vk-hero-top"><span className="vk-eyebrow"><i /> Independent video & motion studio</span><Link href="/" className="vk-parent">By PrinceCaleb.dev <ArrowUpRight size={13} aria-hidden="true" /></Link></div>
          <div className="vk-hero-grid">
            <div className="vk-hero-copy">
              <h1>Make them<br /><span>stop.</span><br />Give them<br />a story<span className="vk-period">.</span></h1>
              <p>Wedding films, video ads, product stories and motion with a point of view. From the first idea to the final frame.</p>
              <div className="vk-hero-actions"><a href="#vk-brief" className="vk-button">Let’s make something <ArrowUpRight size={18} aria-hidden="true" /></a><a href="#vk-work" className="vk-text-link">Watch the films <ArrowDown size={16} aria-hidden="true" /></a></div>
            </div>
            <VideoHero />
          </div>
        </section>

        <div className="vk-ticker" aria-label="Ads, explainers, product films and creator content"><div aria-hidden="true">WEDDING FILMS <span>✳</span> BRAND FILMS <span>✳</span> MOTION DESIGN <span>✳</span> SOCIAL ADS <span>✳</span> PRODUCT STORIES <span>✳</span> CREATOR CONTENT <span>✳</span></div></div>

        <VideoShowcase />

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

      <footer className="vk-footer vk-container"><div className="vk-footer-top"><a href="#" aria-label="VidKre8 home"><Image src="/vidkre8/logo.svg" width={622} height={216} alt="VidKre8 by PrinceCaleb.dev" /></a><p>Ideas into frames.<br />Frames into feeling.</p><nav aria-label="Studio footer"><a href="#vk-work">Watch the work</a><a href="#vk-services">Services</a><a href="#vk-brief">Start a project</a></nav></div><div className="vk-footer-bottom"><span>© {new Date().getFullYear()} VidKre8 / PrinceCaleb.dev</span><Link href="/"><ArrowLeft size={14} aria-hidden="true" /> Back to Prince Caleb</Link><Link href="/privacy">Privacy</Link></div></footer>
    </div>
  );
}
