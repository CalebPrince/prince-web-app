import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import SettingsClient, { EmailTemplateDefaults } from "./SettingsClient";

export const metadata: Metadata = {
  title: "Settings — Admin",
};

export default async function SettingsPage() {
  const cookieHeader = (await cookies()).toString();

  const [settings, account, templateDefaults] = await Promise.all([
    ssrAdminGet<Record<string, string>>("/api/v1/admin/settings", cookieHeader, {}),
    ssrAdminGet<{ email?: string; twofa_enabled?: boolean }>(
      "/api/v1/admin/account",
      cookieHeader,
      {}
    ),
    ssrAdminGet<EmailTemplateDefaults>(
      "/api/v1/admin/email-template-defaults",
      cookieHeader,
      {}
    ),
  ]);

  return (
    <SettingsClient
      initialSettings={settings}
      account={account}
      templateDefaults={templateDefaults}
    />
  );
}
