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

/** Once natural speech has failed, the rest of the session stays on the
 *  browser voice. The two sound nothing like each other, and a Lisa who is
 *  ElevenLabs on one line and the operating system on the next reads as a
 *  fault - worse than being consistently the plainer of the two. A reload
 *  gives the natural voice another go. */
let naturalSpeechDown = false;

export function isNaturalSpeechDown(): boolean {
  return naturalSpeechDown;
}

/** The browser's voice list is populated asynchronously: the first call to
 *  getVoices() usually returns nothing, and speaking against an empty list
 *  silently uses whatever default the OS has, which is why the first line
 *  came out in a different voice from the ones after it. */
function voicesReady(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const ready = synth.getVoices();
  if (ready.length) return Promise.resolve(ready);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener("voiceschanged", finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", finish);
    // Not every browser fires the event. A greeting held hostage to it would
    // be worse than one spoken in the default voice.
    setTimeout(finish, 1200);
  });
}

/** Chosen once and kept. The list can be reordered between calls, and a
 *  different pick each time is the same bug in a subtler form. */
let chosenVoice: SpeechSynthesisVoice | null | undefined;


export async function playTts(text: string, handlers?: TtsHandlers, agent: string = "lisa"): Promise<void> {
  const spoken = text.trim();
  if (!spoken) throw new Error("No speech text");
  release();

  if (naturalSpeechDown) throw new Error("Natural speech unavailable");

  const maxLength = MAX_TEXT_LENGTH[agent] ?? MAX_TEXT_LENGTH.lisa;
  let response: Response;
  try {
    response = await fetch("/api/v1/voice/tts", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spoken.slice(0, maxLength), agent }),
    });
  } catch (err) {
    naturalSpeechDown = true;
    throw err;
  }
  if (!response.ok) {
    naturalSpeechDown = true;
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
  try {
    await audio.play();
  } catch (err) {
    naturalSpeechDown = true;
    throw err;
  }
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

export async function speakWithBrowser(text: string, cfg: VoiceConfig, handlers?: TtsHandlers) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = Math.min(2, Math.max(0.5, Number(cfg.rate) || 1));
  u.pitch = Math.min(2, Math.max(0, Number(cfg.pitch) || 1));
  if (chosenVoice === undefined) chosenVoice = pickVoice(await voicesReady(synth), cfg);
  const voice = chosenVoice;
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
