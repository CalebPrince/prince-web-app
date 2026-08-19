import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lisa, AI Assistant",
  description:
    "Lisa answers calls, WhatsApp, and web chat, works inside the tools your team already uses, and brings a person in when judgment is required.",
};

export default function LisaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
