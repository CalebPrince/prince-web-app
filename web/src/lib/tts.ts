// Ported from public/js/elevenlabs-tts.js - natural ElevenLabs voice with a
// graceful fallback to the browser's own speechSynthesis. Module-level
// singleton state (one shared <audio> element) matches the original;
// this file is only ever imported by client components.

// Mirrors TextToSpeechController::MAX_TEXT_LENGTH. Lisa is the public chat
// widget's only agent; Scout is also spoken from the admin agent-chat page,
// and her longer console answers need the higher cap or they get cut off
// mid-sentence (the actual bug TextToSpeechController.php's comment cites).
const MAX_TEXT_LENGTH: Record<string, number> = { lisa: 700, scout: 3000 };

let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
let unlocked = false;

function getAudio(): HTMLAudioElement {
  if (!activeAudio) activeAudio = new Audio();
  return activeAudio;
}

function release() {
  const audio = getAudio();
  audio.pause();
  audio.onplay = null;
  audio.onended = null;
  audio.onerror = null;
  audio.removeAttribute("src");
  audio.load();
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
}

// Browsers may reject audio started only after a network request because the
// original click's activation has expired. Prime one reusable media element
// on the first pointer/keyboard gesture so later replies can play.
export function unlockTts() {
  if (unlocked || typeof window === "undefined") return;
  const audio = getAudio();
  audio.muted = true;
  audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAA";
  const attempt = audio.play();
  if (attempt && typeof attempt.then === "function") {
    attempt
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        unlocked = true;
      })
      .catch(() => {
        audio.muted = false;
      });
  }
}

type TtsHandlers = { onstart?: () => void; onend?: () => void; onerror?: () => void };

export async function playTts(text: string, handlers?: TtsHandlers, agent: string = "lisa"): Promise<void> {
  const spoken = text.trim();
  if (!spoken) throw new Error("No speech text");
  release();

  const maxLength = MAX_TEXT_LENGTH[agent] ?? MAX_TEXT_LENGTH.lisa;
  const response = await fetch("/api/v1/voice/tts", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: spoken.slice(0, maxLength), agent }),
  });
  if (!response.ok) {
    throw new Error("Natural speech unavailable");
  }

  const audio = getAudio();
  activeUrl = URL.createObjectURL(await response.blob());
  audio.src = activeUrl;
  audio.muted = false;
  audio.onplay = () => handlers?.onstart?.();
  audio.onended = () => {
    handlers?.onend?.();
    release();
  };
  audio.onerror = () => {
    handlers?.onerror?.();
    release();
  };
  await audio.play();
}

export function stopTts() {
  release();
}

// ---- Browser speechSynthesis fallback --------------------------------------

export type VoiceConfig = { gender: string; accent: string; rate: number; pitch: number };

const FEMALE_RE =
  /(female|zira|susan|hazel|linda|samantha|karen|moira|tessa|fiona|serena|catherine|aria|jenny|sonia|libby|amy|joanna|salli|kimberly|google uk english female)/i;
const MALE_RE = /(\bmale\b|david|mark|george|guy|ryan|thomas|daniel|alex|fred|oliver|james|brian|matthew|arthur|google uk english male)/i;

// Pick the closest match to the admin's gender + accent preference, degrading
// gracefully: accent+gender → gender (any accent) → accent (any gender) →
// any English → whatever exists. Never returns the *opposite* gender while a
// same-gender option is still available.
export function pickVoice(voices: SpeechSynthesisVoice[], cfg: VoiceConfig): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const accent = cfg.accent && cfg.accent !== "auto" ? cfg.accent.toLowerCase() : null;
  const wantRe = cfg.gender === "male" ? MALE_RE : cfg.gender === "female" ? FEMALE_RE : null;
  const notRe = cfg.gender === "male" ? FEMALE_RE : cfg.gender === "female" ? MALE_RE : null;

  const en = voices.filter((v) => /^en/i.test(v.lang));
  const byAccent = accent ? en.filter((v) => v.lang.toLowerCase().startsWith(accent)) : en;

  const tiers: SpeechSynthesisVoice[][] = [];
  if (wantRe) {
    tiers.push(byAccent.filter((v) => wantRe.test(v.name) && !notRe!.test(v.name)));
    tiers.push(byAccent.filter((v) => wantRe.test(v.name)));
    tiers.push(en.filter((v) => wantRe.test(v.name) && !notRe!.test(v.name)));
    tiers.push(en.filter((v) => wantRe.test(v.name)));
  }
  tiers.push(byAccent, en, voices);
  for (const tier of tiers) {
    if (tier && tier.length) return tier[0];
  }
  return null;
}

export function speakWithBrowser(text: string, cfg: VoiceConfig, handlers?: TtsHandlers) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = Math.min(2, Math.max(0.5, Number(cfg.rate) || 1));
  u.pitch = Math.min(2, Math.max(0, Number(cfg.pitch) || 1));
  const voice = pickVoice(synth.getVoices(), cfg);
  if (voice) {
    u.voice = voice;
    if (voice.lang) u.lang = voice.lang;
  }
  u.onstart = () => handlers?.onstart?.();
  u.onend = () => handlers?.onend?.();
  u.onerror = () => handlers?.onerror?.();
  synth.speak(u);
}

export function stopBrowserSpeech() {
  if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
}

// Strip emoji (and their modifiers/joiners) before speaking so the voice
// reads the words only - many TTS engines otherwise announce emoji names
// aloud ("waving hand", "rocket"). The on-screen message keeps its emoji;
// only the spoken copy is cleaned.
export function stripForSpeech(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
