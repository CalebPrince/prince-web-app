"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CHAT_EVENT, CodeAgentChat, loadCodeAgentChats } from "@/lib/code-agent-chats";
import { ArrowLeft, Bot, Boxes, CloudUpload, FolderGit2, Home, MessageSquare, Plus, Settings2, Wrench } from "lucide-react";

const items = [
  { name: "Home", href: "/admin/code-agent/home", icon: Home },
  { name: "Chats", href: "/admin/code-agent", icon: MessageSquare },
  { name: "Models", href: "/admin/code-agent/models", icon: Boxes },
  { name: "Website tools", href: "/admin/code-agent/tools", icon: Wrench },
  { name: "Deploy", href: "/admin/code-agent/deploy", icon: CloudUpload },
  { name: "Settings", href: "/admin/code-agent/settings", icon: Settings2 },
];

export function CodeAgentSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeChat = searchParams.get("chat");
  const [recent, setRecent] = useState<CodeAgentChat[]>([]);
  useEffect(() => {
    const load = () => setRecent(loadCodeAgentChats());
    load();
    window.addEventListener(CHAT_EVENT, load);
    return () => window.removeEventListener(CHAT_EVENT, load);
  }, []);
  return (
    <nav className="flex flex-1 flex-col overflow-y-auto p-4">
      <div className="mb-5 flex items-center gap-3 px-2">
        <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent"><Bot className="size-5" /></span>
        <div><div className="font-semibold">Code workspace</div><div className="text-xs text-text-3">Inspect. Build. Review.</div></div>
      </div>
      <Link href="/admin/code-agent?new=1" onClick={onNavigate} className="mb-5 flex h-11 items-center gap-3 rounded-lg border border-hairline-strong bg-bg-3 px-3 text-sm font-medium transition-colors hover:border-accent/40">
        <Plus className="size-4" />New chat
      </Link>
      <div className="space-y-1">
        {items.map((item) => {
          const active = item.href === "/admin/code-agent" ? pathname === item.href : pathname.startsWith(item.href);
          return <Link key={item.name} href={item.href} onClick={onNavigate} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-bg-3 text-text" : "text-text-2 hover:bg-bg-3 hover:text-text"}`}><item.icon className={`size-4 ${active ? "text-accent" : "text-text-3"}`} />{item.name}</Link>;
        })}
      </div>
      <div className="mt-6 border-t border-hairline pt-5">
        <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-3">Recent chats</div>
        <div className="space-y-1">
          {recent.slice(0, 6).map((chat) => <Link key={chat.id} href={`/admin/code-agent?chat=${encodeURIComponent(chat.id)}`} onClick={onNavigate} className={`block rounded-lg px-3 py-2 text-sm transition-colors ${activeChat === chat.id ? "bg-bg-3 text-text" : "text-text-2 hover:bg-bg-3"}`}><span className="block truncate">{chat.title}</span><span className="mt-0.5 block text-[11px] text-text-3">{new Date(chat.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></Link>)}
          {!recent.length && <p className="px-3 py-2 text-xs leading-5 text-text-3">Your saved conversations will appear here.</p>}
        </div>
      </div>
      <div className="mt-5 border-t border-hairline pt-5">
        <div className="mb-2 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-3"><FolderGit2 className="size-3.5" />Workspace</div>
        <p className="px-3 text-xs leading-5 text-text-3">Local files and connected GitHub repositories share the same review gate.</p>
      </div>
      <Link href="/admin" onClick={onNavigate} className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-2 transition-colors hover:bg-bg-3 hover:text-text"><ArrowLeft className="size-4" />Back to menus</Link>
    </nav>
  );
}
