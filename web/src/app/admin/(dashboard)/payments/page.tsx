import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminList } from "@/lib/api";
import PaymentsClient, { Payment, PaymentLink, Subscription } from "./PaymentsClient";

export const metadata: Metadata = {
  title: "Payments — Admin",
};

export default async function PaymentsPage() {
  const cookieHeader = (await cookies()).toString();

  const [payments, links, subscriptions] = await Promise.all([
    ssrAdminList<Payment>("/api/v1/admin/payments", cookieHeader),
    ssrAdminList<PaymentLink>("/api/v1/admin/payment-links", cookieHeader),
    ssrAdminList<Subscription>("/api/v1/admin/subscriptions", cookieHeader),
  ]);

  return (
    <PaymentsClient
      initialPayments={payments}
      initialLinks={links}
      initialSubscriptions={subscriptions}
    />
  );
}
