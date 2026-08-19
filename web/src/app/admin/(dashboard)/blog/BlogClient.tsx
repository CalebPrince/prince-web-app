"use client";

import { useState } from "react";
import { api, AdminBlogPost } from "@/lib/api";
import { Plus, Edit, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import BlogModal from "./BlogModal";

export default function BlogClient({ initialPosts }: { initialPosts: AdminBlogPost[] }) {
  const [posts, setPosts] = useState<AdminBlogPost[]>(initialPosts);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<AdminBlogPost | null>(null);

  const deletePost = async (id: number) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      await api.adminDeleteBlogPost(id);
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSavePost = async (data: Partial<AdminBlogPost>) => {
    if (editingPost) {
      await api.adminUpdateBlogPost(editingPost.id, data);
    } else {
      await api.adminCreateBlogPost(data);
    }
    // Refresh to get new data
    window.location.reload();
  };

  const openNewModal = () => {
    setEditingPost(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: AdminBlogPost) => {
    setEditingPost(p);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <div className="text-sm font-medium text-text-3 uppercase tracking-wider mb-1">Content</div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">Articles that do the selling for you.</h2>
          <p className="text-text-2">Articles shown on the public blog and homepage preview.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={openNewModal}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 bg-text text-bg hover:bg-text/90 shadow-sm h-9 px-4 py-2 gap-2"
          >
            <Plus className="w-4 h-4" />
            New Post
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-hairline bg-bg overflow-hidden">
        <div className="p-4 border-b border-hairline bg-bg-2">
          <h2 className="font-semibold mb-0">All posts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-bg-2/50 text-text-2 text-xs uppercase border-b border-hairline">
              <tr>
                <th className="px-6 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Published</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {posts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-3">
                    No posts found.
                  </td>
                </tr>
              ) : (
                posts.map((post) => (
                  <tr
                    key={post.id}
                    className="hover:bg-bg-2/50 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-text">
                      {post.title}
                    </td>
                    <td className="px-4 py-4 text-text-2 capitalize">
                      {post.category || "—"}
                    </td>
                    <td className="px-4 py-4 text-text-2">
                      {post.published_at ? new Date(post.published_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${
                        post.is_published ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'
                      }`}>
                        {post.is_published ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {post.is_published && (
                          <Link
                            href={`/blog/${post.slug}`}
                            target="_blank"
                            className="p-1.5 text-text-3 hover:text-text rounded hover:bg-bg-3 transition-colors"
                            title="View Public Page"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        )}
                        <button
                          onClick={() => openEditModal(post)}
                          className="p-1.5 text-text-3 hover:text-accent rounded hover:bg-bg-3 transition-colors"
                          title="Edit Post"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deletePost(post.id)}
                          className="p-1.5 text-text-3 hover:text-red-500 rounded hover:bg-bg-3 transition-colors"
                          title="Delete Post"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BlogModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        post={editingPost}
        onSave={handleSavePost}
      />
    </div>
  );
}
