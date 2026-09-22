"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import { Button, Card, ErrorBanner, Field, Input, PageHeader } from "@/components/admin/ui";
import { Boxes, CheckCircle2, CloudUpload, Code2, FileSearch, FolderGit2, GitBranch, KeyRound, Laptop, MessageSquare, Server, ShieldCheck, Wrench } from "lucide-react";
import { ProviderLogo } from "@/components/admin/ProviderLogo";

type Provider = {
  id: string;
  label: string;
  model: string;
  configured: boolean;
  subscription_supported: boolean;
  connection: "api" | "subscription";
};
type Props = { section: string };

const toolRows = [
  ["List files", "Browse safe source files without exposing secrets."],
  ["Search source", "Find literal text across frontend and backend code."],
  ["Read files", "Inspect UTF-8 source before preparing an edit."],
  ["Stage changes", "Prepare complete files for your review before writing."],
];

export default function CodeAgentSectionClient({ section }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [environment, setEnvironment] = useState<"development" | "production">("production");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      adminApi.get<{ providers: Provider[]; environment: "development" | "production" }>("/api/v1/admin/coding-agent/providers"),
      adminApi.get<Record<string, string>>("/api/v1/admin/settings"),
    ]).then(([modelData, settingData]) => {
      setProviders(modelData.providers);
      setEnvironment(modelData.environment);
      setSettings(settingData);
    })
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

  const saveOpenRouter = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      await adminApi.put("/api/v1/admin/settings", {
        openrouter_api_key: settings.openrouter_api_key || "",
        openrouter_model: settings.openrouter_model || "openrouter/free",
      });
      setProviders((items) => items.map((item) => item.id === "openrouter" ? { ...item, configured: !!settings.openrouter_api_key, model: settings.openrouter_model || "openrouter/free" } : item));
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save OpenRouter settings."); }
    finally { setSaving(false); }
  };

  const savePrimaryProviders = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      const openAiConnection = settings.coding_openai_connection || "api";
      const anthropicConnection = settings.coding_anthropic_connection || "api";
      await adminApi.put("/api/v1/admin/settings", {
        coding_openai_connection: openAiConnection,
        coding_anthropic_connection: anthropicConnection,
        openai_api_key: settings.openai_api_key || "",
        openai_model: settings.openai_model || "",
        anthropic_api_key: settings.anthropic_api_key || "",
        anthropic_model: settings.anthropic_model || "",
      });
      setProviders((items) => items.map((item) => {
        if (item.id === "openai") return { ...item, configured: !!settings.openai_api_key, connection: openAiConnection as "api" | "subscription", model: settings.openai_model || item.model };
        if (item.id === "anthropic") return { ...item, configured: !!settings.anthropic_api_key, connection: anthropicConnection as "api" | "subscription", model: settings.anthropic_model || item.model };
        return item;
      }));
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save provider settings."); }
    finally { setSaving(false); }
  };

  if (section === "home") return <div className="space-y-6"><PageHeader kicker="Code workspace" title="Build across local and GitHub files." description="A focused workspace for reviewing the codebase, preparing changes, and shipping deliberate updates." /><div className="grid gap-4 md:grid-cols-3"><Card bodyClassName="p-5"><MessageSquare className="mb-4 size-5 text-accent" /><h3 className="font-semibold">Start with a request</h3><p className="mt-2 text-sm text-text-3">Describe the outcome. The agent inspects the relevant files before staging changes.</p><Link href="/admin/code-agent" className="mt-4 inline-flex text-sm font-medium text-accent">Open a chat</Link></Card><Card bodyClassName="p-5"><Boxes className="mb-4 size-5 text-accent" /><h3 className="font-semibold">Choose your model</h3><p className="mt-2 text-sm text-text-3">Use any connected tool-capable provider for each conversation.</p><p className="mt-4 text-2xl font-semibold">{providers.length}</p><span className="text-xs text-text-3">models connected</span></Card><Card bodyClassName="p-5"><FolderGit2 className="mb-4 size-5 text-accent" /><h3 className="font-semibold">Connect GitHub</h3><p className="mt-2 text-sm text-text-3">Work with a configured repository and branch while keeping changes behind approval.</p><Link href="/admin/code-agent/settings" className="mt-4 inline-flex text-sm font-medium text-accent">Configure repository</Link></Card></div></div>;

  if (section === "models") return <div className="space-y-6"><PageHeader kicker="Code workspace" title="Models" description="Connect a production API provider or select supported local subscription access." /><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{providers.map((p) => { const usingSubscription = p.subscription_supported && p.connection === "subscription"; return <Card key={p.id} bodyClassName="p-5"><div className="flex items-start justify-between"><span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><ProviderLogo provider={p.id} className="size-5" /></span><span className={`rounded-full px-2 py-1 text-xs ${p.configured ? "bg-green-500/10 text-green-500" : usingSubscription ? "bg-accent-soft text-accent" : "bg-bg-3 text-text-3"}`}>{p.configured ? "API connected" : usingSubscription ? "Local subscription" : "Not connected"}</span></div><h3 className="mt-5 font-semibold">{p.label}</h3><p className="mt-1 font-mono text-xs text-text-3">{p.model}</p>{usingSubscription && <p className="mt-3 text-xs text-text-3">Available through the official local coding client. Production chat still requires an API key.</p>}{!p.configured && <Link href="/admin/code-agent/settings" className="mt-4 inline-flex text-sm font-medium text-accent">Configure provider</Link>}</Card>; })}</div></div>;

  if (section === "tools") return <div className="space-y-6"><PageHeader kicker="Code workspace" title="Website tools" description="The agent uses a deliberately small toolset with sensitive paths blocked." /><div className="grid gap-3 md:grid-cols-2">{toolRows.map(([name, description], i) => <Card key={name} bodyClassName="flex gap-4 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-3 text-accent">{i === 0 ? <Wrench className="size-5" /> : i === 1 ? <FileSearch className="size-5" /> : i === 2 ? <Code2 className="size-5" /> : <ShieldCheck className="size-5" />}</span><div><h3 className="font-semibold">{name}</h3><p className="mt-1 text-sm text-text-3">{description}</p></div></Card>)}</div></div>;

  if (section === "deploy") return <div className="space-y-6"><PageHeader kicker="Code workspace" title="Deploy" description="Review the destination before sending approved changes upstream." /><Card bodyClassName="p-6"><div className="flex items-center gap-3"><CloudUpload className="size-5 text-accent" /><div><h3 className="font-semibold">GitHub destination</h3><p className="text-sm text-text-3">{settings.coding_github_repo || "No repository configured"}</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-hairline bg-bg-2 p-4"><div className="text-xs uppercase tracking-wider text-text-3">Branch</div><div className="mt-2 flex items-center gap-2 font-mono text-sm"><GitBranch className="size-4" />{settings.coding_github_branch || "main"}</div></div><div className="rounded-lg border border-hairline bg-bg-2 p-4"><div className="text-xs uppercase tracking-wider text-text-3">Write access</div><div className="mt-2 text-sm">{settings.coding_github_token ? "Token configured" : "Token required"}</div></div></div><p className="mt-5 text-sm text-text-3">Approved local changes are available immediately on the server. GitHub publishing is enabled when a repository and fine-grained token are configured.</p></Card></div>;

  const connectionChoice = (provider: "openai" | "anthropic", label: string, subscription: string) => {
    const key = `coding_${provider}_connection`;
    const selected = settings[key] || "api";
    return <div className="rounded-xl border border-hairline bg-bg-2 p-4">
      <div className="flex items-center gap-3"><ProviderLogo provider={provider} className="size-6" /><div><h3 className="font-semibold">{label}</h3><p className="text-xs text-text-3">Choose how you use this provider.</p></div></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => setSettings((s) => ({ ...s, [key]: "subscription" }))} className={`rounded-lg border p-3 text-left transition ${selected === "subscription" ? "border-accent bg-accent-soft" : "border-hairline hover:border-text-3"}`}><Laptop className="mb-2 size-4 text-accent" /><span className="block text-sm font-medium">{subscription}</span><span className="mt-1 block text-xs text-text-3">Local coding client only</span></button>
        <button type="button" onClick={() => setSettings((s) => ({ ...s, [key]: "api" }))} className={`rounded-lg border p-3 text-left transition ${selected === "api" ? "border-accent bg-accent-soft" : "border-hairline hover:border-text-3"}`}><Server className="mb-2 size-4 text-accent" /><span className="block text-sm font-medium">API key</span><span className="mt-1 block text-xs text-text-3">Required for production</span></button>
      </div>
    </div>;
  };

  return <div className="space-y-6">
    <PageHeader kicker="Code workspace" title="Settings" description="Use subscriptions with supported local coding clients and API keys for hosted production workloads." />
    {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
    <Card title="Connection mode" bodyClassName="space-y-5 p-5">
      <div className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent-soft p-4"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" /><div><p className="text-sm font-medium">{environment === "development" ? "Local development environment" : "Production environment"}</p><p className="mt-1 text-sm text-text-3">Subscription sign-in stays inside the official local Codex or Claude Code client. This hosted admin agent uses API keys in production and never stores subscription session tokens.</p></div></div>
      <div className="grid gap-4 lg:grid-cols-2">{connectionChoice("openai", "OpenAI", "ChatGPT subscription")}{connectionChoice("anthropic", "Anthropic", "Claude Pro or Max")}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-hairline p-4"><h3 className="font-semibold">OpenAI production API</h3><Field label="API key"><Input type="password" value={settings.openai_api_key || ""} onChange={(e) => setSettings((s) => ({ ...s, openai_api_key: e.target.value }))} placeholder="sk-..." /></Field><Field label="Model"><Input value={settings.openai_model || ""} onChange={(e) => setSettings((s) => ({ ...s, openai_model: e.target.value }))} placeholder="gpt-5" /></Field></div>
        <div className="space-y-4 rounded-xl border border-hairline p-4"><h3 className="font-semibold">Anthropic production API</h3><Field label="API key"><Input type="password" value={settings.anthropic_api_key || ""} onChange={(e) => setSettings((s) => ({ ...s, anthropic_api_key: e.target.value }))} placeholder="sk-ant-..." /></Field><Field label="Model"><Input value={settings.anthropic_model || ""} onChange={(e) => setSettings((s) => ({ ...s, anthropic_model: e.target.value }))} placeholder="claude-sonnet-4-5" /></Field></div>
      </div>
      <div className="flex items-center gap-3"><Button variant="accent" onClick={savePrimaryProviders} disabled={saving}><KeyRound className="size-4" />{saving ? "Saving…" : "Save provider access"}</Button>{saved && <span className="flex items-center gap-1.5 text-sm text-green-500"><CheckCircle2 className="size-4" />Saved</span>}</div>
    </Card>
    <Card title="OpenRouter production API" bodyClassName="space-y-5 p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><ProviderLogo provider="openrouter" className="size-5" /></span><div><h3 className="font-semibold">OpenRouter API provider</h3><p className="text-sm text-text-3">Use one API key to access your selected OpenRouter model.</p></div></div><Field label="API key"><Input type="password" value={settings.openrouter_api_key || ""} onChange={(e) => setSettings((s) => ({ ...s, openrouter_api_key: e.target.value }))} placeholder="sk-or-v1-..." /></Field><Field label="Model" hint="Enter an OpenRouter model slug or use openrouter/free."><Input value={settings.openrouter_model || "openrouter/free"} onChange={(e) => setSettings((s) => ({ ...s, openrouter_model: e.target.value }))} placeholder="openrouter/free" /></Field><Button variant="accent" onClick={saveOpenRouter} disabled={saving}><KeyRound className="size-4" />{saving ? "Saving…" : "Save OpenRouter"}</Button></Card>
    <Card title="GitHub connection" bodyClassName="space-y-5 p-5"><Field label="Repository" hint="Use owner/repository, for example CalebPrince/prince-web-app."><Input value={settings.coding_github_repo || ""} onChange={(e) => setSettings((s) => ({ ...s, coding_github_repo: e.target.value }))} placeholder="owner/repository" /></Field><Field label="Branch"><Input value={settings.coding_github_branch || "main"} onChange={(e) => setSettings((s) => ({ ...s, coding_github_branch: e.target.value }))} placeholder="main" /></Field><Field label="Fine-grained GitHub token" hint="Grant Contents read/write only for this repository."><Input type="password" value={settings.coding_github_token || ""} onChange={(e) => setSettings((s) => ({ ...s, coding_github_token: e.target.value }))} placeholder="github_pat_..." /></Field><div className="flex items-center gap-3"><Button variant="accent" onClick={saveGithub} disabled={saving}><KeyRound className="size-4" />{saving ? "Saving…" : "Save connection"}</Button>{saved && <span className="flex items-center gap-1.5 text-sm text-green-500"><CheckCircle2 className="size-4" />Saved</span>}</div></Card>
  </div>;
}
