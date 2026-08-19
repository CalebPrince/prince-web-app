import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminList } from "@/lib/api";
import SageChatsClient, { SageChat } from "./SageChatsClient";

export const metadata: Metadata = {
  title: "Sage Chats — Admin",
};

export default async function SageChatsPage() {
  const cookieHeader = (await cookies()).toString();
  const initialChats = await ssrAdminList<SageChat>("/api/v1/admin/sage-chats", cookieHeader);

  return <SageChatsClient initialChats={initialChats} />;
}
