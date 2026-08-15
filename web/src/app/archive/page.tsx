import type { Metadata } from "next";
import { ArchiveRegistry } from "@/components/archive-registry";

export const metadata: Metadata = {
  title: "Technical Archive",
  description: "Practical guides on custom software, automation, and web/mobile development for businesses in Accra and beyond.",
};

export default function ArchivePage() {
  return <ArchiveRegistry />;
}
