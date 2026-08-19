import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminList } from "@/lib/api";
import InvoicesClient, { Invoice } from "./InvoicesClient";

export const metadata: Metadata = {
  title: "Invoices — Admin",
};

export default async function InvoicesPage() {
  const cookieHeader = (await cookies()).toString();
  const initialInvoices = await ssrAdminList<Invoice>("/api/v1/admin/invoices", cookieHeader);

  return <InvoicesClient initialInvoices={initialInvoices} />;
}
