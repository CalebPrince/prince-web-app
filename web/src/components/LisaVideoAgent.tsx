"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { cn } from "@/lib/utils";

const PRESENTER = "/uploads/lisa/june-hr-liveavatar.webp";

declare global {
  interface Window {
    LiveAvatarSDK?: any;
  }
}

type VideoState = "ready" | "connecting" | "live" | "unavailable";

export function LisaVideoAgent() {
  const [state, setState] = useState<VideoState>("ready");
  const [muted, setMuted] = useState(false);
  const [note, setNote] = useState(
    "You will be speaking with an AI assistant. Microphone permission is required."
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionRef = useRef<any>(null);
  const keepAliveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  const startKeepAlive = () => {
    stopKeepAlive();
    keepAliveTimerRef.current = window.setInterval(() => {
      if (sessionRef.current) {
        sessionRef.current.keepAlive().catch(() => {});
      }
    }, 30000);
  };

  const stopKeepAlive = () => {
    if (keepAliveTimerRef.current) {
      window.clearInterval(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
  };

  const stopSession = async () => {
    stopKeepAlive();
    const activeSession = sessionRef.current;
    sessionRef.current = null;
    if (activeSession) {
      try {
        await activeSession.stop();
      } catch (_) {}
    }
    setState("ready");
    setNote("You will be speaking with an AI assistant. Microphone permission is required.");
  };

  const handleStart = async () => {
    if (!window.LiveAvatarSDK) {
      setState("unavailable");
      setNote("LiveAvatar SDK not loaded. Please try again later.");
      return;
    }

    setState("connecting");
    setNote("Requesting microphone access and creating a secure sandbox session…");

    try {
      const response = await fetch("/api/v1/liveavatar/session-token", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.session_token) {
        throw new Error(data.error || "Unable to start Lisa.");
      }

      const sdk = window.LiveAvatarSDK;
      const session = new sdk.LiveAvatarSession(data.session_token, {
        voiceChat: true,
        apiUrl: window.location.origin + "/api/v1/liveavatar/sdk",
      });
      sessionRef.current = session;

      let streamReady = false;
      let connected = false;
      let greetingSent = false;

      const sendGreetingWhenReady = () => {
        if (!streamReady || !connected || greetingSent || !sessionRef.current) return;
        greetingSent = true;
        window.setTimeout(() => {
          if (sessionRef.current) {
            sessionRef.current.message(
              "Hi, I'm Lisa, Prince Caleb's AI assistant. How can I help with your business today?"
            );
          }
        }, 700);
      };

      session.on(sdk.SessionEvent.SESSION_STREAM_READY, () => {
        if (videoRef.current) {
          session.attach(videoRef.current);
          videoRef.current.playbackRate = 1;
          videoRef.current.muted = false;
          videoRef.current.play().catch(() => {});
        }

        setState("live");
        setNote(
          data.sandbox
            ? "Lisa is an AI assistant. This preview runs in sandbox mode."
            : "Lisa is an AI assistant."
        );
        streamReady = true;
        startKeepAlive();
        sendGreetingWhenReady();
      });

      session.on(sdk.SessionEvent.SESSION_STATE_CHANGED, (nextState: any) => {
        connected = nextState === sdk.SessionState.CONNECTED;
        sendGreetingWhenReady();
      });

      session.on(sdk.SessionEvent.SESSION_DISCONNECTED, () => {
        if (sessionRef.current) stopSession();
      });

      await session.start();
    } catch (error: any) {
      await stopSession();
      setState("unavailable");
      setNote((error.message || "Unable to start Lisa.") + " You can still use website chat.");
    }
  };

  const handleToggleMute = async () => {
    if (!sessionRef.current) return;
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (nextMuted) {
      await sessionRef.current.voiceChat.mute();
    } else {
      await sessionRef.current.voiceChat.unmute();
    }
  };

  return (
    <>
      <Script src="/vendor/liveavatar/events-shim.js?v=1" strategy="lazyOnload" />
      <Script src="/vendor/liveavatar/index.umd.js?v=0.0.18-1" strategy="lazyOnload" />

      <div className="flex flex-col gap-8">
        <div className="relative mx-auto w-full max-w-sm">
          <div
            className={cn(
              "relative overflow-hidden rounded-[calc(var(--radius)*1.5)] border bg-bg-2 transition-all duration-300",
              state === "live" ? "border-accent/60 shadow-[0_0_30px_rgba(var(--accent-rgb),0.2)]" : "border-hairline"
            )}
          >
            {/* Poster Image */}
            <img
              src={PRESENTER}
              alt="Lisa - AI video presenter"
              className={cn(
                "aspect-[4/5] w-full object-cover transition-opacity duration-300",
                state === "live" ? "opacity-0" : "opacity-100"
              )}
            />

            {/* Video Element */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              aria-label="Live video conversation with Lisa, an AI assistant"
              className={cn(
                "absolute inset-0 aspect-[4/5] w-full object-cover transition-opacity duration-300",
                state === "live" ? "opacity-100" : "opacity-0"
              )}
            />
          </div>

          {/* Status / Controls Bar */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-[var(--radius)] border border-hairline bg-bg/70 px-4 py-3 backdrop-blur-md">
            <span className="flex items-center gap-2 text-sm font-medium text-text">
              <span
                className={cn(
                  "size-2 rounded-full transition-colors",
                  state === "live"
                    ? "bg-accent animate-pulse"
                    : state === "connecting"
                    ? "bg-accent/50 animate-pulse"
                    : "bg-muted"
                )}
              />
              Lisa · Video identity
            </span>
            {state === "live" ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  aria-pressed={muted}
                  className="text-sm font-semibold text-text hover:text-accent"
                >
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button
                  type="button"
                  onClick={stopSession}
                  className="text-sm font-semibold text-red-500 hover:text-red-400"
                >
                  End call
                </button>
              </div>
            ) : (
              <span className="label text-muted">
                {state === "connecting" ? "Connecting" : state === "unavailable" ? "Unavailable" : "Ready"}
              </span>
            )}
          </div>
        </div>

        {/* Outer Copy / CTA (similar to the HTML structure) */}
        <div className="mx-auto w-full max-w-sm text-center">
          {state === "ready" || state === "unavailable" ? (
            <button
              type="button"
              onClick={handleStart}
              className="w-full rounded-[var(--radius)] bg-accent px-6 py-4 font-bold text-bg transition-colors hover:bg-accent-light"
            >
              {state === "unavailable" ? "Try video again" : "Start a video chat"}
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="w-full rounded-[var(--radius)] bg-bg-2 px-6 py-4 font-bold text-muted"
            >
              {state === "connecting" ? "Connecting to Lisa…" : "Video chat active"}
            </button>
          )}
          <p className="mt-4 text-sm text-text-2" role="status">
            {note}
          </p>
        </div>
      </div>
    </>
  );
}
