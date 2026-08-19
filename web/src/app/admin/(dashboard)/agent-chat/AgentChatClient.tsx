"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi, asList } from "@/lib/api";
import {
  Send, Paperclip, X, RotateCcw, Volume2, VolumeX, Flag, Check, Trash2, Mic, MicOff,
} from "lucide-react";
import {
  PageHeader, Card, Button, IconButton, Textarea, StatusPill, ErrorBanner,
  formatDateTime,
} from "@/components/admin/ui";

type AgentKey =
  | "lisa" | "beacon" | "dossier" | "nurturer" | "proposal" | "content" | "arch"
  | "sketch" | "ada" | "chief" | "scout" | "reel" | "sage" | "radar";

type AgentSpec = {
  key: AgentKey;
  /** Settings key holding the admin-configurable display name. */
  nameKey: string;
  fallbackName: string;
  /** Only Ada reads documents, so the attach control is hers alone. */
  attachments?: boolean;
};

const AGENTS: AgentSpec[] = [
  { key: "lisa", nameKey: "chat_assistant_name", fallbackName: "Lisa" },
  { key: "beacon", nameKey: "beacon_assistant_name", fallbackName: "Joan" },
  { key: "dossier", nameKey: "dossier_assistant_name", fallbackName: "Sharon" },
  { key: "nurturer", nameKey: "nurturer_assistant_name", fallbackName: "Jason" },
  { key: "proposal", nameKey: "proposal_assistant_name", fallbackName: "Ledger" },
  { key: "content", nameKey: "content_assistant_name", fallbackName: "Danielle" },
  { key: "arch", nameKey: "arch_assistant_name", fallbackName: "Arch" },
  { key: "sketch", nameKey: "sketch_assistant_name", fallbackName: "Sketch" },
  { key: "ada", nameKey: "ada_assistant_name", fallbackName: "Ada", attachments: true },
  { key: "chief", nameKey: "chief_assistant_name", fallbackName: "Chief" },
  { key: "scout", nameKey: "scout_assistant_name", fallbackName: "Scout" },
  { key: "reel", nameKey: "reel_assistant_name", fallbackName: "Reel" },
  { key: "sage", nameKey: "sage_assistant_name", fallbackName: "Sage" },
  { key: "radar", nameKey: "radar_assistant_name", fallbackName: "Radar" },
];

type Turn = { role: "user" | "agent"; text: string };
type Attachment = { name: string; data: string };

type BeaconLead = {
  id: number;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  country: string | null;
  status: string;
  confidence: number | null;
  rationale: string | null;
  created_at: string;
};

type RadarDraft = {
  id: number;
  target_name: string;
  target_headline: string | null;
  message: string;
  status: string;
  created_at: string;
};

type ContentStudioItem = {
  id: number;
  kind: string;
  title: string | null;
  image_url: string | null;
  status: string;
  created_at: string;
};

const STORAGE_PREFIX = "admin-agent-chat-v1:";

/* ---------- Dictation ----------
 * The Web Speech API is still vendor-prefixed in Chrome and missing entirely in
 * some browsers, so it is feature-detected and the mic button only appears where
 * it works. These minimal shapes stand in for the definitions TypeScript's DOM
 * lib does not ship. */
type SpeechAlternative = { transcript: string };
type SpeechResult = { 0: SpeechAlternative; isFinal: boolean };
type SpeechResultEvent = { results: { length: number; [index: number]: SpeechResult } };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function AgentChatClient({ settings }: { settings: Record<string, string> }) {
  const [active, setActive] = useState<AgentKey>("lisa");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [pending, setPending] = useState<{ name: string; file: File }[]>([]);
  const [demo, setDemo] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);

  const [beaconLeads, setBeaconLeads] = useState<BeaconLead[]>([]);
  const [radarDrafts, setRadarDrafts] = useState<RadarDraft[]>([]);
  const [contentDrafts, setContentDrafts] = useState<ContentStudioItem[]>([]);

  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  /** What was already typed when dictation started, so interim results replace
   *  only the dictated tail rather than retyping the whole box. */
  const dictationBase = useRef("");

  const logRef = useRef<HTMLDivElement>(null);

  const spec = AGENTS.find((a) => a.key === active)!;
  const displayName = settings[spec.nameKey]?.trim() || spec.fallbackName;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot capability probe; window is unavailable during SSR
    setMicSupported(!!getSpeechRecognition());
  }, []);

  const stopDictation = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => stopDictation, [stopDictation]);

  const toggleDictation = () => {
    if (listening) {
      stopDictation();
      return;
    }

    const Recognition = getSpeechRecognition();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    dictationBase.current = input ? `${input.trimEnd()} ` : "";

    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setInput(dictationBase.current + text);
    };

    recognition.onerror = (event) => {
      setError(
        event.error === "not-allowed"
          ? "Microphone access was blocked. Allow it in your browser to dictate."
          : "Dictation stopped unexpectedly."
      );
      stopDictation();
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  /** Each agent keeps its own conversation across reloads. */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + active);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot sync from the URL/localStorage on mount
      setTranscript(saved ? (JSON.parse(saved) as Turn[]) : []);
    } catch {
      setTranscript([]);
    }
    setImages([]);
    setPending([]);
    setError(null);
  }, [active]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript, sending]);

  const persist = (next: Turn[]) => {
    setTranscript(next);
    try {
      localStorage.setItem(STORAGE_PREFIX + active, JSON.stringify(next));
    } catch {
      /* storage full or blocked — the conversation still works in memory */
    }
  };

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }, []);

  const loadBeaconLeads = useCallback(async () => {
    try {
      setBeaconLeads(asList<BeaconLead>(await adminApi.get("/api/v1/admin/beacon-leads")));
    } catch {
      setBeaconLeads([]);
    }
  }, []);

  const loadRadarDrafts = useCallback(async () => {
    try {
      setRadarDrafts(asList<RadarDraft>(await adminApi.get("/api/v1/admin/radar-dm-drafts")));
    } catch {
      setRadarDrafts([]);
    }
  }, []);

  const loadContentDrafts = useCallback(async () => {
    try {
      const all = asList<ContentStudioItem>(await adminApi.get("/api/v1/admin/content-studio"));
      setContentDrafts(all.slice(0, 6));
    } catch {
      setContentDrafts([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot sync from the URL/localStorage on mount
    if (active === "beacon") loadBeaconLeads();
    if (active === "radar") loadRadarDrafts();
    if (active === "content") loadContentDrafts();
  }, [active, loadBeaconLeads, loadRadarDrafts, loadContentDrafts]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    stopDictation();
    const next: Turn[] = [...transcript, { role: "user", text }];
    persist(next);
    setInput("");
    setError(null);
    setSending(true);

    try {
      const payload: Record<string, unknown> = { message: text, transcript: next };

      if (spec.attachments && pending.length) {
        const attachments: Attachment[] = await Promise.all(
          pending.map(async (p) => ({ name: p.name, data: await readFileAsBase64(p.file) }))
        );
        payload.attachments = attachments;
        setPending([]);
      }
      if (active === "ada") payload.demo = demo;

      const res = await adminApi.post<{
        reply: string;
        images?: string[];
        read_errors?: string[];
      }>(`/api/v1/admin/agents/${active}/chat`, payload);

      if (res.read_errors?.length) {
        setError(`Some files could not be read — ${res.read_errors.join("; ")}`);
      }

      persist([...next, { role: "agent", text: res.reply }]);
      if (res.images?.length) setImages((prev) => [...prev, ...res.images!]);
      if (autoSpeak) speak(res.reply);

      // A reply may have saved something via a tool call — refresh the panel.
      if (active === "content") loadContentDrafts();
      if (active === "beacon") loadBeaconLeads();
      if (active === "radar") loadRadarDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The agent could not reply.");
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    if (transcript.length && !confirm("Clear this conversation?")) return;
    persist([]);
    setImages([]);
    setPending([]);
  };

  const setLeadStatus = async (lead: BeaconLead, action: "approve" | "flag") => {
    try {
      await adminApi.post(`/api/v1/admin/beacon-leads/${lead.id}/${action}`);
      await loadBeaconLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} the lead.`);
    }
  };

  const deleteDraft = async (draft: RadarDraft) => {
    if (!confirm("Delete this DM draft?")) return;
    try {
      await adminApi.del(`/api/v1/admin/radar-dm-drafts/${draft.id}`);
      await loadRadarDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the draft.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Leads & Clients"
        title="Talk to the agents directly."
        description="Same brains the site and automations use — ask them to do the work here."
        actions={
          <>
            <Button variant="outline" onClick={() => setAutoSpeak((v) => !v)}>
              {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              {autoSpeak ? "Speaking replies" : "Speak replies"}
            </Button>
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="w-4 h-4" />
              Clear chat
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {AGENTS.map((agent) => {
          const name = settings[agent.nameKey]?.trim() || agent.fallbackName;
          return (
            <button
              key={agent.key}
              onClick={() => setActive(agent.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                active === agent.key
                  ? "bg-bg-3 text-text"
                  : "text-text-2 hover:bg-bg-3 hover:text-text"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem] items-start">
        <Card bodyClassName="flex flex-col">
          <div
            ref={logRef}
            className="h-[28rem] overflow-y-auto custom-scrollbar p-5 space-y-3"
            aria-live="polite"
          >
            {transcript.length === 0 && !sending ? (
              <p className="text-sm text-text-3 text-center py-16">
                Ask {displayName} something to get started.
              </p>
            ) : (
              transcript.map((turn, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3.5 py-2.5 max-w-[85%] ${
                    turn.role === "user"
                      ? "bg-accent-soft ml-auto"
                      : "bg-bg-2 border border-hairline"
                  }`}
                >
                  <span className="text-xs text-text-3 block mb-1">
                    {turn.role === "user" ? "You" : displayName}
                  </span>
                  <p className="text-sm whitespace-pre-wrap">{turn.text}</p>
                  {turn.role === "agent" && (
                    <button
                      onClick={() => speak(turn.text)}
                      aria-label="Read this reply aloud"
                      className="mt-1.5 text-text-3 hover:text-text transition-colors"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}

            {sending && (
              <div
                className="rounded-lg px-3.5 py-2.5 bg-bg-2 border border-hairline w-fit"
                aria-label={`${displayName} is typing`}
              >
                <span className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full bg-text-3 animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </span>
              </div>
            )}
          </div>

          {images.length > 0 && (
            <div className="px-5 pb-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {images.map((src, i) => (
                // Agent-generated URL — next/image would need host allowlisting.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt={`Generated by ${displayName}`}
                  className="w-full rounded-lg border border-hairline"
                />
              ))}
            </div>
          )}

          <form onSubmit={send} className="border-t border-hairline p-4 space-y-3">
            {spec.attachments && pending.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pending.map((f, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-3 text-xs"
                  >
                    {f.name}
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setPending((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-text-3 hover:text-text"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <Textarea
              rows={3}
              placeholder={`Message ${displayName}…`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(e);
                }
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary" disabled={sending || !input.trim()}>
                <Send className="w-4 h-4" />
                {sending ? "Sending…" : "Send"}
              </Button>

              {micSupported && (
                <Button
                  type="button"
                  variant={listening ? "danger" : "outline"}
                  onClick={toggleDictation}
                  aria-pressed={listening}
                >
                  {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {listening ? "Stop dictating" : "Dictate"}
                </Button>
              )}

              {spec.attachments && (
                <>
                  <label className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors cursor-pointer">
                    <Paperclip className="w-4 h-4" />
                    Attach
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        setPending((prev) => [
                          ...prev,
                          ...files.map((file) => ({ name: file.name, file })),
                        ]);
                        e.target.value = "";
                      }}
                    />
                  </label>

                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer ml-1">
                    <input
                      type="checkbox"
                      className="accent-accent w-4 h-4"
                      checked={demo}
                      onChange={(e) => setDemo(e.target.checked)}
                    />
                    Demo mode
                  </label>
                </>
              )}

              <span className="text-xs text-text-3 ml-auto">
                {listening
                  ? "Listening… speak now"
                  : "Enter to send · Shift+Enter for a new line"}
              </span>
            </div>
          </form>
        </Card>

        {/* Agent-specific side panels, driven by the tools each agent can call. */}
        <div className="space-y-4">
          {active === "beacon" && (
            <Card title="Qualified leads" bodyClassName="p-4 space-y-2">
              {beaconLeads.length === 0 ? (
                <p className="text-sm text-text-3">
                  No leads logged yet. Ask {displayName} to research a niche.
                </p>
              ) : (
                beaconLeads.slice(0, 10).map((lead) => (
                  <div key={lead.id} className="rounded-lg border border-hairline p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <strong className="text-sm block truncate">{lead.business_name}</strong>
                        <span className="text-xs text-text-3">
                          {lead.contact_name || lead.email || lead.country || "—"}
                        </span>
                      </div>
                      <StatusPill status={lead.status} />
                    </div>

                    {lead.rationale && <p className="text-xs text-text-2">{lead.rationale}</p>}

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-text-3">
                        {lead.confidence != null ? `${Math.round(lead.confidence * 100)}% confident` : ""}
                      </span>
                      <div className="flex gap-1">
                        <IconButton
                          title="Approve lead"
                          tone="success"
                          onClick={() => setLeadStatus(lead, "approve")}
                        >
                          <Check className="w-4 h-4" />
                        </IconButton>
                        <IconButton
                          title="Flag lead"
                          tone="danger"
                          onClick={() => setLeadStatus(lead, "flag")}
                        >
                          <Flag className="w-4 h-4" />
                        </IconButton>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </Card>
          )}

          {active === "radar" && (
            <Card title="DM drafts" bodyClassName="p-4 space-y-2">
              {radarDrafts.length === 0 ? (
                <p className="text-sm text-text-3">
                  No DM drafts yet. Ask {displayName} to research someone.
                </p>
              ) : (
                radarDrafts.slice(0, 10).map((draft) => (
                  <div key={draft.id} className="rounded-lg border border-hairline p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <strong className="text-sm block truncate">{draft.target_name}</strong>
                        {draft.target_headline && (
                          <span className="text-xs text-text-3 line-clamp-1">
                            {draft.target_headline}
                          </span>
                        )}
                      </div>
                      <StatusPill status={draft.status} />
                    </div>

                    <p className="text-xs text-text-2 whitespace-pre-wrap">{draft.message}</p>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-text-3">{formatDateTime(draft.created_at)}</span>
                      <IconButton title="Delete draft" tone="danger" onClick={() => deleteDraft(draft)}>
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </div>
                  </div>
                ))
              )}
            </Card>
          )}

          {active === "content" && (
            <Card title="Recent studio output" bodyClassName="p-4 space-y-2">
              {contentDrafts.length === 0 ? (
                <p className="text-sm text-text-3">
                  Nothing yet. Ask {displayName} to draft a post or make a flyer.
                </p>
              ) : (
                contentDrafts.map((item) => (
                  <div key={item.id} className="rounded-lg border border-hairline p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <strong className="text-sm truncate">{item.title || item.kind}</strong>
                      <StatusPill status={item.status} />
                    </div>
                    {item.image_url && (
                      // Studio output path — next/image would need host allowlisting.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt={item.title || "Studio output"}
                        className="w-full rounded-md border border-hairline mt-1"
                      />
                    )}
                    <span className="text-xs text-text-3 block mt-1">
                      {formatDateTime(item.created_at)}
                    </span>
                  </div>
                ))
              )}
              <a
                href="/admin/content-studio"
                className="inline-flex items-center justify-center h-9 px-4 w-full rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
              >
                Open Content Studio
              </a>
            </Card>
          )}

          <Card title="How this works" bodyClassName="p-4">
            <p className="text-sm text-text-2">
              Each agent here uses the same brain and tools as its automated counterpart, so
              anything it saves — leads, drafts, proposals — shows up on the matching admin page.
              Conversations are kept per agent in this browser only.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
