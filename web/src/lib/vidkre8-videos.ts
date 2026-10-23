/** Local, publicly playable excerpts from the owner's studio reel.
 * Keep full-film duration separate from the length of these actual files. */
export const VIDEO_CATEGORIES = ["All work", "Brand & ads", "Product & apps", "Wedding", "Podcast"] as const;
export type VideoCategory = typeof VIDEO_CATEGORIES[number];
export type StudioVideo = {
  id: string;
  title: string;
  category: Exclude<VideoCategory, "All work">;
  kind: string;
  description: string;
  seconds: number;
  excerpt: boolean;
  silent: boolean;
  src: string;
  poster: string;
};

export const STUDIO_VIDEOS: StudioVideo[] = [
  { id: "websummit-2026", title: "Web Summit 2026", category: "Brand & ads", kind: "Event trailer", description: "A fast-moving vertical event trailer built around bold type, speaker energy and a clear countdown to Web Summit 2026.", seconds: 41.2, excerpt: false, silent: false, src: "/vidkre8/videos/websummit-2026.mp4", poster: "/vidkre8/videos/websummit-2026.jpg" },
  { id: "fashion", title: "Think Of Fashion", category: "Brand & ads", kind: "Fashion campaign film", description: "A kinetic 30-second fashion ad built around editorial looks, beat-cut typography and a direct booking finish.", seconds: 30, excerpt: false, silent: false, src: "/vidkre8/videos/fashion.mp4", poster: "/vidkre8/videos/fashion.jpg" },
  { id: "wedding", title: "Every love story", category: "Wedding", kind: "Wedding-film concept", description: "A moment from the VidKre8 wedding-film concept. A glimpse of the mood and visual direction for a wedding highlight.", seconds: 2.2, excerpt: true, silent: true, src: "/vidkre8/videos/wedding.mp4", poster: "/vidkre8/videos/wedding.jpg" },
  { id: "buinee-pay", title: "BuineePay", category: "Product & apps", kind: "Fintech product commercial", description: "A complete product story that turns a simple mobile payment into a polished, character-led commercial.", seconds: 36, excerpt: false, silent: false, src: "/vidkre8/videos/buinee-pay.mp4", poster: "/vidkre8/videos/buinee-pay.jpg" },
  { id: "app", title: "LIID Flo", category: "Product & apps", kind: "App-launch film", description: "The complete LIID Flo app ad, with voice-led storytelling and product visuals designed for the vertical screen.", seconds: 49.5, excerpt: false, silent: false, src: "/vidkre8/videos/app.mp4", poster: "/vidkre8/videos/app.jpg" },
  { id: "elonpos", title: "Elon POS", category: "Product & apps", kind: "Business software ad", description: "Even when you're not in the shop, your business never stops: a voiced software ad with a dashboard mockup, live payment alerts, the system's real figures, the free-software launch offer and a WhatsApp finish.", seconds: 73.5, excerpt: false, silent: false, src: "/vidkre8/videos/elonpos.mp4", poster: "/vidkre8/videos/elonpos.jpg" },
  { id: "inteli-space", title: "Inteli-Space", category: "Product & apps", kind: "AI workspace product ad", description: "A complete product ad for Inteli-Space, the workspace that gives every project its own space and keeps a record of what your AI team decided.", seconds: 60, excerpt: false, silent: false, src: "/vidkre8/videos/inteli-space.mp4", poster: "/vidkre8/videos/inteli-space.jpg" },
  { id: "qabenji", title: "Qabenji", category: "Product & apps", kind: "Team software walkthrough ad", description: "A complete voiced ad walking through Qabenji's dashboard, projects, team view, messages and files, one clear screen at a time.", seconds: 94.6, excerpt: false, silent: false, src: "/vidkre8/videos/qabenji.mp4", poster: "/vidkre8/videos/qabenji.jpg" },
  { id: "english-adventure", title: "English Adventure", category: "Product & apps", kind: "App launch teaser", description: "A coming-soon promo for a children's English learning game, made from the real app being played, with close-ups of each activity.", seconds: 60, excerpt: false, silent: false, src: "/vidkre8/videos/english-adventure.mp4", poster: "/vidkre8/videos/english-adventure.jpg" },
  { id: "voice", title: "Meet Lisa", category: "Product & apps", kind: "AI voice-agent sample", description: "A short cut from the Lisa voice-agent ad, bringing a digital assistant’s story into motion.", seconds: 2.2, excerpt: true, silent: true, src: "/vidkre8/videos/voice.mp4", poster: "/vidkre8/videos/voice.jpg" },
  { id: "websites", title: "Website showcase", category: "Brand & ads", kind: "Music-led showcase film", description: "The complete website showcase ad, with beat-led scenes, device presentation and precise transitions.", seconds: 50, excerpt: false, silent: false, src: "/vidkre8/videos/websites.mp4", poster: "/vidkre8/videos/websites.jpg" },
  { id: "team", title: "An AI workforce", category: "Brand & ads", kind: "AI-team sample", description: "A short cut from the AI workforce ad, giving an abstract service a visual story.", seconds: 2.2, excerpt: true, silent: true, src: "/vidkre8/videos/team.mp4", poster: "/vidkre8/videos/team.jpg" },
  { id: "solar", title: "Ayeko Solar", category: "Brand & ads", kind: "Energy brand film", description: "A complete widescreen solar story combining voice, field imagery and product-led motion for a clear commercial message.", seconds: 47.1, excerpt: false, silent: false, src: "/vidkre8/videos/solar.mp4", poster: "/vidkre8/videos/solar.jpg" },
  { id: "podcast", title: "The Long Table", category: "Podcast", kind: "Podcast-trailer concept", description: "A short cut from The Long Table’s season-trailer concept. The show is fictional; the motion work is a studio sample.", seconds: 2.2, excerpt: true, silent: true, src: "/vidkre8/videos/podcast.mp4", poster: "/vidkre8/videos/podcast.jpg" },
];
