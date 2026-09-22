"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { adminApi } from "@/lib/api";
import { Button, Card, ErrorBanner, PageHeader } from "@/components/admin/ui";
import {
  Bot, Check, CheckCircle2, ChevronRight, Code2, FileCode2, Loader2,
  RotateCcw, Send, ShieldCheck, Sparkles, X,
} from "lucide-react";

type Provider = { id: string; label: string; model: string };
type Turn = { role: "user" | "agent"; text: string; provider?: string };
type Change = { path: string; content: string; summary: string; original_hash: string; is_new: boolean };
type ChatResponse = { reply: string; provider: string; changes: Change[] };

const STORAGE_KEY = "admin-code-agent-v1";

export default function CodeAgentClient() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [changes, setChanges] = useState<Change[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    adminApi.get<{ providers: Provider[] }>("/api/v1/admin/coding-agent/providers")
      .then((result) => {
        setProviders(result.providers);
        setProvider((current) => current || result.providers[0]?.id || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load connected providers."));
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as Turn[];
      setTurns(saved);
    } catch { /* start clean when stored data is invalid */ }
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const saveTurns = (next: Turn[]) => {
    setTurns(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* optional persistence */ }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || !provider || busy) return;
    const history = turns.slice(-24);
    saveTurns([...turns, { role: "user", text: message }]);
    setInput("");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await adminApi.post<ChatResponse>("/api/v1/admin/coding-agent/chat", {
        provider, message, transcript: history,
      });
      saveTurns([...turns, { role: "user", text: message }, { role: "agent", text: result.reply, provider: result.provider }]);
      if (result.changes.length) {
        setChanges(result.changes);
        setSelected(Object.fromEntries(result.changes.map((change) => [change.path, true])));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The coding agent could not reply.");
    } finally { setBusy(false); }
  };

  const apply = async () => {
    const approved = changes.filter((change) => selected[change.path]);
    if (!approved.length || applying) return;
    if (!confirm(`Apply ${approved.length} reviewed file change${approved.length === 1 ? "" : "s"}?`)) return;
    setApplying(true);
    setError(null);
    try {
      const result = await adminApi.post<{ applied: string[] }>("/api/v1/admin/coding-agent/apply", { changes: approved });
      setNotice(`Applied ${result.applied.length} file change${result.applied.length === 1 ? "" : "s"}.`);
      setChanges([]);
      setSelected({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "The changes could not be applied.");
    } finally { setApplying(false); }
  };

  const reset = () => {
    if (turns.length && !confirm("Clear this coding session?")) return;
    saveTurns([]);
    setChanges([]);
    setSelected({});
    setNotice(null);
  };

  const activeProvider = providers.find((item) => item.id === provider);
  const approvedCount = changes.filter((change) => selected[change.path]).length;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="System / Code workspace"
        title="Build with your own models."
        description="Ask the agent to inspect and change the admin backend or frontend. Nothing is written until you approve it."
        actions={<Button variant="outline" onClick={reset}><RotateCcw className="w-4 h-4" />New session</Button>}
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-500">
          <CheckCircle2 className="w-4 h-4" />{notice}
        </div>
      )}

      <div className="grid min-h-[calc(100vh-15rem)] gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
        <Card className="h-fit" bodyClassName="p-3">
          <div className="px-2 pb-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-text-3">Connected model</div>
            <p className="mt-1 text-xs text-text-3">Keys stay on the server.</p>
          </div>
          <div className="space-y-1">
            {providers.map((item) => (
              <button key={item.id} onClick={() => setProvider(item.id)} className={`w-full rounded-lg px-3 py-3 text-left transition-colors ${provider === item.id ? "bg-accent-soft ring-1 ring-accent/30" : "hover:bg-bg-2"}`}>
                <span className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${provider === item.id ? "bg-accent" : "bg-green-500"}`} />{item.label}</span>
                <span className="mt-1 block truncate pl-4 text-xs text-text-3">{item.model}</span>
              </button>
            ))}
            {!providers.length && <a href="/admin/settings" className="block rounded-lg border border-dashed border-hairline p-3 text-sm text-text-2 hover:bg-bg-2">Connect an AI key in Settings <ChevronRight className="inline h-3.5 w-3.5" /></a>}
          </div>
          <div className="mt-4 border-t border-hairline px-2 pt-4 text-xs leading-5 text-text-3">
            <ShieldCheck className="mb-2 h-4 w-4 text-green-500" />
            Secret files, uploads, dependencies, and database data are blocked from the agent.
          </div>
        </Card>

        <Card className="flex min-h-[40rem] flex-col" bodyClassName="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-hairline bg-bg-2 px-5 py-3">
            <div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent"><Code2 className="h-4 w-4" /></span><div><div className="text-sm font-semibold">Code Agent</div><div className="text-xs text-text-3">{activeProvider ? `${activeProvider.label} · ${activeProvider.model}` : "No provider connected"}</div></div></div>
            <span className="flex items-center gap-1.5 text-xs text-text-3"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />Repository scoped</span>
          </div>

          <div ref={logRef} className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-5" aria-live="polite">
            {!turns.length && !busy && (
              <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
                <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-hairline bg-bg-2"><Sparkles className="h-6 w-6 text-accent" /></span>
                <h3 className="text-lg font-semibold">What should we improve?</h3>
                <p className="mt-2 text-sm leading-6 text-text-3">Try “Find why the projects form loses validation errors and prepare a fix.” The agent will inspect the code and stage reviewable files.</p>
              </div>
            )}
            {turns.map((turn, index) => (
              <div key={index} className={`flex gap-3 ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
                {turn.role === "agent" && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-bg-3"><Bot className="h-4 w-4 text-accent" /></span>}
                <div className={`max-w-[82%] rounded-xl px-4 py-3 text-sm leading-6 ${turn.role === "user" ? "bg-text text-bg" : "border border-hairline bg-bg-2"}`}>
                  <p className="whitespace-pre-wrap">{turn.text}</p>
                  {turn.provider && <div className="mt-2 text-[11px] uppercase tracking-wider text-text-3">{turn.provider}</div>}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-3 text-sm text-text-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-bg-3"><Loader2 className="h-4 w-4 animate-spin text-accent" /></span>Inspecting the repository…</div>}
          </div>

          <form onSubmit={send} className="border-t border-hairline p-4">
            <div className="rounded-xl border border-hairline-strong bg-bg-2 p-2 focus-within:ring-1 focus-within:ring-accent">
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} rows={3} disabled={!provider || busy} placeholder={provider ? "Describe a bug, feature, or refactor…" : "Connect an AI provider in Settings first"} className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-text-3" />
              <div className="flex items-center justify-between gap-3 px-1"><span className="text-xs text-text-3">Enter to send · Shift+Enter for a new line</span><Button type="submit" variant="accent" disabled={!provider || !input.trim() || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send</Button></div>
            </div>
          </form>
        </Card>

        <Card title={`Proposed changes${changes.length ? ` (${changes.length})` : ""}`} bodyClassName="flex flex-col">
          {!changes.length ? (
            <div className="p-6 text-center"><FileCode2 className="mx-auto mb-3 h-7 w-7 text-text-3" /><p className="text-sm font-medium">No files staged</p><p className="mt-1 text-xs leading-5 text-text-3">The agent’s proposed edits will appear here for approval.</p></div>
          ) : (
            <>
              <div className="custom-scrollbar max-h-[32rem] space-y-2 overflow-y-auto p-3">
                {changes.map((change) => (
                  <label key={change.path} className={`block cursor-pointer rounded-lg border p-3 transition-colors ${selected[change.path] ? "border-accent/40 bg-accent-soft" : "border-hairline bg-bg-2 opacity-70"}`}>
                    <div className="flex items-start gap-2"><span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${selected[change.path] ? "border-accent bg-accent text-on-accent" : "border-hairline-strong"}`}>{selected[change.path] && <Check className="h-3 w-3" />}</span><input type="checkbox" className="sr-only" checked={!!selected[change.path]} onChange={(e) => setSelected((old) => ({ ...old, [change.path]: e.target.checked }))} /><div className="min-w-0"><div className="truncate font-mono text-xs text-text">{change.path}</div><p className="mt-1 text-xs leading-5 text-text-3">{change.summary}</p><span className="mt-2 inline-block rounded bg-bg-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-text-3">{change.is_new ? "New file" : "Modified"}</span></div></div>
                  </label>
                ))}
              </div>
              <div className="border-t border-hairline p-3"><Button variant="accent" className="w-full" onClick={apply} disabled={!approvedCount || applying}>{applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Apply {approvedCount || "selected"} change{approvedCount === 1 ? "" : "s"}</Button><button onClick={() => { setChanges([]); setSelected({}); }} className="mt-2 flex w-full items-center justify-center gap-1 py-2 text-xs text-text-3 hover:text-text"><X className="h-3.5 w-3.5" />Discard proposal</button></div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
