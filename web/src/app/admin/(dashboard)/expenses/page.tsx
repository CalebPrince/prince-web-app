import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import ExpensesClient, { ExternalExpenses, ExchangeRate } from "./ExpensesClient";

export const metadata: Metadata = {
  title: "Expenses — Admin",
};

export default async function ExpensesPage() {
  const cookieHeader = (await cookies()).toString();

  const [dashboard, fx] = await Promise.all([
    ssrAdminGet<{ external_expenses?: ExternalExpenses }>(
      "/api/v1/admin/dashboard",
      cookieHeader,
      {}
    ),
    // Conversion is a convenience; the page still works at a single currency.
    ssrAdminGet<ExchangeRate | null>("/api/v1/admin/exchange-rate", cookieHeader, null),
  ]);

  return <ExpensesClient expenses={dashboard.external_expenses ?? {}} fx={fx} />;
}
