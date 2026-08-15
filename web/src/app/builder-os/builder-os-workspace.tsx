"use client";

import * as React from "react";
import { api, type BuilderOsAgent } from "@/lib/api";

// Ported from public/js/builder-os.js: live agent registry (topology grid)
// + the interactive workflow simulator. Kept as one component since the
// simulator highlights the SAME .os-agent-node elements the topology grid
// renders, in a physically separate <section> — sharing React state here
// is simpler than the original's page-wide querySelector reach-across.

type ScenarioKey = "clinic" | "lead" | "document";
type ScenarioStep = [key: string, title: string, detail: string];

const SCENARIOS: Record<ScenarioKey, { request: string; steps: ScenarioStep[] }> = {
  clinic: {
    request: "I need to book an appointment, but the clinic is closed.",
    steps: [
      ["lisa", "Incoming call answered", "The request is identified as an after-hours booking."],
      ["lisa", "Appointment details captured", "Name, contact details, preferred date, and reason are confirmed."],
      ["system", "Availability checked", "Open calendar times are returned without exposing private calendar data."],
      ["lisa", "Confirmation sent", "The customer receives the agreed booking details."],
      ["chief", "Owner checkpoint recorded", "The completed booking is visible in the private command centre."],
    ],
  },
  lead: {
    request: "We need an AI assistant for customer calls and follow-up.",
    steps: [
      ["lisa", "Enquiry qualified", "Business need, channels, and preferred outcome are captured."],
      ["dossier", "Research context prepared", "Public business context is structured for a relevant response."],
      ["proposal", "System scope assembled", "The proposed workflow, delivery stages, and commercial milestones are prepared."],
      ["nurturer", "Follow-up sequence ready", "The reply path is tracked so the conversation can continue."],
      ["chief", "Decision point flagged", "Prince Caleb receives the private review checkpoint."],
    ],
  },
  document: {
    request: "This invoice looks wrong. Can someone review it before I send it?",
    steps: [
      ["ada", "Document inspected", "Missing, inconsistent, and unclear invoice fields are identified."],
      ["ada", "Corrections proposed", "A controlled list of changes is prepared for review."],
      ["system", "Human approval required", "Nothing is sent or changed without confirmation."],
      ["chief", "Review checkpoint surfaced", "The owner sees the outstanding decision in the private command centre."],
    ],
  },
};

const SCENARIO_TABS: { key: ScenarioKey; label: string }[] = [
  { key: "clinic", label: "After-hours clinic call" },
  { key: "lead", label: "New business enquiry" },
  { key: "document", label: "Invoice needs review" },
];

type LogEntry = { key: string; title: string; detail: string; complete: boolean };

export function BuilderOsWorkspace() {
  const [agents, setAgents] = React.useState<BuilderOsAgent[] | null>(null);
  const [agentsFailed, setAgentsFailed] = React.useState(false);
  const [activated, setActivated] = React.useState(false);
  const topologyRef = React.useRef<HTMLDivElement>(null);

  const [scenario, setScenario] = React.useState<ScenarioKey>("clinic");
  const [running, setRunning] = React.useState(false);
  const [runId, setRunId] = React.useState("WAITING");
  const [simState, setSimState] = React.useState<"ready" | "running" | "complete">("ready");
  const [log, setLog] = React.useState<LogEntry[]>([]);
  const [processingKey, setProcessingKey] = React.useState<string | null>(null);
  const [completedKeys, setCompletedKeys] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    api
      .builderOsTeam()
      .then((data) => setAgents(data.agents || []))
      .catch(() => setAgentsFailed(true));
  }, []);

  React.useEffect(() => {
    const node = topologyRef.current;
    if (!node) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      setActivated(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setActivated(true);
        observer.disconnect();
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    const fallback = window.setTimeout(() => setActivated(true), 900);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [agents, agentsFailed]);

  function agentName(key: string): string {
    return agents?.find((a) => a.key === key)?.name || (key === "system" ? "Builder OS" : key);
  }

  async function runSimulation() {
    if (running) return;
    setRunning(true);
    const id = `RUN-${Date.now().toString().slice(-6)}`;
    setRunId(id);
    setSimState("running");
    setLog([]);
    setCompletedKeys(new Set());
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, reduceMotion ? 20 : ms));

    for (const [key, title, detail] of SCENARIOS[scenario].steps) {
      setProcessingKey(key);
      setLog((prev) => [...prev, { key, title, detail, complete: false }]);
      await wait(850);
      setLog((prev) => prev.map((entry, i) => (i === prev.length - 1 ? { ...entry, complete: true } : entry)));
      setProcessingKey(null);
      setCompletedKeys((prev) => new Set(prev).add(key));
    }

    setSimState("complete");
    setRunning(false);
  }

  return (
    <>
      <section className="os-map-section" id="system-map">
        <div className="os-map-container mx-auto max-w-6xl px-4 sm:px-6">
          <div className="os-section-head">
            <div>
              <p className="eyebrow">// Live topology</p>
              <h2>The people are AI. The handoffs are real.</h2>
            </div>
            <p>Names and availability are loaded from the same team configuration used by the command centre.</p>
          </div>
          <div ref={topologyRef} className={`os-topology${activated ? " is-activated" : ""}`}>
            <div className="os-core">
              <span>CORE</span>
              <strong>Builder OS</strong>
              <small>Routing · Context · Control</small>
            </div>
            <div className="os-agent-grid">
              {!agents && !agentsFailed && <div className="os-loading">Reading live system registry…</div>}
              {agentsFailed && (
                <div className="os-loading">
                  The public registry is reconnecting. The customer-service channels remain available.
                </div>
              )}
              {agents?.map((agent, index) => (
                <a
                  key={agent.key}
                  className={`os-agent-node${processingKey === agent.key ? " is-processing" : ""}${completedKeys.has(agent.key) ? " is-complete" : ""}`}
                  href={agent.url || `/agent?agent=${encodeURIComponent(agent.key)}`}
                  data-agent={agent.key}
                  style={{ "--node-index": index } as React.CSSProperties}
                  aria-label={`Inspect ${agent.name}`}
                >
                  <header>
                    <span>{agent.key.toUpperCase()}</span>
                    <i data-state={agent.status} />
                  </header>
                  <h3>{agent.name}</h3>
                  <p>{agent.role}</p>
                  <div>
                    {(agent.capabilities || []).map((item) => (
                      <small key={item}>{item}</small>
                    ))}
                  </div>
                  <footer>
                    <span>STATUS: {agent.status.toUpperCase()}</span>
                    <b>INSPECT →</b>
                  </footer>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="os-flow-section">
        <div className="os-map-container mx-auto max-w-6xl px-4 sm:px-6">
          <div className="os-section-head">
            <div>
              <p className="eyebrow">// Example execution</p>
              <h2>One enquiry. A complete operational trail.</h2>
            </div>
          </div>
          <ol className="os-flow">
            <li>
              <span>01</span>
              <div>
                <strong>Conversation starts</strong>
                <p>Lisa answers by voice, web chat, or WhatsApp and captures the request.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Context moves</strong>
                <p>Research, contact details, intent, and next action become structured data.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>The right specialist acts</strong>
                <p>A configured agent handles research, follow-up, proposals, or document work.</p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <strong>The owner stays in control</strong>
                <p>Chief watches the private command centre and flags decisions that need Prince Caleb.</p>
              </div>
            </li>
          </ol>

          <div className="os-simulator">
            <header>
              <div>
                <p className="eyebrow">// Interactive workflow playback</p>
                <h3>Run a request through Builder OS.</h3>
              </div>
              <span className={`os-simulator-state${simState === "running" ? " is-running" : ""}${simState === "complete" ? " is-complete" : ""}`}>
                <i />
                {simState === "running" ? "EXECUTING" : simState === "complete" ? "COMPLETE" : "READY"}
              </span>
            </header>
            <div className="os-scenario-tabs" role="group" aria-label="Choose a workflow scenario">
              {SCENARIO_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={scenario === tab.key ? "active" : ""}
                  disabled={running}
                  onClick={() => {
                    if (running) return;
                    setScenario(tab.key);
                    setLog([]);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="os-simulator-stage">
              <div className="os-request-card">
                <span>INCOMING REQUEST</span>
                <blockquote>&ldquo;{SCENARIOS[scenario].request}&rdquo;</blockquote>
                <button type="button" className="btn-brand" disabled={running} onClick={runSimulation}>
                  {running ? "Workflow running…" : simState === "complete" ? "Run again" : "Run simulation"}
                </button>
              </div>
              <div className="os-execution-console">
                <div className="os-console-bar">
                  <span>builder-os / execution-log</span>
                  <small>{runId}</small>
                </div>
                <ol aria-live="polite">
                  {log.length === 0 && <li className="is-muted">Choose a scenario, then run the workflow.</li>}
                  {log.map((entry, i) => (
                    <li key={i} className={entry.complete ? "is-complete" : ""}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>
                          {agentName(entry.key)} · {entry.title}
                        </strong>
                        <small>{entry.detail}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <footer>
              <span>No client data is used. This simulation demonstrates routing and handoffs only.</span>
              <a href="/contact">Build this workflow →</a>
            </footer>
          </div>
        </div>
      </section>
    </>
  );
}
