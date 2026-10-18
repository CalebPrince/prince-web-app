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
  { id: "wedding", title: "Every love story", category: "Wedding", kind: "Wedding-film concept", description: "A moment from the VidKre8 wedding-film concept. A glimpse of the mood and visual direction for a wedding highlight.", seconds: 2.2, excerpt: true, silent: true, src: "/vidkre8/videos/wedding.mp4", poster: "/vidkre8/videos/wedding.jpg" },
  { id: "app", title: "LIID Flo", category: "Product & apps", kind: "App-launch film", description: "The complete LIID Flo app ad, with voice-led storytelling and product visuals designed for the vertical screen.", seconds: 49.5, excerpt: false, silent: false, src: "/vidkre8/videos/app.mp4", poster: "/vidkre8/videos/app.jpg" },
  { id: "voice", title: "Meet Lisa", category: "Product & apps", kind: "AI voice-agent sample", description: "A short cut from the Lisa voice-agent ad, bringing a digital assistant’s story into motion.", seconds: 2.2, excerpt: true, silent: true, src: "/vidkre8/videos/voice.mp4", poster: "/vidkre8/videos/voice.jpg" },
  { id: "websites", title: "Website showcase", category: "Brand & ads", kind: "Music-led showcase film", description: "The complete website showcase ad, with beat-led scenes, device presentation and precise transitions.", seconds: 50, excerpt: false, silent: false, src: "/vidkre8/videos/websites.mp4", poster: "/vidkre8/videos/websites.jpg" },
  { id: "team", title: "An AI workforce", category: "Brand & ads", kind: "AI-team sample", description: "A short cut from the AI workforce ad, giving an abstract service a visual story.", seconds: 2.2, excerpt: true, silent: true, src: "/vidkre8/videos/team.mp4", poster: "/vidkre8/videos/team.jpg" },
  { id: "podcast", title: "The Long Table", category: "Podcast", kind: "Podcast-trailer concept", description: "A short cut from The Long Table’s season-trailer concept. The show is fictional; the motion work is a studio sample.", seconds: 2.2, excerpt: true, silent: true, src: "/vidkre8/videos/podcast.mp4", poster: "/vidkre8/videos/podcast.jpg" },
];
