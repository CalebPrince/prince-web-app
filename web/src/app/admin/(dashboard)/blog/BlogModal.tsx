import { useState, useEffect } from "react";
import { AdminBlogPost } from "@/lib/api";
import { X } from "lucide-react";

export default function BlogModal({
  isOpen,
  onClose,
  post,
  onSave
}: {
  isOpen: boolean;
  onClose: () => void;
  post: AdminBlogPost | null;
  onSave: (data: Partial<AdminBlogPost>) => Promise<void>;
}) {
  const [formData, setFormData] = useState<Partial<AdminBlogPost>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData(post || {
        title: "",
        slug: "",
        category: "",
        excerpt: "",
        body: "",
        cover_image_path: "",
        is_published: false
      });
    }
  }, [isOpen, post]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to save post.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-bg w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col border border-hairline">
        <div className="flex items-center justify-between p-4 border-b border-hairline">
          <h2 className="text-lg font-semibold">{post ? "Edit Post" : "New Post"}</h2>
          <button onClick={onClose} className="p-1 text-text-3 hover:text-text rounded-md hover:bg-bg-3 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <form id="post-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Title</label>
                <input required name="title" value={formData.title || ""} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" placeholder="Post title" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <input name="category" value={formData.category || ""} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" placeholder="e.g. Updates, Guides" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Slug</label>
              <input name="slug" value={formData.slug || ""} onChange={handleChange} placeholder="Auto-generated if left empty" className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Excerpt</label>
              <textarea required name="excerpt" value={formData.excerpt || ""} onChange={handleChange} rows={2} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" placeholder="Short summary shown on cards and search" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Body</label>
              <textarea required name="body" value={formData.body || ""} onChange={handleChange} rows={10} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent font-mono" placeholder="Write the full post content here using Markdown or HTML..." />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Cover Image Path</label>
              <div className="flex items-center gap-4">
                {formData.cover_image_path && (
                  <img src={formData.cover_image_path} alt="Preview" className="w-16 h-16 object-cover rounded-md border border-hairline" />
                )}
                <input required name="cover_image_path" value={formData.cover_image_path || ""} onChange={handleChange} className="flex-1 bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" placeholder="/uploads/image.jpg" />
              </div>
            </div>

            <div className="pt-4 border-t border-hairline flex items-center gap-2">
              <input type="checkbox" id="is_published" name="is_published" checked={formData.is_published || false} onChange={handleChange} className="w-4 h-4 accent-accent rounded" />
              <label htmlFor="is_published" className="text-sm font-medium cursor-pointer">Published to live site</label>
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-hairline flex justify-end gap-3 bg-bg-2 rounded-b-xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-text hover:bg-bg-3 rounded-md transition-colors border border-transparent hover:border-hairline">
            Cancel
          </button>
          <button type="submit" form="post-form" disabled={isSubmitting} className="px-4 py-2 text-sm font-medium bg-text text-bg hover:bg-text/90 rounded-md transition-colors disabled:opacity-50">
            {isSubmitting ? "Saving..." : "Save Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
