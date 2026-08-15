import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BuilderOsWorkspace } from "./builder-os-workspace";
import "./builder-os.css";

export const metadata: Metadata = {
  title: "Builder OS",
  description: "Explore the connected AI agents, automations, and operational systems behind Prince Caleb's Builder OS.",
};

export default function BuilderOsPage() {
  return (
    <div className="builder-os-page">
      <header className="os-map-hero">
        <div className="os-map-container mx-auto max-w-6xl px-4 sm:px-6">
          <p className="os-command">builder@princecaleb:~$ inspect network</p>
          <div className="os-hero-grid">
            <div>
              <p className="eyebrow">// Connected intelligence</p>
              <h1>
                One <span className="accent-word">operating system</span>.<br />
                Specialists at every handoff.
              </h1>
              <p>
                Builder OS connects customer conversations, research, follow-up, documents, proposals, websites, and
                private reporting into one working environment.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="brand" size="pill" nativeButton={false} render={<a href="#system-map" />}>
                  Inspect the network
                </Button>
                <Button variant="brand-outline" size="pill" nativeButton={false} render={<Link href="/projects" />}>
                  View deployed systems
                </Button>
              </div>
            </div>
            <aside className="os-health">
              <span>NETWORK HEALTH</span>
              <strong>
                <i /> ONLINE
              </strong>
              <small>Connecting to configured agents…</small>
            </aside>
          </div>
          <div className="os-live-rail" aria-label="Builder OS capabilities">
            <div>
              <span>01 / CONVERSATIONS</span>
              <strong>Voice · Chat · WhatsApp</strong>
              <small>Customer requests enter through one connected front door.</small>
            </div>
            <div>
              <span>02 / EXECUTION</span>
              <strong>Research · Booking · Follow-up</strong>
              <small>Specialists act with shared context instead of isolated prompts.</small>
            </div>
            <div>
              <span>03 / CONTROL</span>
              <strong>Human checkpoints</strong>
              <small>Private decisions remain visible to Prince Caleb.</small>
            </div>
          </div>
        </div>
      </header>

      <BuilderOsWorkspace />

      <section className="agency-cta text-center">
        <div className="os-map-container mx-auto max-w-2xl px-4 sm:px-6">
          <p className="eyebrow">// Your workflow next</p>
          <h2 className="mb-3 text-3xl font-bold md:text-4xl">What should your business stop doing manually?</h2>
          <p className="text-muted-custom mb-6 text-lg">
            Start with one customer journey or operational bottleneck. Build the smallest system that proves the
            result.
          </p>
          <Button variant="brand" size="pill" nativeButton={false} render={<Link href="/contact" />}>
            Map my workflow
          </Button>
        </div>
      </section>
    </div>
  );
}
