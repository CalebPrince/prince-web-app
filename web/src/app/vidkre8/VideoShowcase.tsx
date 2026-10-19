"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Play } from "lucide-react";
import { STUDIO_VIDEOS, VIDEO_CATEGORIES, type StudioVideo, type VideoCategory } from "@/lib/vidkre8-videos";

function VideoThumbnail({ film }: { film: StudioVideo }) {
  return (
    <span className={`vk-thumbnail vk-thumbnail-${film.id}`}>
      <Image src={film.poster} fill sizes="(max-width: 650px) 90vw, 33vw" alt="" />
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
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [videoErrors, setVideoErrors] = useState<Record<string, boolean>>({});
  const videoRefs = useRef(new Map<string, HTMLVideoElement>());
  const filtered = STUDIO_VIDEOS.filter((film) => category === "All work" || film.category === category);

  const play = (film: StudioVideo) => {
    videoRefs.current.forEach((player, id) => {
      if (id !== film.id) player.pause();
    });
    setVideoErrors((current) => ({ ...current, [film.id]: false }));
    setPlayingId(film.id);
    const player = videoRefs.current.get(film.id);
    if (player) void player.play().catch(() => { /* Native controls remain available if playback is blocked. */ });
  };

  const filter = (next: VideoCategory) => {
    videoRefs.current.forEach((player) => player.pause());
    setPlayingId(null);
    setCategory(next);
  };

  return (
    <section id="vk-work" className="vk-work vk-container" aria-labelledby="vk-work-title">
      <div className="vk-section-head"><div><span className="vk-eyebrow">01 / The screening room</span><h2 id="vk-work-title">Less describing.<br />More pressing play.</h2></div><p>Selected cuts from studio and concept work. Every film plays right where you find it, with its real length and sound clearly labelled.</p></div>
      <div className="vk-video-filters" role="group" aria-label="Filter sample videos">
        {VIDEO_CATEGORIES.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => filter(item)}>{item}</button>)}
      </div>
      <p className="vk-gallery-count" role="status">{filtered.length} {filtered.length === 1 ? "sample" : "samples"}{category !== "All work" ? ` / ${category}` : " / Studio selects"}</p>
      <div className="vk-project-grid">
        {filtered.map((film, i) => {
          const isPlaying = playingId === film.id;
          const hasError = Boolean(videoErrors[film.id]);
          return (
            <article className="vk-project" key={film.id}>
              <div className={`vk-project-image vk-inline-video-card${isPlaying ? " is-playing" : ""}`}>
                <div className="vk-card-stage">
                  <video
                    ref={(node) => { if (node) videoRefs.current.set(film.id, node); else videoRefs.current.delete(film.id); }}
                    src={film.src}
                    poster={film.poster}
                    controls
                    playsInline
                    preload="none"
                    tabIndex={isPlaying ? 0 : -1}
                    aria-label={`${film.title} ${film.excerpt ? "excerpt" : "film"}`}
                    onPlay={() => setPlayingId(film.id)}
                    onError={() => setVideoErrors((current) => ({ ...current, [film.id]: true }))}
                  >
                    Your browser does not support video. <a href={film.src}>Open the sample video</a>.
                  </video>
                  {!isPlaying && <button type="button" className="vk-card-cover" onClick={() => play(film)} aria-label={`Play ${film.title}`}><VideoThumbnail film={film} /></button>}
                </div>
                <div className="vk-project-view"><span>{isPlaying ? "Now playing" : film.excerpt ? "Play excerpt" : "Play film"}</span><ArrowUpRight size={20} aria-hidden="true" /></div>
              </div>
              <div className="vk-project-title"><h3>{film.title}</h3><span>{String(i + 1).padStart(2, "0")}</span></div>
              <p>{film.kind}</p>
              <p className="vk-card-duration">{film.seconds} sec {film.excerpt ? "excerpt" : "film"} <span aria-hidden="true">·</span> {film.silent ? "Silent" : "Sound available"}</p>
              <p className="vk-card-description">{film.description}</p>
              {hasError && <div className="vk-video-error" role="alert"><p>The video could not load.</p><button type="button" onClick={() => { const player = videoRefs.current.get(film.id); setVideoErrors((current) => ({ ...current, [film.id]: false })); player?.load(); play(film); }}>Retry video</button></div>}
            </article>
          );
        })}
      </div>
      <p className="vk-sample-note">A glimpse of the craft. Project length, sound, revisions and delivery formats are agreed in your brief.</p>
    </section>
  );
}
