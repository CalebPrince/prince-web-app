"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { LogOut, Loader2, Upload, Send, ExternalLink, Activity, FileText, MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function ClientDashboardPage() {
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [dashboard, setDashboard] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Authenticate client
    api.clientGetMe()
      .then(c => {
        setClient(c);
        loadData();
      })
      .catch(() => {
        window.location.href = "/client/login";
      });
  }, []);

  const loadData = () => {
    api.clientGetDashboard()
      .then(setDashboard)
      .catch(err => setDashboardError(err.message));
      
    api.clientGetFiles()
      .then(setFiles)
      .catch(err => setFilesError(err.message));
      
    api.clientGetMessages()
      .then(setMessages)
      .catch(err => setMessagesError(err.message));
  };

  useEffect(() => {
    // Scroll to bottom of messages when they load or update
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const onLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await api.clientLogout();
    } finally {
      window.location.href = "/client/login";
    }
  };

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    setFilesError(null);
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await fetch("/api/v1/client/files", { 
        method: "POST", 
        body: formData 
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed.");
      }
      
      const newFiles = await api.clientGetFiles();
      setFiles(newFiles);
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = messageInput.trim();
    if (!body) return;
    
    setSending(true);
    try {
      await api.clientSendMessage({ body });
      setMessageInput("");
      const newMsgs = await api.clientGetMessages();
      setMessages(newMsgs);
    } catch (err) {
      setMessagesError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const formatAmount = (subunits: number, currency: string) => {
    return `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  if (!client) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-accent" />
      </div>
    );
  }

  const proposals = dashboard?.proposals || [];
  const monitors = dashboard?.monitors || [];

  return (
    <div className="min-h-screen bg-bg">
      <nav className="sticky top-0 z-40 border-b border-hairline bg-bg/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="text-accent">P</span>rince Caleb<span className="text-accent">.</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm font-medium text-text-2 sm:inline-block">
              {client.name}
            </span>
            <button 
              onClick={onLogout}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-text-2 transition-colors hover:bg-bg-soft hover:text-text"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline-block">Log out</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1200px] px-6 py-12">
        <div className="mb-10">
          <p className="eyebrow mb-2 uppercase tracking-widest text-accent">Client portal</p>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">Your projects</h1>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            {/* Uptime Monitors */}
            {monitors.length > 0 && (
              <div className="rounded-[24px] border border-hairline bg-card p-6 md:p-8">
                <div className="mb-6 flex items-center gap-2">
                  <Activity className="size-5 text-accent" />
                  <h2 className="text-xl font-bold">Site Status</h2>
                </div>
                <div className="space-y-3">
                  {monitors.map((m: any, i: number) => {
                    const up = m.last_status === "up";
                    const unknown = !m.last_status;
                    return (
                      <div key={i} className="flex flex-col justify-between gap-3 rounded-xl bg-bg-soft p-4 sm:flex-row sm:items-center">
                        <div>
                          <div className="font-semibold">{m.name}</div>
                          <a href={m.url} target="_blank" rel="noopener" className="mt-1 flex items-center gap-1 text-sm text-text-2 hover:text-text">
                            {m.url} <ExternalLink className="size-3" />
                          </a>
                        </div>
                        <div className="sm:text-right">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${unknown ? 'bg-amber-100 text-amber-800' : up ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            <span className="size-2 rounded-full bg-current" />
                            {unknown ? "Checking" : up ? "Online" : "Down"}
                          </span>
                          {m.uptime_30d != null && (
                            <div className="mt-2 text-xs text-text-2">
                              {m.uptime_30d}% uptime (30d) {m.avg_response_ms != null && `· ${m.avg_response_ms}ms avg`}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Proposals / Projects */}
            {dashboardError ? (
              <div className="rounded-[24px] border border-red-900/50 bg-red-900/10 p-6 text-red-400">
                {dashboardError}
              </div>
            ) : proposals.length === 0 ? (
              <div className="rounded-[24px] border border-hairline bg-card py-16 text-center text-text-2">
                No projects yet.
              </div>
            ) : (
              <div className="space-y-8">
                {proposals.map((p: any, i: number) => {
                  const accepted = p.status === "accepted";
                  const milestones = p.milestones || [];
                  return (
                    <div key={i} className="rounded-[24px] border border-hairline bg-card p-6 md:p-8">
                      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row">
                        <div>
                          <h2 className="mb-2 text-2xl font-bold">{p.title}</h2>
                          {p.timeline && <div className="text-sm text-text-2">Timeline: {p.timeline}</div>}
                        </div>
                        <div className="md:text-right">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${accepted ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                            {p.status}
                          </span>
                          <div className="mt-2 text-xl font-bold text-accent">{formatAmount(p.total_amount, p.currency)}</div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {milestones.map((m: any, j: number) => (
                          <div key={j} className="flex flex-col justify-between gap-3 rounded-xl bg-bg-soft p-4 md:flex-row md:items-center">
                            <div>
                              <div className="font-semibold">{m.title}</div>
                              {m.due_note && <div className="mt-1 text-sm text-text-2">{m.due_note}</div>}
                              <div className="mt-2 text-sm font-medium text-accent">{formatAmount(m.amount, m.currency)}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${m.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                                {m.payment_status || 'pending'}
                              </span>
                              {accepted && m.payment_status !== 'paid' && m.payment_url && (
                                <a href={m.payment_url} className="tilt-3d tilt-glow rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-light">
                                  Pay now
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-8">
            {/* Files */}
            <div className="rounded-[24px] border border-hairline bg-card p-6 md:p-8">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="size-5 text-accent" />
                  <h2 className="text-xl font-bold">Files</h2>
                </div>
                <div>
                  <input type="file" id="file-upload" className="hidden" onChange={onFileUpload} ref={fileInputRef} />
                  <label 
                    htmlFor="file-upload" 
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-hairline-strong bg-transparent px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-accent hover:text-accent"
                  >
                    {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                    Upload
                  </label>
                </div>
              </div>
              
              {filesError && (
                <div className="mb-4 rounded border border-red-900/50 bg-red-900/10 p-3 text-xs text-red-400">
                  {filesError}
                </div>
              )}

              <div className="space-y-2">
                {files.length === 0 ? (
                  <div className="py-4 text-center text-sm text-text-2">No files yet.</div>
                ) : (
                  files.map((f: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-lg bg-bg-soft p-3">
                      <a href={f.file_path} target="_blank" rel="noopener" className="truncate text-sm font-medium hover:text-accent hover:underline">
                        {f.original_name}
                      </a>
                      <span className="shrink-0 text-xs text-text-2">
                        {f.uploaded_by === "admin" ? "From Prince" : "You"} · {new Date(f.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex h-[500px] flex-col rounded-[24px] border border-hairline bg-card p-4 md:p-6">
              <div className="mb-4 flex items-center gap-2 px-2">
                <MessageSquare className="size-5 text-accent" />
                <h2 className="text-xl font-bold">Messages</h2>
              </div>

              {messagesError && (
                <div className="mb-4 rounded border border-red-900/50 bg-red-900/10 p-3 text-xs text-red-400">
                  {messagesError}
                </div>
              )}

              <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-hairline">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-text-2">
                    No messages yet, say hello!
                  </div>
                ) : (
                  messages.map((m: any, i: number) => {
                    const isClient = m.sender_type === "client";
                    return (
                      <div key={i} className={`flex ${isClient ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${isClient ? "bg-accent text-on-accent rounded-br-sm" : "bg-bg-soft text-text rounded-bl-sm"}`}>
                          <div className="text-sm">{m.body}</div>
                          <div className={`mt-1 text-[10px] ${isClient ? "text-on-accent/70" : "text-text-2"}`}>
                            {new Date(m.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="mt-2 pt-4 border-t border-hairline">
                <form onSubmit={onSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={messageInput}
                    onChange={e => setMessageInput(e.target.value)}
                    placeholder="Type a message..."
                    className="h-10 flex-1 rounded-full border border-hairline-strong bg-bg/50 px-4 text-sm text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none"
                  />
                  <Button type="submit" disabled={sending || !messageInput.trim()} size="icon" className="size-10 shrink-0 rounded-full">
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
