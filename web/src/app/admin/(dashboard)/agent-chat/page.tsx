import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import AgentChatClient from "./AgentChatClient";

export const metadata: Metadata = {
  title: "Talk to Agents — Admin",
};

export default async function AgentChatPage() {
  const cookieHeader = (await cookies()).toString();
  // Agent display names are configurable in Site Content, so the tab labels
  // come from settings rather than being hardcoded here.
  const settings = await ssrAdminGet<Record<string, string>>(
    "/api/v1/admin/settings",
    cookieHeader,
    {}
  );

  return <AgentChatClient settings={settings} />;
}
