import type { Metadata } from "next";
import { Suspense } from "react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { AgentProfile } from "./agent-profile";

export const metadata: Metadata = {
  title: "Agent inspection, Builder OS",
  description:
    "Inspect a configured Builder OS agent, its responsibilities, connected surfaces, and operating workflow.",
};

function Loading() {
  return (
    <section className="mx-auto max-w-[1400px] px-6 pt-36 pb-24 md:px-10 md:pt-48">
      <Reveal>
        <SectionLabel>Builder OS</SectionLabel>
        <h1 className="mt-8 text-[clamp(2rem,5vw,3.4rem)] font-bold tracking-[-0.03em]">
          Opening agent dossier…
        </h1>
      </Reveal>
    </section>
  );
}

export default function AgentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <AgentProfile />
    </Suspense>
  );
}
