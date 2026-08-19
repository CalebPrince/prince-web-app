"use client";

import { useState } from "react";
import { api, Inquiry } from "@/lib/api";
import { Search, MoreHorizontal, CheckCircle, Archive, Trash2, Mail } from "lucide-react";
import Link from "next/link";

export default function InquiriesClient({ initialInquiries }: { initialInquiries: Inquiry[] }) {
  const [inquiries, setInquiries] = useState<Inquiry[]>(initialInquiries);
  const [filter, setFilter] = useState<"all" | "read" | "unread" | "archived">("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fetchFiltered = async (status: string) => {
    setIsLoading(true);
    try {
      const query = status === "all" ? undefined : { status };
      const data = await api.adminInquiries(query);
      setInquiries(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (newFilter: typeof filter) => {
    setFilter(newFilter);
    fetchFiltered(newFilter);
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      await api.adminUpdateInquiry(id, { status });
      // Optimistically update
      setInquiries((prev) => 
        prev.map((i) => (i.id === id ? { ...i, status: status as any } : i))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const deleteInquiry = async (id: number) => {
    if (!confirm("Are you sure you want to delete this inquiry?")) return;
    try {
      await api.adminDeleteInquiry(id);
      setInquiries((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const filteredInquiries = inquiries.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.email.toLowerCase().includes(search.toLowerCase()) ||
      i.message.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">Inquiries</h2>
          <p className="text-text-2">Read, triage, and keep every conversation moving.</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/v1/admin/inquiries/export"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 border border-hairline bg-transparent shadow-sm hover:bg-bg-3 hover:text-accent h-9 px-4 py-2"
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-text-3" />
          <input
            type="search"
            placeholder="Search messages..."
            className="flex h-9 w-full rounded-md border border-hairline bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex p-1 bg-bg-2 rounded-lg border border-hairline overflow-x-auto w-full sm:w-auto">
          {["all", "unread", "read", "archived"].map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab as any)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize whitespace-nowrap transition-colors ${
                filter === tab
                  ? "bg-bg text-accent shadow-sm border border-hairline/50"
                  : "text-text-2 hover:text-text hover:bg-bg-3/50"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-hairline bg-bg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-bg-2 text-text-2 text-xs uppercase border-b border-hairline">
              <tr>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Contact</th>
                <th className="px-6 py-3 font-medium">Message</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-3">
                    Loading inquiries...
                  </td>
                </tr>
              ) : filteredInquiries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-3">
                    No inquiries found.
                  </td>
                </tr>
              ) : (
                filteredInquiries.map((inquiry) => (
                  <tr
                    key={inquiry.id}
                    className={`hover:bg-bg-2/50 transition-colors ${
                      inquiry.status === "unread" ? "bg-bg-2/30" : ""
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          inquiry.status === "unread"
                            ? "bg-accent/10 text-accent"
                            : inquiry.status === "archived"
                            ? "bg-text-3/10 text-text-3"
                            : "bg-green-500/10 text-green-500"
                        }`}
                      >
                        {inquiry.status.charAt(0).toUpperCase() + inquiry.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-text">{inquiry.name}</div>
                      <div className="text-text-3 flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3" />
                        {inquiry.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-md">
                        <p className="text-text-2 line-clamp-2" title={inquiry.message}>
                          {inquiry.message}
                        </p>
                        {inquiry.type !== "contact" && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded bg-bg-3 text-xs text-text-2 border border-hairline">
                            {inquiry.type}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-text-3">
                      {new Date(inquiry.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {inquiry.status === "unread" && (
                          <button
                            onClick={() => updateStatus(inquiry.id, "read")}
                            className="p-1.5 text-text-3 hover:text-accent rounded hover:bg-bg-3 transition-colors"
                            title="Mark as Read"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        {inquiry.status !== "archived" && (
                          <button
                            onClick={() => updateStatus(inquiry.id, "archived")}
                            className="p-1.5 text-text-3 hover:text-text rounded hover:bg-bg-3 transition-colors"
                            title="Archive"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteInquiry(inquiry.id)}
                          className="p-1.5 text-text-3 hover:text-red-500 rounded hover:bg-bg-3 transition-colors"
                          title="Delete"
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
    </div>
  );
}
