import { Metadata } from "next";
import { cookies } from "next/headers";
import { adminApi, ssrAdminGet } from "@/lib/api";
import SettingsClient, { EmailTemplateDefaults } from "./SettingsClient";

export const metadata: Metadata = {
  title: "Settings — Admin",
};

export default async function SettingsPage() {
  const cookieHeader = (await cookies()).toString();

  // The settings read is NOT wrapped in ssrAdminGet's swallow-and-return-{}
  // helper, unlike the two below it. Every group's Save posts that group's
  // keys with whatever is in the form, and Settings::set() DELETEs on an
  // empty value — so rendering blanks after a failed read puts the SMTP
  // credentials, API keys and webhook secrets one click from being erased.
  // A failed read has to be visible and has to block saving.
  let settings: Record<string, string> = {};
  let loadFailed = false;
  try {
    settings = await adminApi.get<Record<string, string>>(
      "/api/v1/admin/settings",
      cookieHeader
    );
  } catch {
    loadFailed = true;
  }

  // These two are display-only, so one failing still degrades gracefully.
  const [account, templateDefaults] = await Promise.all([
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
      loadFailed={loadFailed}
    />
  );
}
