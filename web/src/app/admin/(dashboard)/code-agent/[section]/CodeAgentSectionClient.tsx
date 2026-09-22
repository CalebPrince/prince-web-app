"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import { Button, Card, ErrorBanner, Field, Input, PageHeader } from "@/components/admin/ui";
import { Bot, Boxes, CheckCircle2, CloudUpload, Code2, FileSearch, FolderGit2, GitBranch, KeyRound, MessageSquare, ShieldCheck, Wrench } from "lucide-react";

type Provider = { id: string; label: string; model: string };
type Props = { section: string };

const toolRows = [
  ["List files", "Browse safe source files without exposing secrets."],
  ["Search source", "Find literal text across frontend and backend code."],
  ["Read files", "Inspect UTF-8 source before preparing an edit."],
  ["Stage changes", "Prepare complete files for your review before writing."],
];

export default function CodeAgentSectionClient({ section }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      adminApi.get<{ providers: Provider[] }>("/api/v1/admin/coding-agent/providers"),
      adminApi.get<Record<string, string>>("/api/v1/admin/settings"),
    ]).then(([modelData, settingData]) => { setProviders(modelData.providers); setSettings(settingData); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the workspace."));
  }, []);

  const saveGithub = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      await adminApi.put("/api/v1/admin/settings", {
        coding_github_token: settings.coding_github_token || "",
        coding_github_repo: settings.coding_github_repo || "",
        coding_github_branch: settings.coding_github_branch || "main",
      });
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save GitHub settings."); }
    finally { setSaving(false); }
  };

  if (section === "home") return <div className="space-y-6"><PageHeader kicker="Code workspace" title="Build across local and GitHub files." description="A focused workspace for reviewing the codebase, preparing changes, and shipping deliberate updates." /><div className="grid gap-4 md:grid-cols-3"><Card bodyClassName="p-5"><MessageSquare className="mb-4 size-5 text-accent" /><h3 className="font-semibold">Start with a request</h3><p className="mt-2 text-sm text-text-3">Describe the outcome. The agent inspects the relevant files before staging changes.</p><Link href="/admin/code-agent" className="mt-4 inline-flex text-sm font-medium text-accent">Open a chat</Link></Card><Card bodyClassName="p-5"><Boxes className="mb-4 size-5 text-accent" /><h3 className="font-semibold">Choose your model</h3><p className="mt-2 text-sm text-text-3">Use any connected tool-capable provider for each conversation.</p><p className="mt-4 text-2xl font-semibold">{providers.length}</p><span className="text-xs text-text-3">models connected</span></Card><Card bodyClassName="p-5"><FolderGit2 className="mb-4 size-5 text-accent" /><h3 className="font-semibold">Connect GitHub</h3><p className="mt-2 text-sm text-text-3">Work with a configured repository and branch while keeping changes behind approval.</p><Link href="/admin/code-agent/settings" className="mt-4 inline-flex text-sm font-medium text-accent">Configure repository</Link></Card></div></div>;

  if (section === "models") return <div className="space-y-6"><PageHeader kicker="Code workspace" title="Models" description="Every provider shown here has a server-side API key connected in Admin Settings." /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{providers.map((p) => <Card key={p.id} bodyClassName="p-5"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Bot className="size-5" /></span><span className="rounded-full bg-green-500/10 px-2 py-1 text-xs text-green-500">Connected</span></div><h3 className="mt-5 font-semibold">{p.label}</h3><p className="mt-1 font-mono text-xs text-text-3">{p.model}</p></Card>)}</div></div>;

  if (section === "tools") return <div className="space-y-6"><PageHeader kicker="Code workspace" title="Website tools" description="The agent uses a deliberately small toolset with sensitive paths blocked." /><div className="grid gap-3 md:grid-cols-2">{toolRows.map(([name, description], i) => <Card key={name} bodyClassName="flex gap-4 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-3 text-accent">{i === 0 ? <Wrench className="size-5" /> : i === 1 ? <FileSearch className="size-5" /> : i === 2 ? <Code2 className="size-5" /> : <ShieldCheck className="size-5" />}</span><div><h3 className="font-semibold">{name}</h3><p className="mt-1 text-sm text-text-3">{description}</p></div></Card>)}</div></div>;

  if (section === "deploy") return <div className="space-y-6"><PageHeader kicker="Code workspace" title="Deploy" description="Review the destination before sending approved changes upstream." /><Card bodyClassName="p-6"><div className="flex items-center gap-3"><CloudUpload className="size-5 text-accent" /><div><h3 className="font-semibold">GitHub destination</h3><p className="text-sm text-text-3">{settings.coding_github_repo || "No repository configured"}</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-hairline bg-bg-2 p-4"><div className="text-xs uppercase tracking-wider text-text-3">Branch</div><div className="mt-2 flex items-center gap-2 font-mono text-sm"><GitBranch className="size-4" />{settings.coding_github_branch || "main"}</div></div><div className="rounded-lg border border-hairline bg-bg-2 p-4"><div className="text-xs uppercase tracking-wider text-text-3">Write access</div><div className="mt-2 text-sm">{settings.coding_github_token ? "Token configured" : "Token required"}</div></div></div><p className="mt-5 text-sm text-text-3">Approved local changes are available immediately on the server. GitHub publishing is enabled when a repository and fine-grained token are configured.</p></Card></div>;

  return <div className="space-y-6"><PageHeader kicker="Code workspace" title="Settings" description="Connect the GitHub repository the agent may inspect and update." />{error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}<Card title="GitHub connection" bodyClassName="space-y-5 p-5"><Field label="Repository" hint="Use owner/repository, for example CalebPrince/prince-web-app."><Input value={settings.coding_github_repo || ""} onChange={(e) => setSettings((s) => ({ ...s, coding_github_repo: e.target.value }))} placeholder="owner/repository" /></Field><Field label="Branch"><Input value={settings.coding_github_branch || "main"} onChange={(e) => setSettings((s) => ({ ...s, coding_github_branch: e.target.value }))} placeholder="main" /></Field><Field label="Fine-grained GitHub token" hint="Grant Contents read/write only for this repository."><Input type="password" value={settings.coding_github_token || ""} onChange={(e) => setSettings((s) => ({ ...s, coding_github_token: e.target.value }))} placeholder="github_pat_..." /></Field><div className="flex items-center gap-3"><Button variant="accent" onClick={saveGithub} disabled={saving}><KeyRound className="size-4" />{saving ? "Saving…" : "Save connection"}</Button>{saved && <span className="flex items-center gap-1.5 text-sm text-green-500"><CheckCircle2 className="size-4" />Saved</span>}</div></Card></div>;
}
