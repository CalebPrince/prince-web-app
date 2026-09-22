import { notFound } from "next/navigation";
import CodeAgentSectionClient from "./CodeAgentSectionClient";

const sections = new Set(["home", "models", "tools", "deploy", "settings"]);

export default async function CodeAgentSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <CodeAgentSectionClient section={section} />;
}
