"use client";

import { useState } from "react";
import { api, AdminContentStudioItem } from "@/lib/api";
import { Trash2, ArrowUpRight, Image as ImageIcon, FileText, Megaphone, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

const KIND_CONFIG = {
  social: {
    label: "Social post",
    icon: Megaphone,
    color: "bg-[#0a66c2]/10 text-[#0a66c2]",
  },
  flyer: {
    label: "Flyer",
    icon: ImageIcon,
    color: "bg-purple-500/10 text-purple-500",
  },
  blog: {
    label: "Blog draft",
    icon: FileText,
    color: "bg-emerald-500/10 text-emerald-500",
  },
};

const STATUS_CONFIG = {
  draft: "bg-yellow-500/10 text-yellow-500",
  approved: "bg-green-500/10 text-green-500",
  used: "bg-bg-3 text-text-3",
};

function StudioItemCard({
  item,
  onUpdate,
  onPromote,
  onDelete,
}: {
  item: AdminContentStudioItem;
  onUpdate: (id: number, data: any) => Promise<void>;
  onPromote: (id: number) => Promise<void>;
  onDelete: (id: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [body, setBody] = useState(item.body ?? "");
  const [title, setTitle] = useState(item.title ?? "");
  const [hashtags, setHashtags] = useState(item.hashtags ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const config = KIND_CONFIG[item.kind];
  const Icon = config.icon;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(item.id, {
        title: item.kind === "blog" ? title : undefined,
        body,
        hashtags: item.kind !== "blog" ? hashtags : undefined,
      });
      setIsEditing(false);
    } catch (err) {
      alert("Failed to save.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePromote = async () => {
    setIsPromoting(true);
    try {
      await onPromote(item.id);
    } catch (err: any) {
      alert(err.message || "Failed to promote.");
    } finally {
      setIsPromoting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this studio item?")) return;
    setIsDeleting(true);
    try {
      await api.adminDeleteContentStudioItem(item.id);
      onDelete(item.id);
    } catch {
      alert("Failed to delete.");
      setIsDeleting(false);
    }
  };

  return (
    <div className={`rounded-xl border border-hairline bg-bg overflow-hidden transition-opacity ${item.status === "used" ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between px-4 py-3 bg-bg-2 border-b border-hairline">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${config.color}`}>
            <Icon className="w-3 h-3" />
            {config.label}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wider ${STATUS_CONFIG[item.status]}`}>
            {item.status}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-text-3">{new Date(item.created_at).toLocaleDateString()}</span>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="ml-2 p-1.5 text-text-3 hover:text-red-500 rounded hover:bg-bg-3 transition-colors disabled:opacity-50"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 flex flex-col md:flex-row gap-4">
        {item.image_url && (
          <div className="flex-none">
            <a href={item.image_url} target="_blank" rel="noopener noreferrer" className="group relative block">
              <img
                src={item.image_url}
                alt={item.title ?? "Studio image"}
                className="w-48 h-auto rounded-lg border border-hairline object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <ExternalLink className="w-5 h-5 text-white" />
              </div>
            </a>
          </div>
        )}

        <div className="flex-1 min-w-0 space-y-3">
          {item.kind === "blog" && (
            isEditing ? (
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Blog title"
              />
            ) : (
              item.title && <h3 className="font-bold text-text">{item.title}</h3>
            )
          )}

          {isEditing ? (
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={5}
              className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent font-sans"
              placeholder={item.kind === "blog" ? "Blog body..." : "Caption..."}
            />
          ) : (
            <p className="text-sm text-text-2 whitespace-pre-wrap line-clamp-4">
              {item.body ?? <span className="italic text-text-3">No caption yet — click Edit to add one.</span>}
            </p>
          )}

          {item.kind !== "blog" && (
            isEditing ? (
              <input
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
                className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="#WebDevelopment #Ghana"
              />
            ) : (
              item.hashtags && (
                <p className="text-xs text-text-3">{item.hashtags}</p>
              )
            )
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {isEditing ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium bg-accent text-white hover:bg-accent/90 h-7 px-3 transition-colors disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium bg-bg-3 text-text hover:bg-bg-3/80 h-7 px-3 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium bg-bg-3 text-text hover:bg-bg-3/80 h-7 px-3 transition-colors"
                >
                  Edit
                </button>
                {item.status !== "used" && (
                  <button
                    onClick={handlePromote}
                    disabled={isPromoting}
                    className="inline-flex items-center gap-1.5 justify-center whitespace-nowrap rounded-md text-xs font-medium bg-text text-bg hover:bg-text/90 h-7 px-3 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    {isPromoting
                      ? "Sending..."
                      : item.kind === "blog"
                      ? "Send to Blog"
                      : "Send to Social Drafts"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ContentStudioClient({ initialItems }: { initialItems: AdminContentStudioItem[] }) {
  const [items, setItems] = useState<AdminContentStudioItem[]>(initialItems);
  const [filter, setFilter] = useState<"all" | "social" | "flyer" | "blog">("all");
  const router = useRouter();

  const handleUpdate = async (id: number, data: any) => {
    const updated = await api.adminUpdateContentStudioItem(id, data);
    setItems(prev => prev.map(i => i.id === id ? updated : i));
  };

  const handlePromote = async (id: number) => {
    const result = await api.adminPromoteContentStudioItem(id);
    // Mark as used locally
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: "used" } : i));
    if (result.target === "blog") {
      router.push("/admin/blog");
    } else {
      router.push("/admin/social-drafts");
    }
  };

  const handleDelete = (id: number) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const filtered = filter === "all" ? items : items.filter(i => i.kind === filter);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <div className="text-sm font-medium text-text-3 uppercase tracking-wider mb-1">Agent-made content</div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">Review before it goes anywhere.</h2>
          <p className="text-text-2">
            Captions, flyers, and blog drafts made by Danielle in{" "}
            <a href="/admin/agent-chat" className="text-accent hover:underline">Talk to Agents</a>
            {" "}— review, correct the copy, and download the images. Nothing here is published until you promote it.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {(["all", "social", "flyer", "blog"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                filter === f
                  ? "bg-text text-bg"
                  : "bg-bg-3 text-text-2 hover:bg-bg-3/80"
              }`}
            >
              {f === "all" ? "All types" : f === "social" ? "Social posts" : f === "flyer" ? "Flyers" : "Blog drafts"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-hairline bg-bg-2">
          <ImageIcon className="w-8 h-8 text-text-3 mx-auto mb-3" />
          <h3 className="text-lg font-semibold">Nothing here yet</h3>
          <p className="text-text-3 mt-1">
            Open{" "}
            <a href="/admin/agent-chat" className="text-accent hover:underline">Talk to Agents</a>
            , pick <strong>Danielle</strong>, and ask it to write a post or make a flyer.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map(item => (
            <StudioItemCard
              key={item.id}
              item={item}
              onUpdate={handleUpdate}
              onPromote={handlePromote}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
