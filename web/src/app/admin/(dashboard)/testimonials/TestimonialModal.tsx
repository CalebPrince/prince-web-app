import { useState } from "react";

import { X } from "lucide-react";

export default function TestimonialModal({
  isOpen,
  onClose,
  onRequest
}: {
  isOpen: boolean;
  onClose: () => void;
  onRequest: (data: { client_name: string; client_email: string; project_reference?: string }) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    project_reference: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onRequest(formData);
      setFormData({ client_name: "", client_email: "", project_reference: "" });
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to send request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-bg w-full max-w-md rounded-xl shadow-2xl flex flex-col border border-hairline">
        <div className="flex items-center justify-between p-4 border-b border-hairline">
          <h2 className="text-lg font-semibold">Request a testimonial</h2>
          <button onClick={onClose} className="p-1 text-text-3 hover:text-text rounded-md hover:bg-bg-3 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <form id="request-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Client name</label>
              <input required name="client_name" value={formData.client_name} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" placeholder="Client full name" maxLength={255} />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">Client email</label>
              <input required type="email" name="client_email" value={formData.client_email} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" placeholder="client@example.com" maxLength={255} />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">
                Project <span className="text-text-3 font-normal">(optional, shown in the email)</span>
              </label>
              <input name="project_reference" value={formData.project_reference} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" placeholder="e.g. the booking site" maxLength={255} />
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-hairline flex justify-end gap-3 bg-bg-2 rounded-b-xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-text hover:bg-bg-3 rounded-md transition-colors border border-transparent hover:border-hairline">
            Cancel
          </button>
          <button type="submit" form="request-form" disabled={isSubmitting} className="px-4 py-2 text-sm font-medium bg-text text-bg hover:bg-text/90 rounded-md transition-colors disabled:opacity-50">
            {isSubmitting ? "Sending..." : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}
