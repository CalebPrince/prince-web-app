(function () {
  const root = document.getElementById("agent-profile-root");
  if (!root) return;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

  const profiles = {
    lisa: {
      mandate: "Keep customer conversations moving across voice, WhatsApp, and the website, then turn confirmed intent into bookings, follow-ups, or a human handoff.",
      surfaces: [["Voice line", "Answers inbound calls and places individually approved outbound calls."], ["WhatsApp", "Handles enquiries and continues qualified conversations."], ["Bookings", "Captures contact details, checks availability, and confirms agreed times."], ["Handoffs", "Alerts the owner when judgment or direct attention is required."]],
      path: [["Signal", "A customer calls, messages, or opens live chat."], ["Understand", "Lisa identifies the request and captures the missing details."], ["Act", "She answers, books, follows up, or routes the next safe action."], ["Handoff", "The customer and owner receive the relevant confirmation or alert."]]
    },
    beacon: {
      mandate: "Continuously identify public opportunities that match the studio’s services and turn scattered market signals into a lead queue worth reviewing.",
      surfaces: [["Discovery", "Searches configured niches and locations for relevant businesses."], ["Qualification", "Filters weak or irrelevant results before they enter the pipeline."], ["Lead sourcing", "Captures public contact routes and business context."], ["Monitoring", "Keeps the discovery target and run status visible to operations."]],
      path: [["Search", "Configured niche and location queries run."], ["Inspect", "Public results are checked for relevance and opportunity."], ["Structure", "Qualified businesses become actionable lead records."], ["Route", "Research, outreach, or owner review receives the next task."]]
    },
    dossier: {
      mandate: "Prepare grounded business intelligence before outreach so the first conversation reflects the prospect’s actual context.",
      surfaces: [["Research", "Collects relevant public company information."], ["Intelligence", "Separates useful signals from generic background."], ["Lead briefs", "Creates a concise account dossier for outreach."], ["Context", "Supplies other agents with a better starting point."]],
      path: [["Request", "A lead is selected for deeper research."], ["Gather", "Public business and market signals are collected."], ["Synthesize", "The relevant opportunity and constraints are summarized."], ["Deliver", "The brief becomes context for a pitch, call, or proposal."]]
    },
    nurturer: {
      mandate: "Own the follow-up trail after outreach so replies, timing, and next actions do not disappear between conversations.",
      surfaces: [["Sequences", "Runs configured email follow-up steps."], ["Reply tracking", "Checks the reply mailbox for lead responses."], ["Continuation", "Prepares the next relevant response when automation permits."], ["Escalation", "Stops or routes conversations that need human review."]],
      path: [["Enroll", "A qualified contact enters an enabled sequence."], ["Wait", "The configured timing and stop conditions are observed."], ["Interpret", "Replies are classified before another message is considered."], ["Continue", "The sequence advances, pauses, stops, or alerts the owner."]]
    },
    proposal: {
      mandate: "Translate a qualified request into a structured commercial path with scope, delivery stages, and payment milestones.",
      surfaces: [["Scope", "Organizes the requested outcome and boundaries."], ["Proposal", "Drafts a reviewable commercial document."], ["Milestones", "Structures delivery and payment checkpoints."], ["Approval", "Keeps final commercial judgment with the owner."]],
      path: [["Input", "A qualified request or booking supplies the context."], ["Structure", "Outcome, scope, assumptions, and stages are organized."], ["Draft", "A proposal is prepared for review."], ["Approve", "The owner edits, sends, or returns it for revision."]]
    },
    arch: {
      mandate: "Turn approved business context into tailored website concepts and deployable digital experiences instead of generic templates.",
      surfaces: [["Websites", "Builds pages around the client’s real offer and audience."], ["CMS", "Creates maintainable content structures."], ["Mockups", "Produces personalized visual directions for review."], ["Deployment", "Prepares controlled releases and live system surfaces."]],
      path: [["Brief", "Business context and the desired outcome are assembled."], ["Compose", "Information architecture and visual direction are created."], ["Build", "Responsive interfaces and content systems are implemented."], ["Release", "The approved system is deployed and monitored."]]
    },
    ada: {
      mandate: "Review business documents for missing, inconsistent, or risky details while keeping every consequential correction under human control.",
      surfaces: [["Invoices", "Checks commercial fields and calculation consistency."], ["Statements", "Surfaces anomalies and unclear entries."], ["Document checks", "Creates a controlled review list."], ["Approval", "Never changes or sends sensitive records without confirmation."]],
      path: [["Receive", "A document is submitted for a bounded review."], ["Inspect", "Fields, totals, and internal consistency are checked."], ["Flag", "Unclear or conflicting items become review points."], ["Confirm", "A human approves any correction or downstream action."]]
    },
    chief: {
      mandate: "Maintain private operational awareness across the agent team and command centre, then surface only the decisions that need the owner.",
      surfaces: [["Reporting", "Summarizes real activity over the selected period."], ["Monitoring", "Watches operational signals and exceptions."], ["Owner alerts", "Sends private decision and handoff notifications."], ["Finance awareness", "Explains cost, revenue, and operating trends privately."]],
      path: [["Observe", "Operational records and agent activity are read."], ["Compare", "Results, exceptions, and changes are evaluated."], ["Explain", "Numbers and activity become a concise owner brief."], ["Alert", "Only meaningful decisions and risks are escalated."]]
    },
    scout: {
      mandate: "Track emerging web, mobile, and AI tools and frameworks, and turn them into concrete, buildable project ideas grounded in real, live research rather than guesses.",
      surfaces: [["Tech scouting", "Checks what is actually new via live web search."], ["Ideation", "Sketches concrete, buildable project concepts on new tooling."], ["Grounding", "Anchors ideas in the studio's real stack and past work."], ["Sparring", "Works through possibilities live with the owner."]],
      path: [["Prompt", "A question or a spark of curiosity starts the conversation."], ["Check", "A live web search verifies what is current before anything is claimed."], ["Connect", "The finding is matched against real services and past projects."], ["Propose", "A concrete, buildable idea comes back for the owner to weigh."]]
    },
    reel: {
      mandate: "Plan a video before it gets built, concept, scene breakdown, narration script, pacing, and visual style, for videos produced with the studio's HyperFrames pipeline.",
      surfaces: [["Video concepts", "Works through what a video should say and show."], ["Scene breakdowns", "Structures a concrete scene-by-scene plan with rough timings."], ["Narration scripts", "Drafts spoken lines that fit the visual pacing."], ["Visual style", "Anchors choices in the studio's real brand colors and fonts."]],
      path: [["Brief", "A video idea or need starts the conversation."], ["Structure", "The video is broken into scenes with a clear arc and pacing."], ["Script", "Narration lines are drafted to match the visual beats."], ["Hand off", "The confirmed plan goes to Claude Code to actually build and render."]]
    }
  };

  function render(agent) {
    const profile = profiles[agent.key] || {
      mandate: agent.role,
      surfaces: (agent.capabilities || []).map(item => [item, `Supports ${item.toLowerCase()} within Builder OS.`]),
      path: [["Signal", "A configured workflow creates a task."], ["Process", "The agent handles its bounded responsibility."], ["Record", "The result becomes visible to the operating system."], ["Handoff", "The next agent or owner receives the required context."]]
    };
    document.title = `${agent.name}, Builder OS agent`;
    root.innerHTML = `
      <header class="agent-profile-hero"><div class="container">
        <p class="agent-profile-command">builder@princecaleb:~$ inspect agent/${esc(agent.key)}</p>
        <div class="agent-profile-heading">
          <div><span class="agent-profile-kicker">${esc(agent.key)} / configured specialist</span><h1>${esc(agent.name)}</h1><p>${esc(agent.role)}</p></div>
          <aside class="agent-profile-status"><div><span>OPERATING STATUS</span><strong><i></i>${esc(agent.status)}</strong></div><div><span>SYSTEM</span><strong>Builder OS</strong></div><div><span>ACCESS</span><strong>Bounded / monitored</strong></div></aside>
        </div>
      </div></header>
      <div class="agent-profile-body"><div class="container">
        <section class="agent-profile-section"><header><span>01 / MANDATE</span><h2>What ${esc(agent.name)} is responsible for.</h2></header><div class="agent-profile-copy">${esc(profile.mandate)}</div></section>
        <section class="agent-profile-section"><header><span>02 / OPERATING SURFACES</span><h2>Where the work becomes visible.</h2></header><div class="agent-capability-grid">${profile.surfaces.map((item, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><strong>${esc(item[0])}</strong><p>${esc(item[1])}</p></article>`).join("")}</div></section>
        <section class="agent-profile-section"><header><span>03 / SIGNAL PATH</span><h2>How one task moves through the system.</h2></header><ol class="agent-signal-path">${profile.path.map((item, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${esc(item[0])}</strong><small>${esc(item[1])}</small></div></li>`).join("")}</ol></section>
        <div class="agent-profile-cta"><div><span class="agent-profile-kicker">DEPLOYMENT PATH</span><h2>Build a system with this responsibility.</h2></div><div class="d-flex flex-wrap gap-3"><a href="/builder-os" class="btn-brand-outline">Back to network</a><a href="/contact?agent=${encodeURIComponent(agent.key)}" class="btn-brand">Map this workflow →</a></div></div>
      </div></div>`;
  }

  const key = new URLSearchParams(location.search).get("agent") || "lisa";
  api.get("/api/v1/builder-os/team").then(data => {
    const agent = (data.agents || []).find(item => item.key === key);
    if (!agent) throw new Error("Unknown agent");
    render(agent);
  }).catch(() => {
    root.innerHTML = '<div class="agent-profile-error"><p class="eyebrow">// Registry unavailable</p><h1>That agent dossier could not be opened.</h1><p class="text-muted-custom">Return to the system map and choose a configured specialist.</p><a href="/builder-os" class="btn-brand">Return to Builder OS</a></div>';
  });
})();
