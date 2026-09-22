"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/api";
import { CodeAgentTurn, loadCodeAgentChats, newCodeAgentChatId, saveCodeAgentChat } from "@/lib/code-agent-chats";
import { Button, Card, ErrorBanner, PageHeader } from "@/components/admin/ui";
import {
  Bot, Check, CheckCircle2, ChevronDown, Code2, FileCode2, Loader2,
  FolderGit2, HardDrive, RotateCcw, Send, Sparkles, X,
} from "lucide-react";

type Provider = { id: string; label: string; model: string };
type Turn = CodeAgentTurn;
type Change = { workspace?: "local" | "github"; path: string; content: string; summary: string; original_hash: string; is_new: boolean };
type ChatResponse = { reply: string; provider: string; changes: Change[] };

function cleanAgentReply(text: string) {
  return text
    .replace(/^\s*```[^\n]*\n?/gm, "")
    .replace(/```\s*$/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-+*]\s+/gm, "")
    .replace(/\*+/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/_{2}([^_]+)_{2}/g, "$1")
    .trim();
}

export default function CodeAgentClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedChat = searchParams.get("chat");
  const isNewChat = searchParams.get("new") === "1";
  const [chatId, setChatId] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("");
  const [workspace, setWorkspace] = useState<"local" | "github">("local");
  const [useCustomInstructions, setUseCustomInstructions] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.95);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [changes, setChanges] = useState<Change[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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
  }, []);

  useEffect(() => {
    const chats = loadCodeAgentChats();
    const selected = !isNewChat && requestedChat ? chats.find((chat) => chat.id === requestedChat) : null;
    setChatId(selected?.id || newCodeAgentChatId());
    setTurns(selected?.turns || []);
    if (selected?.settings) {
      setProvider(selected.settings.provider);
      setWorkspace(selected.settings.workspace);
      setTemperature(selected.settings.temperature);
      setTopP(selected.settings.topP);
      setMaxTokens(selected.settings.maxTokens);
      setUseCustomInstructions(selected.settings.useSystemPrompt);
      setCustomInstructions(selected.settings.systemPrompt);
    }
    setChanges([]);
    setSelected({});
    setNotice(null);
  }, [isNewChat, requestedChat]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const saveTurns = (next: Turn[]) => {
    setTurns(next);
    const id = chatId || newCodeAgentChatId();
    if (!chatId) setChatId(id);
    const firstRequest = next.find((turn) => turn.role === "user")?.text || "New coding chat";
    saveCodeAgentChat({ id, title: firstRequest.slice(0, 52), updatedAt: new Date().toISOString(), turns: next, settings: { provider, workspace, temperature, topP, maxTokens, useSystemPrompt: useCustomInstructions, systemPrompt: customInstructions } });
    if (requestedChat !== id) router.replace(`/admin/code-agent?chat=${encodeURIComponent(id)}`, { scroll: false });
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
        provider, workspace, message, transcript: history,
        custom_instructions: useCustomInstructions ? customInstructions.trim() : "",
        temperature, top_p: topP, max_tokens: maxTokens,
      });
      saveTurns([...turns, { role: "user", text: message }, { role: "agent", text: cleanAgentReply(result.reply), provider: result.provider }]);
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
    if (turns.length && !confirm("Start a new coding session?")) return;
    setChatId(newCodeAgentChatId());
    setTurns([]);
    setChanges([]);
    setSelected({});
    setNotice(null);
    router.replace("/admin/code-agent?new=1", { scroll: false });
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

      <div className="grid min-h-[calc(100vh-15rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
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
              <div className="flex items-end justify-between gap-3 px-1">
                <div className="flex items-center gap-1">
                <div className="relative">
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={pickerOpen}
                    onClick={() => setPickerOpen((open) => !open)}
                    className="flex max-w-[14rem] items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-text-2 transition-colors hover:bg-bg-3 hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${activeProvider ? "bg-green-500" : "bg-text-3"}`} />
                    <span className="truncate">{activeProvider?.label || "Select model"}</span>
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
                  </button>

                  {pickerOpen && (
                    <div role="listbox" aria-label="Connected models" className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-xl border border-hairline-strong bg-bg shadow-xl">
                      <div className="border-b border-hairline px-3 py-2">
                        <div className="text-xs font-semibold text-text">Choose a model</div>
                        <div className="text-[11px] text-text-3">API keys stay on the server.</div>
                      </div>
                      <div className="max-h-64 space-y-1 overflow-y-auto p-1.5">
                        {providers.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            role="option"
                            aria-selected={provider === item.id}
                            onClick={() => { setProvider(item.id); setPickerOpen(false); }}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${provider === item.id ? "bg-accent-soft" : "hover:bg-bg-2"}`}
                          >
                            <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${provider === item.id ? "border-accent" : "border-hairline-strong"}`}>
                              {provider === item.id && <span className="h-2 w-2 rounded-full bg-accent" />}
                            </span>
                            <span className="min-w-0"><span className="block text-sm font-medium text-text">{item.label}</span><span className="block truncate text-xs text-text-3">{item.model}</span></span>
                          </button>
                        ))}
                        {!providers.length && <a href="/admin/settings" className="block rounded-lg p-3 text-sm text-accent hover:bg-bg-2">Connect an AI key in Settings</a>}
                      </div>
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setWorkspace((value) => value === "local" ? "github" : "local")} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-text-2 transition-colors hover:bg-bg-3 hover:text-text" title="Switch file workspace">
                  {workspace === "github" ? <FolderGit2 className="size-3.5 text-accent" /> : <HardDrive className="size-3.5" />}
                  {workspace === "github" ? "GitHub" : "Local"}
                </button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="hidden text-xs text-text-3 sm:inline">Enter to send · Shift+Enter for a new line</span>
                  <Button type="submit" variant="accent" disabled={!provider || !input.trim() || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send</Button>
                </div>
              </div>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
        <Card title="Model settings" bodyClassName="space-y-4 p-4">
          <div><label className="mb-1.5 block text-xs font-medium text-text-3">Selected model</label><select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full rounded-lg border border-hairline bg-bg-2 px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent">{providers.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.model}</option>)}</select></div>
          <div><label className="mb-1.5 block text-xs font-medium text-text-3">File workspace</label><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setWorkspace("local")} className={`rounded-lg border px-3 py-2 text-sm ${workspace === "local" ? "border-accent/40 bg-accent-soft text-text" : "border-hairline text-text-2"}`}><HardDrive className="mr-1.5 inline size-3.5" />Local</button><button type="button" onClick={() => setWorkspace("github")} className={`rounded-lg border px-3 py-2 text-sm ${workspace === "github" ? "border-accent/40 bg-accent-soft text-text" : "border-hairline text-text-2"}`}><FolderGit2 className="mr-1.5 inline size-3.5" />GitHub</button></div></div>
          <div><div className="mb-2 flex items-center justify-between text-xs"><label htmlFor="code-temperature" className="font-medium text-text-2">Temperature</label><span className="rounded bg-bg-3 px-2 py-1 font-mono">{temperature.toFixed(1)}</span></div><input id="code-temperature" type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="w-full accent-accent" /></div>
          <div><div className="mb-2 flex items-center justify-between text-xs"><label htmlFor="code-top-p" className="font-medium text-text-2">Top P</label><span className="rounded bg-bg-3 px-2 py-1 font-mono">{topP.toFixed(2)}</span></div><input id="code-top-p" type="range" min="0" max="1" step="0.05" value={topP} onChange={(e) => setTopP(Number(e.target.value))} className="w-full accent-accent" /></div>
          <div><label htmlFor="code-max-tokens" className="mb-1.5 block text-xs font-medium text-text-3">Maximum output tokens</label><input id="code-max-tokens" type="number" min="256" max="8192" step="256" value={maxTokens} onChange={(e) => setMaxTokens(Math.max(256, Math.min(8192, Number(e.target.value) || 256)))} className="w-full rounded-lg border border-hairline bg-bg-2 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent" /></div>
          <label className="flex items-center justify-between gap-3 text-sm"><span><span className="block font-medium">Use custom system prompt</span><span className="text-xs text-text-3">Add guidance to this chat</span></span><input type="checkbox" checked={useCustomInstructions} onChange={(e) => setUseCustomInstructions(e.target.checked)} className="size-4 accent-accent" /></label>
          {useCustomInstructions && <textarea rows={4} value={customInstructions} onChange={(e) => setCustomInstructions(e.target.value)} placeholder="For example: preserve existing APIs and add tests." className="w-full resize-none rounded-lg border border-hairline bg-bg-2 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent" />}
        </Card>
        <Card title={`Proposed changes${changes.length ? ` (${changes.length})` : ""}`} bodyClassName="flex flex-col">
          {!changes.length ? (
            <div className="p-6 text-center"><FileCode2 className="mx-auto mb-3 h-7 w-7 text-text-3" /><p className="text-sm font-medium">No files staged</p><p className="mt-1 text-xs leading-5 text-text-3">The agent’s proposed edits will appear here for approval.</p></div>
          ) : (
            <>
              <div className="custom-scrollbar max-h-[32rem] space-y-2 overflow-y-auto p-3">
                {changes.map((change) => (
                  <label key={change.path} className={`block cursor-pointer rounded-lg border p-3 transition-colors ${selected[change.path] ? "border-accent/40 bg-accent-soft" : "border-hairline bg-bg-2 opacity-70"}`}>
                    <div className="flex items-start gap-2"><span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${selected[change.path] ? "border-accent bg-accent text-on-accent" : "border-hairline-strong"}`}>{selected[change.path] && <Check className="h-3 w-3" />}</span><input type="checkbox" className="sr-only" checked={!!selected[change.path]} onChange={(e) => setSelected((old) => ({ ...old, [change.path]: e.target.checked }))} /><div className="min-w-0"><div className="truncate font-mono text-xs text-text">{change.path}</div><p className="mt-1 text-xs leading-5 text-text-3">{change.summary}</p><span className="mt-2 inline-block rounded bg-bg-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-text-3">{change.workspace === "github" ? "GitHub" : change.is_new ? "New file" : "Modified"}</span></div></div>
                  </label>
                ))}
              </div>
              <div className="border-t border-hairline p-3"><Button variant="accent" className="w-full" onClick={apply} disabled={!approvedCount || applying}>{applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Apply {approvedCount || "selected"} change{approvedCount === 1 ? "" : "s"}</Button><button onClick={() => { setChanges([]); setSelected({}); }} className="mt-2 flex w-full items-center justify-center gap-1 py-2 text-xs text-text-3 hover:text-text"><X className="h-3.5 w-3.5" />Discard proposal</button></div>
            </>
          )}
        </Card>
        </div>
      </div>
    </div>
  );
}
