"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

type DemoState = "idle" | "listening" | "thinking" | "speaking";

// Extended window types for global objects
declare global {
  interface Window {
    ElevenLabsTTS: any;
    trackUiEvent?: (eventName: string) => void;
  }
}

export function VoiceDemo() {
  const [state, setState] = useState<DemoState>("idle");
  const [timer, setTimer] = useState("00:00");
  const [transcript, setTranscript] = useState(
    "Tap “Start voice demo,” then ask how a voice agent could handle calls for your clinic."
  );
  const [speaker, setSpeaker] = useState("Voice agent");
  const [assistantName, setAssistantName] = useState("Prince's Assistant");
  const [showForm, setShowForm] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [hasSR, setHasSR] = useState(true);
  const [buttonLabel, setButtonLabel] = useState("Start voice demo");

  const recognitionRef = useRef<any>(null);
  const timerIdRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const tokenRef = useRef<string | null>(null);
  const voiceConfigRef = useRef({ gender: "female", accent: "en-GB", rate: 1, pitch: 1 });
  const busyRef = useRef(false);

  useEffect(() => {
    try {
      const storedToken = sessionStorage.getItem("voice_demo_token");
      if (storedToken) tokenRef.current = storedToken;
    } catch (_) {}

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setHasSR(!!SR);
    if (!SR) {
      setButtonLabel("Try the demo");
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }

    api.chatStatus().then((status) => {
      if (status.assistant_name) {
        setAssistantName(status.assistant_name);
      }
      if (status.voice) {
        voiceConfigRef.current = { ...voiceConfigRef.current, ...status.voice };
      }
    }).catch(() => {});
  }, []);

  const track = (event: string) => {
    api.voiceDemoEvent(event, tokenRef.current, window.location.pathname).catch(() => {});
    if (window.trackUiEvent) window.trackUiEvent("voice_demo_" + event);
  };

  const startTimer = () => {
    if (timerIdRef.current) window.clearInterval(timerIdRef.current);
    startedAtRef.current = Date.now();
    setTimer("00:00");
    timerIdRef.current = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setTimer(
        String(Math.floor(seconds / 60)).padStart(2, "0") +
          ":" +
          String(seconds % 60).padStart(2, "0")
      );
    }, 250);
  };

  const stopTimer = (reset = false) => {
    if (timerIdRef.current) window.clearInterval(timerIdRef.current);
    timerIdRef.current = null;
    if (reset) setTimer("00:00");
  };

  const cleanForSpeech = (text: string) => {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[*_#>`~]/g, "")
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  };

  const pickVoice = () => {
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    if (!voices.length) return null;
    const accent = voiceConfigRef.current.accent && voiceConfigRef.current.accent !== "auto"
      ? voiceConfigRef.current.accent.toLowerCase()
      : "";
    const english = voices.filter((v) => /^en/i.test(v.lang));
    return (
      english.find((v) => v.lang.toLowerCase().startsWith(accent)) || english[0] || voices[0]
    );
  };

  const finish = () => {
    stopTimer(false);
    busyRef.current = false;
    setState("idle");
    setButtonLabel(hasSR ? "Ask another question" : "Type another question");
  };

  const showError = (msg: string) => {
    setSpeaker("Demo status");
    setTranscript(msg);
    stopTimer(false);
    finish();
  };

  const speakWithBrowser = (spoken: string) => {
    if (!("speechSynthesis" in window)) {
      finish();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.rate = Math.min(1.3, Math.max(0.7, Number(voiceConfigRef.current.rate) || 1));
    utterance.pitch = Math.min(1.4, Math.max(0.6, Number(voiceConfigRef.current.pitch) || 1));
    const selected = pickVoice();
    if (selected) {
      utterance.voice = selected;
      utterance.lang = selected.lang;
    }
    utterance.onstart = () => {
      setState("speaking");
      setButtonLabel("Stop audio");
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  };

  const speakReply = (text: string) => {
    const spoken = cleanForSpeech(text);
    if (!spoken) {
      finish();
      return;
    }
    if (window.ElevenLabsTTS) {
      window.ElevenLabsTTS.stop();
      window.ElevenLabsTTS.play(spoken, {
        onstart: () => {
          setState("speaking");
          setButtonLabel("Stop audio");
        },
        onend: finish,
        onerror: finish,
      }).catch((error: any) => {
        if (window.ElevenLabsTTS.shouldFallback(error)) speakWithBrowser(spoken);
        else finish();
      });
      return;
    }
    speakWithBrowser(spoken);
  };

  const sendQuestion = async (question: string) => {
    const text = String(question || "").trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setState("thinking");
    setButtonLabel("Thinking…");
    setSpeaker("You");
    setTranscript(text);

    try {
      const response = await api.voiceDemoMessage(text, tokenRef.current, "clinic");
      if (!response || typeof response !== "object") {
        throw new Error(
          "The assistant returned an empty response. Check that the chat API and at least one AI provider are configured."
        );
      }
      if (typeof response.reply !== "string" || !response.reply.trim()) {
        throw new Error(response.error || "The assistant did not return a reply. Please try again.");
      }
      if (response.token) tokenRef.current = response.token;
      try {
        if (response.token) sessionStorage.setItem("voice_demo_token", response.token);
        sessionStorage.setItem("voice_demo_answered", "1");
      } catch (_) {}

      setSpeaker(assistantName);
      setTranscript(response.reply.trim());
      speakReply(response.reply.trim());
    } catch (error: any) {
      track("answer_failed");
      showError(error.message || "The voice demo could not answer. Please try again.");
    }
  };

  const showTypedFallback = (msg: string) => {
    setShowForm(true);
    setButtonLabel("Type your question");
    if (msg) {
      setSpeaker("Demo status");
      setTranscript(msg);
    }
  };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      showTypedFallback(
        "Voice input is not available in this browser. Type a question below, the answer will still be spoken aloud."
      );
      return;
    }
    if (window.ElevenLabsTTS) window.ElevenLabsTTS.stop();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang =
      voiceConfigRef.current.accent && voiceConfigRef.current.accent !== "auto"
        ? voiceConfigRef.current.accent
        : "en-GB";
    recognition.interimResults = true;
    recognition.continuous = false;
    let finalText = "";

    recognition.onstart = () => {
      track("mic_granted");
      setState("listening");
      startTimer();
      setButtonLabel("Stop listening");
      setSpeaker("You");
      setTranscript("Listening…");
    };

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const part = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += part;
        else interim += part;
      }
      setTranscript((finalText + interim).trim() || "Listening…");
    };

    recognition.onerror = (event: any) => {
      setState("idle");
      const errors: Record<string, string> = {
        "not-allowed": "Microphone access is blocked. Allow it in your browser settings, or type your question below.",
        "audio-capture": "No microphone was found. You can type your question below.",
        "no-speech": "I did not hear a question. Tap the button and try again.",
      };
      const message = errors[event.error] || "Voice input stopped. You can try again or type your question.";
      if (event.error === "not-allowed") track("mic_blocked");
      if (event.error === "not-allowed" || event.error === "audio-capture") showTypedFallback(message);
      else showError(message);
    };

    recognition.onend = () => {
      setState("idle");
      if (finalText.trim()) sendQuestion(finalText);
      else if (!busyRef.current) finish();
    };

    try {
      recognition.start();
    } catch (_) {
      showTypedFallback("The microphone could not start. Type your question below instead.");
    }
  };

  const handleStart = () => {
    if (state === "listening" && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    if (
      (window.ElevenLabsTTS && window.ElevenLabsTTS.isPlaying()) ||
      (window.speechSynthesis && window.speechSynthesis.speaking)
    ) {
      if (window.ElevenLabsTTS) window.ElevenLabsTTS.stop();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      finish();
      return;
    }
    if (!busyRef.current) {
      track("demo_started");
      try {
        sessionStorage.setItem("voice_demo_started", "1");
      } catch (_) {}
      startListening();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = inputValue.trim();
    if (!q) return;
    setInputValue("");
    sendQuestion(q);
  };

  let statusText = "Voice demo ready";
  let stateText = "Ready";
  if (state === "listening") {
    statusText = "Listening to you";
    stateText = "Listening";
  } else if (state === "thinking") {
    statusText = `${assistantName} is thinking`;
    stateText = "Thinking";
  } else if (state === "speaking") {
    statusText = `${assistantName} is speaking`;
    stateText = "Speaking";
  }

  return (
    <>
      <Script src="/js/elevenlabs-tts.js?v=20260731-length-fallback-fix" strategy="lazyOnload" />
      <div className={cn(
        "overflow-hidden rounded-[calc(var(--radius)*1.5)] border border-hairline bg-bg-2/50 transition-all duration-300 glass",
        state === "listening" && "border-accent/40 shadow-[0_0_20px_rgba(var(--accent-rgb),0.1)]",
        state === "thinking" && "border-white/20",
        state === "speaking" && "border-accent/60 shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]"
      )}>
        <header className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <span className="flex items-center gap-2 text-sm text-text-2">
            <span
              className={cn(
                "size-2 rounded-full",
                state !== "idle" ? "bg-accent animate-pulse" : "bg-muted"
              )}
            />{" "}
            {statusText}
          </span>
          <span className="font-mono text-sm text-muted">{timer}</span>
        </header>
        <div className="p-6">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-full border transition-colors",
                state === "speaking"
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-accent/40 bg-accent/10 text-accent"
              )}
            >
              <Phone className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block text-text">{assistantName}</strong>
              <small className="text-text-2">Try the real assistant</small>
            </div>
            <span
              className={cn(
                "label rounded-full border px-2.5 py-1",
                state === "idle"
                  ? "border-hairline text-muted"
                  : "border-accent/30 text-accent"
              )}
            >
              {stateText}
            </span>
          </div>
          <div className="mt-6 flex items-end justify-center gap-1 h-8" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "w-1 rounded-full transition-all duration-300",
                  state === "idle" && "bg-hairline-strong",
                  state === "listening" && "bg-accent/60 animate-pulse",
                  state === "thinking" && "bg-muted animate-pulse",
                  state === "speaking" && "bg-accent animate-pulse"
                )}
                style={{
                  height: state === "idle" ? `${8 + (i % 4) * 4}px` : `${12 + Math.random() * 20}px`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
          <div className="mt-6 border-t border-hairline pt-5">
            <span className="label text-muted">{speaker}</span>
            <p className="mt-2 text-text-2 min-h-[3rem] transition-opacity" aria-live="polite">
              {transcript}
            </p>
          </div>
          
          {showForm && (
            <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                maxLength={500}
                placeholder="Type your question instead…"
                className="flex-1 rounded-[var(--radius)] border border-hairline bg-bg p-3 text-sm text-text focus:border-accent focus:outline-none"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || busyRef.current}
                className="tilt-3d tilt-glow rounded-[var(--radius)] bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-strong disabled:opacity-50"
              >
                Ask
              </button>
            </form>
          )}
        </div>
        <footer className="border-t border-hairline p-5">
          <button
            onClick={handleStart}
            disabled={busyRef.current && state === "thinking"}
            className={cn(
              "tilt-3d w-full rounded-[calc(var(--radius)*1.2)] px-4 py-3 font-semibold transition-all",
              state === "listening" || state === "speaking"
                ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                : "tilt-glow bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-50"
            )}
          >
            {buttonLabel}
          </button>
          <p className="mt-3 text-center text-xs text-muted">
            Microphone activates only after you tap.
          </p>
        </footer>
      </div>
    </>
  );
}
