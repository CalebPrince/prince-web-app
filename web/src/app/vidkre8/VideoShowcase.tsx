"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Play } from "lucide-react";
import { STUDIO_VIDEOS, VIDEO_CATEGORIES, type StudioVideo, type VideoCategory } from "@/lib/vidkre8-videos";

function VideoThumbnail({ film }: { film: StudioVideo }) {
  return (
    <span className={`vk-thumbnail vk-thumbnail-${film.id}`}>
      <Image src={film.poster} fill sizes="(max-width: 650px) 90vw, 45vw" alt="" />
      <span className="vk-thumbnail-shade" />
      <span className="vk-thumbnail-brand"><span><Play size={16} aria-hidden="true" /> VidKre8</span><span>{film.category}</span></span>
      <span className="vk-card-play"><Play size={26} aria-hidden="true" /></span>
      <span className="vk-thumbnail-title">{film.title}</span>
      <span className="vk-thumbnail-meta">{film.seconds} SEC {film.excerpt ? "EXCERPT" : "FILM"}<span>{film.kind}</span></span>
    </span>
  );
}

export function VideoHero() {
  const film = STUDIO_VIDEOS[0];
  return (
    <div className="vk-reel-wrap">
      <div className="vk-reel-note"><span>THE STUDIO SCREEN</span><span>VIDKRE8 / SELECTED CUTS</span></div>
      <a href="#vk-work" className="vk-hero-screen vk-custom-hero" aria-label="Watch VidKre8 sample videos">
        <VideoThumbnail film={film} />
        <span className="vk-screen-link">Wedding films. Brand stories. Motion. <ArrowUpRight size={20} aria-hidden="true" /></span>
      </a>
      <div className="vk-reel-bottom"><span>STUDIO & CONCEPT WORK</span><span>Picture. Rhythm. Feeling.</span></div>
    </div>
  );
}

export default function VideoShowcase() {
  const [category, setCategory] = useState<VideoCategory>("All work");
  const [selectedId, setSelectedId] = useState(STUDIO_VIDEOS[0].id);
  const [playRequested, setPlayRequested] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const selected = STUDIO_VIDEOS.find((film) => film.id === selectedId) ?? STUDIO_VIDEOS[0];
  const filtered = STUDIO_VIDEOS.filter((film) => category === "All work" || film.category === category);

  useEffect(() => {
    const player = video.current;
    if (playRequested && player) void player.play().catch(() => { /* Native controls remain available if autoplay is blocked. */ });
    return () => { player?.pause(); };
  }, [selectedId, playRequested]);

  const select = (id: string) => {
    setSelectedId(id);
    setVideoError(false);
    if (id !== selectedId) setHasStarted(false);
    else if (video.current) {
      video.current.currentTime = 0;
      void video.current.play().catch(() => {});
    }
    setPlayRequested(true);
    stage.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  };

  const filter = (next: VideoCategory) => {
    setCategory(next);
    setPlayRequested(false);
    setVideoError(false);
    setHasStarted(false);
    const first = STUDIO_VIDEOS.find((film) => next === "All work" || film.category === next);
    if (first) setSelectedId(first.id);
  };

  return (
    <section id="vk-work" className="vk-work vk-container" aria-labelledby="vk-work-title">
      <div className="vk-section-head"><div><span className="vk-eyebrow">01 / The screening room</span><h2 id="vk-work-title">Less describing.<br />More pressing play.</h2></div><p>Selected cuts from studio and concept work. Watch complete films alongside short, silent reel excerpts. Each sample is labelled with its actual length.</p></div>
      <div className="vk-video-filters" role="group" aria-label="Filter sample videos">
        {VIDEO_CATEGORIES.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => filter(item)}>{item}</button>)}
      </div>
      <div className="vk-cinema" ref={stage}>
        <div className="vk-cinema-screen">
          {/* Native controls provide keyboard playback, volume and fullscreen. */}
          <video key={selected.id} ref={video} src={selected.src} poster={selected.poster} controls playsInline preload="none" tabIndex={hasStarted ? 0 : -1} aria-label={`Play ${selected.title} ${selected.excerpt ? "excerpt" : "film"}`} aria-describedby="vk-film-description vk-film-length" onPlay={() => setHasStarted(true)} onError={() => setVideoError(true)}>
            Your browser does not support video. <a href={selected.src}>Open the sample video</a>.
          </video>
          {!hasStarted && <button type="button" className="vk-player-cover" aria-label={`Start ${selected.title}`} onClick={() => { setPlayRequested(true); void video.current?.play().catch(() => {}); }}><VideoThumbnail film={selected} /></button>}
        </div>
        <div className="vk-film-info">
          <span className="vk-eyebrow">Now showing / {selected.category}</span>
          <h3>{selected.title}</h3>
          <span className="vk-film-kind">{selected.kind}</span>
          <p id="vk-film-description">{selected.description}</p>
          <p id="vk-film-length" className="vk-film-length">{selected.seconds} sec {selected.excerpt ? "excerpt" : "film"} <span aria-hidden="true">·</span> 9:16 <span aria-hidden="true">·</span> {selected.silent ? "Silent" : "Sound available"}</p>
          {videoError && <div className="vk-video-error" role="alert"><p>The video could not load. Please try again.</p><button type="button" onClick={() => { setVideoError(false); video.current?.load(); void video.current?.play().catch(() => {}); }}>Retry video</button></div>}
          <a href="#vk-brief" className="vk-text-link">Make something like this <ArrowUpRight size={18} aria-hidden="true" /></a>
        </div>
      </div>
      <p className="vk-gallery-count" role="status">{filtered.length} {filtered.length === 1 ? "sample" : "samples"}{category !== "All work" ? ` / ${category}` : " / Studio selects"}</p>
      <div className="vk-project-grid">
        {filtered.map((film, i) => (
          <article className="vk-project" key={film.id}>
            <button type="button" className="vk-project-image vk-video-card" onClick={() => select(film.id)} aria-label={`Watch ${film.title}`} aria-pressed={selected.id === film.id}>
              <VideoThumbnail film={film} />
              <span className="vk-project-view">{film.excerpt ? "Play excerpt" : "Watch film"} <ArrowUpRight size={20} aria-hidden="true" /></span>
            </button>
            <div className="vk-project-title"><h3>{film.title}</h3><span>{String(i + 1).padStart(2, "0")}</span></div>
            <p>{film.kind}</p><p className="vk-card-duration">{film.seconds} sec {film.excerpt ? "excerpt" : "film"} · {film.silent ? "Silent" : "Sound available"}</p>
          </article>
        ))}
      </div>
      <p className="vk-sample-note">A glimpse of the craft. Project length, sound, revisions and delivery formats are agreed in your brief.</p>
    </section>
  );
}
