import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arch, AI Website Builder",
  description: "Chat with Arch, an AI agent that gathers your requirements and builds a complete, deployable website for you in minutes.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
