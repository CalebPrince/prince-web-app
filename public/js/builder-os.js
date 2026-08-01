(function () {
  const grid = document.getElementById("os-agent-grid");
  if (!grid) return;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

  let configuredAgents = [];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function render(agents) {
    configuredAgents = agents;
    document.getElementById("os-agent-count").textContent = `${agents.length} configured specialists connected`;
    grid.innerHTML = agents.map((agent, index) => `
      <a class="os-agent-node" href="/agent.html?agent=${encodeURIComponent(agent.key)}" data-agent="${esc(agent.key)}" style="--node-index:${index}" aria-label="Inspect ${esc(agent.name)}">
        <header><span>${esc(agent.key).toUpperCase()}</span><i data-state="${esc(agent.status)}"></i></header>
        <h3>${esc(agent.name)}</h3>
        <p>${esc(agent.role)}</p>
        <div>${(agent.capabilities || []).map(item => `<small>${esc(item)}</small>`).join("")}</div>
        <footer><span>STATUS: ${esc(agent.status).toUpperCase()}</span><b>INSPECT →</b></footer>
      </a>`).join("");
    observeTopology();
  }

  function observeTopology() {
    const topology = document.getElementById("os-topology");
    if (!topology) return;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      topology.classList.add("is-activated");
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      topology.classList.add("is-activated");
      observer.disconnect();
    }, { threshold: 0.35 });
    observer.observe(topology);
    // Keep the registry readable if a short viewport never reaches the
    // animation threshold or the observer callback is delayed.
    window.setTimeout(() => topology.classList.add("is-activated"), 900);
  }

  api.get("/api/v1/builder-os/team").then(data => render(data.agents || [])).catch(() => {
    grid.innerHTML = '<div class="os-loading">The public registry is reconnecting. The customer-service channels remain available.</div>';
    document.getElementById("os-agent-count").textContent = "Registry reconnecting";
    document.getElementById("os-topology")?.classList.add("is-activated");
  });

  const scenarios = {
    clinic: {
      request: "I need to book an appointment, but the clinic is closed.",
      steps: [
        ["lisa", "Incoming call answered", "The request is identified as an after-hours booking."],
        ["lisa", "Appointment details captured", "Name, contact details, preferred date, and reason are confirmed."],
        ["system", "Availability checked", "Open calendar times are returned without exposing private calendar data."],
        ["lisa", "Confirmation sent", "The customer receives the agreed booking details."],
        ["chief", "Owner checkpoint recorded", "The completed booking is visible in the private command centre."]
      ]
    },
    lead: {
      request: "We need an AI assistant for customer calls and follow-up.",
      steps: [
        ["lisa", "Enquiry qualified", "Business need, channels, and preferred outcome are captured."],
        ["dossier", "Research context prepared", "Public business context is structured for a relevant response."],
        ["proposal", "System scope assembled", "The proposed workflow, delivery stages, and commercial milestones are prepared."],
        ["nurturer", "Follow-up sequence ready", "The reply path is tracked so the conversation can continue."],
        ["chief", "Decision point flagged", "Prince Caleb receives the private review checkpoint."]
      ]
    },
    document: {
      request: "This invoice looks wrong. Can someone review it before I send it?",
      steps: [
        ["ada", "Document inspected", "Missing, inconsistent, and unclear invoice fields are identified."],
        ["ada", "Corrections proposed", "A controlled list of changes is prepared for review."],
        ["system", "Human approval required", "Nothing is sent or changed without confirmation."],
        ["chief", "Review checkpoint surfaced", "The owner sees the outstanding decision in the private command centre."]
      ]
    }
  };
  let selectedScenario = "clinic";
  let running = false;
  const wait = ms => new Promise(resolve => window.setTimeout(resolve, reduceMotion ? 20 : ms));
  const agentName = key => configuredAgents.find(agent => agent.key === key)?.name || (key === "system" ? "Builder OS" : key);

  document.querySelectorAll(".os-scenario-tabs button").forEach(button => button.addEventListener("click", () => {
    if (running) return;
    selectedScenario = button.dataset.scenario;
    document.querySelectorAll(".os-scenario-tabs button").forEach(node => node.classList.toggle("active", node === button));
    document.getElementById("os-scenario-request").textContent = `“${scenarios[selectedScenario].request}”`;
    document.getElementById("os-execution-log").innerHTML = '<li class="is-muted">Scenario loaded. Run the workflow when ready.</li>';
  }));

  document.getElementById("os-run-simulation")?.addEventListener("click", async event => {
    if (running) return;
    running = true;
    const button = event.currentTarget;
    const scenario = scenarios[selectedScenario];
    const log = document.getElementById("os-execution-log");
    const state = document.getElementById("os-simulator-state");
    const runId = `RUN-${Date.now().toString().slice(-6)}`;
    button.disabled = true;
    button.textContent = "Workflow running…";
    state.classList.add("is-running");
    state.innerHTML = "<i></i> EXECUTING";
    document.getElementById("os-run-id").textContent = runId;
    log.innerHTML = "";
    document.querySelectorAll(".os-agent-node").forEach(node => node.classList.remove("is-processing", "is-complete"));

    for (const [key, title, detail] of scenario.steps) {
      document.querySelectorAll(".os-agent-node").forEach(node => node.classList.remove("is-processing"));
      const node = document.querySelector(`.os-agent-node[data-agent="${key}"]`);
      node?.classList.add("is-processing");
      const item = document.createElement("li");
      item.innerHTML = `<span>${String(log.children.length + 1).padStart(2, "0")}</span><div><strong>${esc(agentName(key))} · ${esc(title)}</strong><small>${esc(detail)}</small></div>`;
      log.appendChild(item);
      await wait(850);
      item.classList.add("is-complete");
      node?.classList.remove("is-processing");
      node?.classList.add("is-complete");
    }

    state.classList.remove("is-running");
    state.classList.add("is-complete");
    state.innerHTML = "<i></i> COMPLETE";
    button.disabled = false;
    button.textContent = "Run again";
    running = false;
  });
})();
