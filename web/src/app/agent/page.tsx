import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentProfile } from "./agent-profile";
import "../builder-os/builder-os.css";
import "./agent-profile.css";

export const metadata: Metadata = {
  title: "Agent inspection, Builder OS",
  description: "Inspect a configured Builder OS agent, its responsibilities, connected surfaces, and operating workflow.",
};

export default function AgentPage() {
  return (
    <div className="builder-os-page agent-profile-page">
      <main className="agent-profile-main">
        <Suspense
          fallback={
            <div className="agent-profile-error">
              <p className="eyebrow">// Builder OS</p>
              <h1 className="h2">Opening agent dossier…</h1>
            </div>
          }
        >
          <AgentProfile />
        </Suspense>
      </main>
    </div>
  );
}
