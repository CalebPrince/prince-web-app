import { Metadata } from "next";
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import InquiriesClient from "./InquiriesClient";

export const metadata: Metadata = {
  title: "Inquiries — Admin",
};

export default async function InquiriesPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  
  // We can fetch initial inquiries for the "All" tab SSR
  const initialInquiries = await api.adminInquiries(undefined, cookieHeader).catch(() => []);

  return (
    <div className="space-y-8">
      <InquiriesClient initialInquiries={initialInquiries} />
    </div>
  );
}
