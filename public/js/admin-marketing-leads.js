let currentLead = null;
let pitchModal = null;
let discoverModal = null;
let discoverResults = [];
let accountDemoModal = null;
let accountDemoLead = null;
const selectedIds = new Set();
let sendTrendChart = null;
let replyBreakdownChart = null;

if (window.Chart) {
  Chart.defaults.color = "#8b93a7";
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
}

function leadInitials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function readinessState(lead) {
  const steps = [
    true,
    Boolean(lead.research_findings),
    !lead.website_url || Boolean(lead.audit_findings),
    Boolean(lead.pitch_body),
    lead.status === "sent",
  ];
  const complete = steps.filter(Boolean).length;
  const labels = ["Discovered", "Researched", "Checked", "Pitch ready", "Contacted"];
  return {
    steps,
    label: labels[Math.max(0, complete - 1)],
    percent: Math.round((complete / steps.length) * 100),
  };
}

function readinessRail(lead) {
  const readiness = readinessState(lead);
  return `
    <div class="readiness-rail" title="${readiness.percent}% ready">
      ${readiness.steps.map((done, index) => `${index ? `<span class="readiness-line ${readiness.steps[index - 1] && done ? "done" : ""}"></span>` : ""}<span class="readiness-node ${done ? "done" : ""}"></span>`).join("")}
    </div>
    <div class="readiness-label">${readiness.label} · ${readiness.percent}%</div>`;
}

function intentBadge(demo) {
  if (!demo || Number(demo.views || 0) === 0) return "";
  const score = Number(demo.intent_score || 0);
  const level = score >= 70 ? "hot" : score >= 40 ? "warm" : "watching";
  return `<span class="intent-badge intent-${level}" title="Account demo engagement score">${score} intent</span>`;
}

function updateLeadPulse(rows) {
  document.getElementById("lead-total").textContent = rows.length.toLocaleString();
  document.getElementById("lead-priority").textContent = rows.filter(lead => Number(lead.is_high_priority) === 1).length.toLocaleString();
  document.getElementById("lead-ready").textContent = rows.filter(lead => Boolean(lead.pitch_body) && lead.status !== "sent").length.toLocaleString();
  const currencies = [...new Set(rows.filter(lead => Number(lead.estimated_value) > 0).map(lead => lead.currency || "GHS"))];
  const total = rows.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0) / 100;
  document.getElementById("lead-pipeline-value").textContent = currencies.length > 1
    ? "Mixed currencies"
    : `${currencies[0] || "GHS"} ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function applyLeadFilters() {
  const search = document.getElementById("lead-search").value.trim().toLowerCase();
  const stage = document.getElementById("lead-status-filter").value;
  let visible = 0;
  document.querySelectorAll("#leads-tbody tr[data-lead-row]").forEach(row => {
    const matchesSearch = !search || row.dataset.search.includes(search);
    const matchesStage = !stage || (stage === "priority" ? row.dataset.priority === "1" : row.dataset.status === stage);
    const show = matchesSearch && matchesStage;
    row.classList.toggle("d-none", !show);
    if (show) visible += 1;
  });
  document.getElementById("lead-result-count").textContent = `${visible} account${visible === 1 ? "" : "s"} shown on this page`;
}

function updateBulkToolbar() {
  const toolbar = document.getElementById("bulk-toolbar");
  const count = selectedIds.size;
  toolbar.classList.toggle("d-none", count === 0);
  toolbar.classList.toggle("d-flex", count > 0);
  document.getElementById("bulk-count").textContent = `${count} selected`;

  const rowChecks = document.querySelectorAll(".row-checkbox");
  const selectAll = document.getElementById("select-all-checkbox");
  if (rowChecks.length === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  } else {
    const checkedCount = [...rowChecks].filter(cb => cb.checked).length;
    selectAll.checked = checkedCount === rowChecks.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < rowChecks.length;
  }
}

function siteCheckBadge(lead) {
  if (!lead.website_url) {
    return '<span class="status-pill audited">No website</span>';
  }
  if (lead.status === "pending") {
    return '<span class="text-muted-custom small">Not checked yet</span>';
  }
  if (!lead.audit_findings) {
    return '<span class="text-muted-custom small">—</span>';
  }
  if (lead.audit_findings.reachable === false) {
    return `<span class="status-pill rejected">Unreachable</span>`;
  }
  const count = (lead.audit_findings.issues || []).length;
  if (count === 0) {
    return '<span class="status-pill sent">No issues found</span>';
  }
  return `<span class="status-pill pitch_ready">${count} issue${count === 1 ? "" : "s"} found</span>`;
}

function opportunityBadge(lead) {
  const opportunity = lead.opportunity || {};
  const classes = {
    broken_website: "rejected",
    no_website: "audited",
    active_website: "sent",
    audit_pending: "pending",
  };
  const type = opportunity.type || "audit_pending";
  return `<span class="status-pill ${classes[type] || "pending"}" title="${escapeHtml(opportunity.reason || "")}">${escapeHtml(opportunity.label || "Check website")}</span>`;
}

function actionButtons(lead) {
  const buttons = [];
  buttons.push(`<button class="btn btn-sm btn-outline-secondary priority-btn ${Number(lead.is_high_priority) ? "is-priority" : ""}" data-id="${lead.id}" title="${Number(lead.is_high_priority) ? "Remove high priority" : "Mark high priority"}"><i class="bi bi-star${Number(lead.is_high_priority) ? "-fill" : ""}"></i></button>`);
  // Dossier: recon before outreach — tech-stack fingerprint, recent news, a
  // grounded angle. Works from the business name alone, so it's offered for
  // every lead. Once a brief exists the button just reopens it (re-running is
  // a button inside the modal).
  if (lead.research_findings) {
    buttons.push(`<button class="btn btn-sm btn-outline-secondary dossier-btn" data-id="${lead.id}">View dossier</button>`);
  } else {
    buttons.push(`<button class="btn btn-sm btn-outline-secondary research-btn" data-id="${lead.id}">Research</button>`);
  }
  // A lead with no website has nothing to audit — it can go straight to a
  // (generic, non-fabricated) pitch instead.
  if (lead.website_url && (lead.status === "pending" || lead.audit_findings)) {
    buttons.push(`<button class="btn btn-sm btn-outline-secondary audit-btn" data-id="${lead.id}">${lead.audit_findings ? "Re-run audit" : "Run audit"}</button>`);
  }
  if (!lead.website_url || lead.audit_findings) {
    // Mirrors the server's own default channel choice in generatePitch():
    // email when possible, a call script only when there's a phone but no
    // email on file — so the button label never promises the wrong thing.
    const phoneOnly = !lead.contact_email && lead.contact_phone;
    const verb = lead.pitch_body ? "Regenerate" : "Generate";
    buttons.push(`<button class="btn btn-sm btn-outline-secondary pitch-btn" data-id="${lead.id}">${verb} ${phoneOnly ? "call script" : "pitch"}</button>`);
  }
  if (lead.pitch_body) {
    buttons.push(`<button class="btn btn-sm btn-brand review-btn" data-id="${lead.id}">Review &amp; Send</button>`);
  }
  buttons.push(`<button class="btn btn-sm btn-outline-secondary account-demo-btn" data-id="${lead.id}">${lead.account_demo ? "Account demo" : "Create demo"}</button>`);
  buttons.push(`<button class="btn btn-sm btn-outline-danger remove-btn" data-id="${lead.id}">Delete</button>`);
  return buttons.join(" ");
}

function compactActionButtons(lead) {
  const id = lead.id;
  const phoneOnly = !lead.contact_email && lead.contact_phone;
  const canAudit = lead.website_url && (lead.status === "pending" || lead.audit_findings);
  const canPitch = !lead.website_url || lead.audit_findings;
  const secondary = [];
  let primary = "";

  if (lead.pitch_body) {
    primary = `<button class="btn btn-sm btn-brand review-btn" data-id="${id}">Review &amp; send</button>`;
  } else if (canPitch) {
    primary = `<button class="btn btn-sm btn-brand pitch-btn" data-id="${id}">Generate ${phoneOnly ? "call script" : "pitch"}</button>`;
  } else if (canAudit) {
    primary = `<button class="btn btn-sm btn-brand audit-btn" data-id="${id}">${lead.audit_findings ? "Re-run audit" : "Run audit"}</button>`;
  } else {
    primary = `<button class="btn btn-sm btn-brand research-btn" data-id="${id}">Research</button>`;
  }

  if (lead.research_findings) {
    secondary.push(`<button class="lead-more-item dossier-btn" data-id="${id}"><i class="bi bi-journal-text"></i> View dossier</button>`);
  } else if (!primary.includes("research-btn")) {
    secondary.push(`<button class="lead-more-item research-btn" data-id="${id}"><i class="bi bi-search"></i> Research account</button>`);
  }
  if (canAudit && !primary.includes("audit-btn")) {
    secondary.push(`<button class="lead-more-item audit-btn" data-id="${id}"><i class="bi bi-shield-check"></i> ${lead.audit_findings ? "Re-run audit" : "Run audit"}</button>`);
  }
  if (canPitch && !primary.includes("pitch-btn")) {
    secondary.push(`<button class="lead-more-item pitch-btn" data-id="${id}"><i class="bi bi-pencil-square"></i> ${lead.pitch_body ? "Regenerate" : "Generate"} ${phoneOnly ? "call script" : "pitch"}</button>`);
  }
  secondary.push(`<button class="lead-more-item account-demo-btn" data-id="${id}"><i class="bi bi-window"></i> ${lead.account_demo ? "Open account demo" : "Create account demo"}</button>`);
  secondary.push(`<button class="lead-more-item remove-btn is-danger" data-id="${id}"><i class="bi bi-trash3"></i> Delete lead</button>`);

  return `
    <button class="btn btn-sm btn-outline-secondary priority-btn ${Number(lead.is_high_priority) ? "is-priority" : ""}" data-id="${id}" title="${Number(lead.is_high_priority) ? "Remove high priority" : "Mark high priority"}" aria-label="${Number(lead.is_high_priority) ? "Remove high priority" : "Mark high priority"}"><i class="bi bi-star${Number(lead.is_high_priority) ? "-fill" : ""}"></i></button>
    ${primary}
    <details class="lead-more-actions">
      <summary>More <i class="bi bi-chevron-down"></i></summary>
      <div class="lead-more-panel">${secondary.join("")}</div>
    </details>`;
}

async function loadLeads() {
  loadOutreachStats(); // eligible-queue count tracks lead state; refresh alongside
  const response = await api.get("/api/v1/admin/marketing-leads");
  const rows = Array.isArray(response) ? response : [];
  const tbody = document.getElementById("leads-tbody");
  const empty = document.getElementById("empty-state");

  selectedIds.clear();
  updateLeadPulse(rows);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted-custom py-5">No accounts yet. Find prospects by niche or add your first lead.</td></tr>';
    document.getElementById("lead-result-count").textContent = "No accounts yet";
    empty.classList.add("d-none");
    updateBulkToolbar();
    return;
  }
  empty.classList.add("d-none");

  const renderHighIntentLeads = (leads) => {
    const container = document.getElementById("high-intent-leads-container");
    if (!container) return;

    let hotLeads = leads.filter(l => (l.account_demo && l.account_demo.views > 0) || Number(l.is_high_priority));
    hotLeads.sort((a, b) => {
       const aScore = (a.account_demo ? (a.account_demo.views * 10 + (a.account_demo.cta_clicks || 0) * 5) : 0) + (Number(a.is_high_priority) ? 50 : 0);
       const bScore = (b.account_demo ? (b.account_demo.views * 10 + (b.account_demo.cta_clicks || 0) * 5) : 0) + (Number(b.is_high_priority) ? 50 : 0);
       return bScore - aScore;
    });

    hotLeads = hotLeads.slice(0, 5); // top 5

    if (hotLeads.length === 0) {
       container.innerHTML = `<div class="text-muted-custom small text-center py-3">No high-intent leads detected yet.</div>`;
       return;
    }

    container.innerHTML = hotLeads.map(lead => {
       const demo = lead.account_demo || {};
       const score = Math.min(100, (demo.views || 0) * 10 + (demo.cta_clicks || 0) * 5 + (Number(lead.is_high_priority) ? 50 : 0) + 10);
       let detailsHtml = '';
       if (demo.views > 0) detailsHtml += `• Opened demo ${demo.views} times<br>`;
       if (demo.cta_clicks > 0) detailsHtml += `• Clicked CTA ${demo.cta_clicks} times<br>`;
       if (demo.engaged_seconds > 0) detailsHtml += `• Viewed for ${Math.floor(demo.engaged_seconds / 60)}m ${demo.engaged_seconds % 60}s<br>`;
       if (!detailsHtml) detailsHtml = '• Matching target profile<br>• Ready for initial outreach';

       return `
        <div class="intelligence-item">
            <div class="intel-header">
                <span class="intel-company">${escapeHtml(lead.business_name)}</span>
                <span class="intel-score">${score}/100 Intent</span>
            </div>
            <div class="intel-details">
                ${detailsHtml}
            </div>
            <button class="btn btn-sm btn-primary w-100 mt-2 fw-semibold" onclick="document.querySelector('.row-checkbox[data-id=\\'${lead.id}\\']')?.closest('tr').querySelector('.lead-more-actions')?.click()">View Lead Options</button>
        </div>
       `;
    }).join('');
  };
  renderHighIntentLeads(rows);

  const renderPage = pageRows => {
    tbody.innerHTML = pageRows.map(lead => {
      let statusClass = "status-pending-ai";
      if (lead.status === "sent" || lead.status === "replied") statusClass = "status-active-ai";
      else if (lead.status === "rejected") statusClass = "status-hot-ai";
      const demo = lead.account_demo || {};
      
      return `
    <tr data-lead-row data-search="${escapeHtml(`${lead.business_name || ""} ${lead.contact_email || ""} ${lead.contact_phone || ""} ${lead.website_url || ""}`.toLowerCase())}" data-status="${escapeHtml(lead.status || "")}" data-priority="${Number(lead.is_high_priority) ? "1" : "0"}">
      <td class="ps-3"><input type="checkbox" class="form-check-input row-checkbox" data-id="${lead.id}"></td>
      <td>
        <div class="company-pill-ai">${Number(lead.is_high_priority) ? '<i class="bi bi-star-fill me-1" style="color:#e6a234" title="High priority"></i>' : ''}${escapeHtml(lead.business_name)}</div>
        ${demo.url ? `<a href="${escapeHtml(demo.url)}" target="_blank" class="demo-link-ai">${escapeHtml(demo.url.replace(/^https?:\/\//, ""))}</a>` : `<span class="demo-link-ai text-muted-custom">No demo published</span>`}
      </td>
      <td><strong>${Number(demo.views || 0)}</strong></td>
      <td>${Number(demo.cta_clicks || 0)} Clicks</td>
      <td>${Number(demo.engaged_seconds || 0)}s</td>
      <td><span class="status-pill-ai ${statusClass}">${escapeHtml(lead.status.replace("_", " "))}</span></td>
      <td class="text-end pe-3 lead-actions">
        <div class="lead-actions-more">${compactActionButtons(lead)}</div>
      </td>
    </tr>
    `;
    }).join("");
  applyLeadFilters();

  tbody.querySelectorAll(".lead-more-actions").forEach(details => {
    details.addEventListener("toggle", () => {
      if (!details.open) return;
      tbody.querySelectorAll(".lead-more-actions[open]").forEach(other => {
        if (other !== details) other.open = false;
      });
    });
  });

  tbody.querySelectorAll(".row-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.id;
      if (cb.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateBulkToolbar();
    });
  });

  updateBulkToolbar();

  tbody.querySelectorAll(".priority-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const lead = rows.find(r => r.id === Number(btn.dataset.id));
      btn.disabled = true;
      try {
        await api.patch(`/api/v1/admin/marketing-leads/${lead.id}`, { is_high_priority: !Number(lead.is_high_priority) });
      } catch (err) {
        alert(err.message || "Could not update priority.");
      }
      await loadLeads();
    });
  });

  tbody.querySelectorAll(".account-demo-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const lead = rows.find(r => r.id === Number(btn.dataset.id));
      if (lead.account_demo) {
        openAccountDemo(lead, lead.account_demo);
        return;
      }
      btn.disabled = true;
      btn.textContent = "Building…";
      try {
        const response = await api.post(`/api/v1/admin/marketing-leads/${lead.id}/account-demo/generate`, {});
        openAccountDemo({ ...lead, is_high_priority: 1 }, response.demo);
        await loadLeads();
      } catch (err) {
        alert(err.message || "Could not create the account demo.");
        await loadLeads();
      }
    });
  });

  tbody.querySelectorAll(".research-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const lead = rows.find(r => r.id === Number(btn.dataset.id));
      btn.disabled = true;
      btn.textContent = "Researching…";
      try {
        const res = await api.post(`/api/v1/admin/marketing-leads/${btn.dataset.id}/research`, {});
        // Show the brief straight away, then refresh the table underneath so
        // the row's button flips to "View dossier".
        openDossierModal({ ...lead, research_findings: res.research, researched_at: res.research.researched_at });
        await loadLeads();
      } catch (err) {
        alert(err.message || "Research failed.");
        await loadLeads();
      }
    });
  });

  tbody.querySelectorAll(".dossier-btn").forEach(btn => {
    btn.addEventListener("click", () => openDossierModal(rows.find(r => r.id === Number(btn.dataset.id))));
  });

  tbody.querySelectorAll(".audit-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Checking…";
      try {
        const res = await api.post(`/api/v1/admin/marketing-leads/${btn.dataset.id}/audit`, {});
        if (res && res.found_email) alert(`Found a published email on their site: ${res.found_email} — added to the lead.`);
      } catch (err) {
        alert(err.message || "Audit failed.");
      }
      await loadLeads();
    });
  });

  tbody.querySelectorAll(".pitch-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Drafting…";
      try {
        await api.post(`/api/v1/admin/marketing-leads/${btn.dataset.id}/generate-pitch`, {});
      } catch (err) {
        alert(err.message || "Pitch generation failed.");
      }
      await loadLeads();
    });
  });

  tbody.querySelectorAll(".review-btn").forEach(btn => {
    btn.addEventListener("click", () => openPitchModal(rows.find(r => r.id === Number(btn.dataset.id))));
  });

  tbody.querySelectorAll(".remove-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this lead?")) return;
      await api.delete(`/api/v1/admin/marketing-leads/${btn.dataset.id}`);
      await loadLeads();
    });
  });
  };

  AdminPagination.page('marketing-leads', rows, renderPage, {
    anchor: document.getElementById('pagination'),
    scrollTarget: document.getElementById('lead-tracker'),
  });
}

function renderDiscoverResults() {
  const container = document.getElementById("discover-results");
  if (discoverResults.length === 0) {
    container.innerHTML = '';
    updateDiscoverAddButton();
    return;
  }

  container.innerHTML = `
    <div class="list-group">
      ${discoverResults.map((r, i) => `
        <label class="list-group-item d-flex gap-2 align-items-start ${r.already_added ? 'text-muted-custom' : ''}">
          <input type="checkbox" class="form-check-input mt-1 discover-check" data-index="${i}" ${r.already_added ? 'disabled' : ''}>
          <span class="flex-grow-1">
            <span class="fw-semibold">${escapeHtml(r.business_name)}</span>
            ${r.already_added ? '<span class="badge bg-secondary ms-2">Already added</span>' : ''}
            <br>
            <span class="small">${r.website_url ? `<a href="${escapeHtml(r.website_url)}" target="_blank" rel="noopener">${escapeHtml(r.website_url)}</a>` : '<span class="text-muted-custom">No website found</span>'}</span>
            ${r.phone ? `<br><span class="small text-muted-custom">${escapeHtml(r.phone)}</span>` : ''}
            ${r.address ? `<br><span class="small text-muted-custom">${escapeHtml(r.address)}</span>` : ''}
          </span>
        </label>
      `).join("")}
    </div>
  `;

  container.querySelectorAll(".discover-check").forEach(cb => {
    cb.addEventListener("change", updateDiscoverAddButton);
  });
  updateDiscoverAddButton();
}

function updateDiscoverAddButton() {
  const checked = document.querySelectorAll(".discover-check:checked").length;
  const btn = document.getElementById("discover-add-btn");
  btn.textContent = `Add selected (${checked})`;
  btn.disabled = checked === 0;
}

document.getElementById("discover-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("discover-msg");
  const btn = document.getElementById("discover-submit-btn");
  msg.classList.add("d-none");
  discoverResults = [];
  renderDiscoverResults();
  btn.disabled = true;
  btn.textContent = "Searching…";

  try {
    const response = await api.post("/api/v1/admin/marketing-leads/discover", {
      query: document.getElementById("discover-query").value.trim(),
    });
    discoverResults = response.results || [];
    renderDiscoverResults();
    if (discoverResults.length === 0) {
      msg.className = "alert alert-secondary py-2 small";
      msg.textContent = "No results found for that search.";
      msg.classList.remove("d-none");
    }
  } catch (err) {
    msg.className = "alert alert-danger py-2 small";
    msg.textContent = err.message || "Search failed.";
    msg.classList.remove("d-none");
  }

  btn.disabled = false;
  btn.textContent = "Search";
});

document.getElementById("discover-add-btn").addEventListener("click", async () => {
  const btn = document.getElementById("discover-add-btn");
  const msg = document.getElementById("discover-msg");
  const indices = [...document.querySelectorAll(".discover-check:checked")].map(cb => Number(cb.dataset.index));
  const leads = indices.map(i => ({
    business_name: discoverResults[i].business_name,
    website_url: discoverResults[i].website_url,
    phone: discoverResults[i].phone,
  }));
  if (!leads.length) return;

  btn.disabled = true;
  btn.textContent = "Adding…";
  try {
    const response = await api.post("/api/v1/admin/marketing-leads/bulk", {
      leads,
      estimated_value: document.getElementById("discover-estimated-value").value,
      currency: document.getElementById("discover-currency").value,
    });
    discoverModal.hide();
    document.getElementById("discover-form").reset();
    document.getElementById("discover-estimated-value").value = "0";
    document.getElementById("discover-currency").value = "GHS";
    discoverResults = [];
    renderDiscoverResults();
    msg.classList.add("d-none");
    await loadLeads();
    alert(`Added ${response.added} lead${response.added === 1 ? "" : "s"}.`);
  } catch (err) {
    msg.className = "alert alert-danger py-2 small";
    msg.textContent = err.message || "Could not add leads.";
    msg.classList.remove("d-none");
  }
  updateDiscoverAddButton();
});

document.getElementById("discover-modal").addEventListener("hidden.bs.modal", () => {
  document.getElementById("discover-form").reset();
  document.getElementById("discover-msg").classList.add("d-none");
  discoverResults = [];
  renderDiscoverResults();
});

let dossierModal = null;
let dossierLeadId = null;
let dossierBusinessName = "";

// Renders whatever Dossier's research() returned. Every section degrades to
// its own note ("No recent news found", etc.) rather than vanishing, so an
// empty section reads as "we looked and there was nothing" instead of "this
// feature is broken".
function renderDossier(research) {
  const r = research || {};

  const tech = r.tech_stack || [];
  const techEl = document.getElementById("dossier-tech");
  techEl.innerHTML = tech.length
    ? tech.map(t => `
        <li class="mb-1">
          <span class="fw-semibold">${escapeHtml(t.signal)}</span>
          <span class="status-pill audited ms-1">${escapeHtml(t.category)}</span>
          <div class="small text-muted-custom">${escapeHtml(t.evidence)}</div>
        </li>`).join("")
    : `<li class="text-muted-custom">${escapeHtml(r.tech_note || "No tech-stack signals detected.")}</li>`;

  const news = r.recent_news || [];
  const newsEl = document.getElementById("dossier-news");
  newsEl.innerHTML = news.length
    ? news.map(n => `
        <li class="mb-2">
          ${n.link
            ? `<a href="${escapeHtml(n.link)}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a>`
            : escapeHtml(n.title)}
          <div class="small text-muted-custom">
            ${n.source ? escapeHtml(n.source) : ""}${n.source && n.date ? " · " : ""}${n.date ? escapeHtml(n.date) : ""}
          </div>
          ${n.snippet ? `<div class="small">${escapeHtml(n.snippet)}</div>` : ""}
        </li>`).join("")
    : `<li class="text-muted-custom">${escapeHtml(r.news_note || "No recent news found.")}</li>`;

  const summaryEl = document.getElementById("dossier-summary");
  summaryEl.textContent = r.summary
    || "No AI summary — this is available when a Gemini, OpenRouter, or Groq key is configured in Settings.";

  document.getElementById("dossier-meta").textContent = r.researched_at
    ? `Researched ${r.researched_at}`
    : "";
}

function openDossierModal(lead) {
  dossierLeadId = lead.id;
  dossierBusinessName = lead.business_name;
  document.getElementById("dossier-modal-business").textContent = lead.business_name;
  renderDossier(lead.research_findings);
  dossierModal.show();
}

function renderPitchPreview() {
  const text = document.getElementById("pitch-body").value;
  const escaped = escapeHtml(text);
  document.getElementById("pitch-preview").innerHTML = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>'
  );
}

function openPitchModal(lead) {
  currentLead = lead;
  const channel = lead.pitch_channel || "email";
  document.getElementById("pitch-modal-business").textContent = lead.business_name;
  document.getElementById("pitch-contact-email").value = lead.contact_email || "";
  document.getElementById("pitch-contact-phone").value = lead.contact_phone || "";
  document.getElementById("pitch-subject").value = lead.pitch_subject || "";
  document.getElementById("pitch-body").value = lead.pitch_body || "";
  document.getElementById("pitch-estimated-value").value = Number(lead.estimated_value || 0) / 100;
  document.getElementById("pitch-currency").value = lead.currency || "GHS";
  document.getElementById("pitch-modal-alert").classList.add("d-none");

  // A phone call has no subject line and no clickable-link preview worth
  // showing — swap those fields out rather than leaving irrelevant empty
  // inputs in a "pitch" modal that's now really a call-script modal.
  const isPhone = channel === "phone";
  document.getElementById("pitch-email-field").classList.toggle("d-none", isPhone);
  document.getElementById("pitch-phone-field").classList.toggle("d-none", !isPhone);
  document.getElementById("pitch-subject-field").classList.toggle("d-none", isPhone);
  document.getElementById("pitch-preview-field").classList.toggle("d-none", isPhone);
  document.getElementById("pitch-body-label").textContent = isPhone ? "Call script" : "Pitch body";
  document.getElementById("pitch-approve-send-btn").textContent = isPhone ? "Mark as called" : "Approve & Send";
  renderPitchPreview();

  const list = document.getElementById("pitch-findings-list");
  if (!lead.website_url) {
    list.innerHTML = '<li class="text-muted-custom">No website on file — this is a generic introduction, not based on any audit.</li>';
  } else {
    const issues = (lead.audit_findings && lead.audit_findings.issues) || [];
    list.innerHTML = issues.length
      ? issues.map(i => `<li>${escapeHtml(i.detail)}</li>`).join("")
      : '<li class="text-muted-custom">No specific issues found by the audit.</li>';
  }

  pitchModal.show();
}

async function savePitchEdits() {
  await api.patch(`/api/v1/admin/marketing-leads/${currentLead.id}`, {
    contact_email: document.getElementById("pitch-contact-email").value.trim(),
    contact_phone: document.getElementById("pitch-contact-phone").value.trim(),
    pitch_subject: document.getElementById("pitch-subject").value.trim(),
    pitch_body: document.getElementById("pitch-body").value.trim(),
    estimated_value: document.getElementById("pitch-estimated-value").value,
    currency: document.getElementById("pitch-currency").value,
  });
}

document.getElementById("pitch-save-btn").addEventListener("click", async () => {
  const alertBox = document.getElementById("pitch-modal-alert");
  try {
    await savePitchEdits();
    alertBox.className = "alert alert-success py-2 small";
    alertBox.textContent = "Saved.";
    alertBox.classList.remove("d-none");
    await loadLeads();
  } catch (err) {
    alertBox.className = "alert alert-danger py-2 small";
    alertBox.textContent = err.message || "Could not save.";
    alertBox.classList.remove("d-none");
  }
});

document.getElementById("pitch-approve-send-btn").addEventListener("click", async () => {
  const alertBox = document.getElementById("pitch-modal-alert");
  const isPhone = (currentLead.pitch_channel || "email") === "phone";

  if (isPhone) {
    const phone = document.getElementById("pitch-contact-phone").value.trim();
    if (!phone) {
      alertBox.className = "alert alert-danger py-2 small";
      alertBox.textContent = "Add a contact phone before marking as called.";
      alertBox.classList.remove("d-none");
      return;
    }
    try {
      await savePitchEdits();
      // tel: only launches whatever dialer app is registered (a desktop
      // browser usually has none) — it can't confirm a call happened, so
      // this is just a convenience, not the actual "send" action. Marking
      // as called always requires the admin to explicitly confirm it below.
      window.location.href = `tel:${encodeURIComponent(phone)}`;
      if (!confirm("Mark this lead as called?")) return;
      await api.post(`/api/v1/admin/marketing-leads/${currentLead.id}/send`, {});
      pitchModal.hide();
      await loadLeads();
    } catch (err) {
      alertBox.className = "alert alert-danger py-2 small";
      alertBox.textContent = err.message || "Could not mark as called.";
      alertBox.classList.remove("d-none");
    }
    return;
  }

  const email = document.getElementById("pitch-contact-email").value.trim();
  if (!email) {
    alertBox.className = "alert alert-danger py-2 small";
    alertBox.textContent = "Add a contact email before sending.";
    alertBox.classList.remove("d-none");
    return;
  }

  try {
    await savePitchEdits();
    const subject = document.getElementById("pitch-subject").value.trim();
    const body = document.getElementById("pitch-body").value.trim();

    // Opens the admin's own mail client with the draft prefilled — this is
    // the actual send action; nothing goes out from the server directly.
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    await api.post(`/api/v1/admin/marketing-leads/${currentLead.id}/send`, {});
    pitchModal.hide();
    await loadLeads();
  } catch (err) {
    alertBox.className = "alert alert-danger py-2 small";
    alertBox.textContent = err.message || "Could not mark as sent.";
    alertBox.classList.remove("d-none");
  }
});

document.getElementById("add-lead-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById("add-lead-alert");
  const btn = document.getElementById("add-lead-submit-btn");
  alertBox.classList.add("d-none");
  btn.disabled = true;

  try {
    await api.post("/api/v1/admin/marketing-leads", {
      business_name: document.getElementById("lead-name").value,
      website_url: document.getElementById("lead-url").value,
      contact_email: document.getElementById("lead-email").value,
      contact_phone: document.getElementById("lead-phone").value,
      estimated_value: document.getElementById("lead-estimated-value").value,
      currency: document.getElementById("lead-currency").value,
    });
    document.getElementById("add-lead-form").reset();
    bootstrap.Modal.getInstance(document.getElementById("add-lead-modal")).hide();
    await loadLeads();
  } catch (err) {
    alertBox.className = "alert alert-danger py-2 small";
    alertBox.textContent = err.message || "Could not add lead.";
    alertBox.classList.remove("d-none");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("select-all-checkbox").addEventListener("change", (e) => {
  document.querySelectorAll(".row-checkbox").forEach(cb => {
    cb.checked = e.target.checked;
    if (e.target.checked) selectedIds.add(cb.dataset.id);
    else selectedIds.delete(cb.dataset.id);
  });
  updateBulkToolbar();
});

document.getElementById("bulk-clear-btn").addEventListener("click", () => {
  selectedIds.clear();
  document.querySelectorAll(".row-checkbox").forEach(cb => { cb.checked = false; });
  updateBulkToolbar();
});

document.getElementById("bulk-remove-btn").addEventListener("click", async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  if (!confirm(`Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}?`)) return;

  const btn = document.getElementById("bulk-remove-btn");
  btn.disabled = true;
  try {
    // SQLite permits one writer at a time. Delete sequentially instead of
    // making several PHP workers compete for the database lock.
    for (const id of ids) {
      await api.delete(`/api/v1/admin/marketing-leads/${id}`);
    }
    await loadLeads();
  } catch (err) {
    alert(err.message || "Could not delete selected leads.");
    await loadLeads();
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("dossier-rerun-btn").addEventListener("click", async () => {
  const btn = document.getElementById("dossier-rerun-btn");
  btn.disabled = true;
  btn.textContent = "Researching…";
  try {
    const res = await api.post(`/api/v1/admin/marketing-leads/${dossierLeadId}/research`, {});
    renderDossier(res.research);
    await loadLeads();
  } catch (err) {
    alert(err.message || "Research failed.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Re-run research";
  }
});

document.getElementById("pitch-body").addEventListener("input", renderPitchPreview);

// --- Cold Outreach Engine panel ------------------------------------------

function renderOutreachStats(s) {
  document.getElementById("oe-queue").textContent = s.eligible_queue;
  document.getElementById("oe-draftable").textContent = s.draftable_queue;
  document.getElementById("oe-sent-today").textContent = s.sent_today;
  document.getElementById("oe-cap-label").textContent = s.daily_cap;
  document.getElementById("oe-sent-total").textContent = s.sent_total;
  document.getElementById("oe-suppressed").textContent = s.suppressed;

  const cap = document.getElementById("oe-cap");
  if (document.activeElement !== cap) cap.value = s.daily_cap;

  const toggle = document.getElementById("oe-enabled");
  toggle.checked = s.enabled;
  document.getElementById("oe-enabled-label").textContent = s.enabled ? "On" : "Off";
  const statusDot = document.getElementById("oe-status-dot");
  statusDot.style.background = s.enabled ? "#28a879" : "#97a1b1";
  statusDot.style.boxShadow = s.enabled ? "0 0 0 .3rem rgba(40,168,121,.14)" : "0 0 0 .3rem rgba(151,161,177,.13)";

  const autodraft = document.getElementById("oe-autodraft");
  autodraft.checked = s.autodraft;
  document.getElementById("oe-autodraft-label").textContent = s.autodraft ? "Auto-draft on" : "Auto-draft off";

  document.getElementById("oe-calls-today").textContent = s.calls_today;
  document.getElementById("oe-call-queue").textContent = s.call_queue;

  const discoveryToggle = document.getElementById("oe-discovery-enabled");
  discoveryToggle.checked = !!s.discovery_enabled;
  document.getElementById("oe-discovery-enabled-label").textContent = s.discovery_enabled ? "On" : "Off";
  const discoveryTarget = document.getElementById("oe-discovery-target");
  const discoveryQueries = document.getElementById("oe-discovery-queries");
  if (document.activeElement !== discoveryTarget) discoveryTarget.value = s.discovery_daily_target || 50;
  if (document.activeElement !== discoveryQueries) discoveryQueries.value = s.discovery_queries || "";
  const lastRun = s.discovery_last_run ? `Last run ${s.discovery_last_run} UTC. ` : "";
  document.getElementById("oe-discovery-status").textContent =
    lastRun + (s.discovery_last_status || "Waiting for its first run.");
}

async function loadOutreachStats() {
  try {
    renderOutreachStats(await api.get("/api/v1/admin/outreach/stats"));
  } catch (err) {
    /* panel is non-critical — leave defaults if it fails */
  }
}

function outreachMsg(text, ok) {
  const el = document.getElementById("oe-msg");
  el.textContent = text;
  el.className = "alert py-2 small mb-0 mt-2 alert-" + (ok ? "success" : "danger");
  setTimeout(() => el.classList.add("d-none"), 4000);
}

async function saveOutreachSettings(body) {
  try {
    renderOutreachStats(await api.post("/api/v1/admin/outreach/settings", body));
    return true;
  } catch (err) {
    outreachMsg(err.message || "Could not update the engine.", false);
    await loadOutreachStats();
    return false;
  }
}

// --- Today's call list -----------------------------------------------------

const CALL_OUTCOMES = [
  ["connected", "Connected"],
  ["interested", "Interested"],
  ["callback", "Call back later"],
  ["voicemail", "Voicemail"],
  ["no_answer", "No answer"],
  ["not_interested", "Not interested"],
  ["wrong_number", "Wrong number"],
];

function callAttemptLabel(row) {
  if (!row.attempts) return "Never called";
  const outcome = CALL_OUTCOMES.find(([v]) => v === row.last_outcome);
  const label = outcome ? outcome[1] : row.last_outcome;
  return `${row.attempts} attempt${row.attempts > 1 ? "s" : ""} · last: ${label}`;
}

async function loadCallList() {
  const body = document.getElementById("call-list-body");
  const empty = document.getElementById("call-list-empty");
  let data;
  try {
    data = await api.get("/api/v1/admin/outreach/call-queue");
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger py-2 small">${escapeHtml(err.message || "Could not load the call queue.")}</div>`;
    return;
  }
  document.getElementById("call-list-today").textContent = data.calls_today;
  document.getElementById("ai-call-list-today").textContent = data.ai_calls_today || 0;
  document.getElementById("ai-call-list-cap").textContent = data.ai_call_daily_cap || 5;
  const rows = data.queue || [];
  const aiCallsAvailable = Number(data.ai_calls_remaining || 0) > 0;
  empty.classList.toggle("d-none", rows.length > 0);

  body.innerHTML = rows.map(row => `
    <div class="p-3 rounded" style="background: var(--bg-soft);" data-lead-id="${row.id}">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        <div>
          <div class="fw-semibold">${escapeHtml(row.business_name)}</div>
          <div class="small text-muted-custom">${callAttemptLabel(row)}</div>
        </div>
        <a class="btn btn-sm btn-outline-secondary ms-auto" href="tel:${encodeURIComponent(row.contact_phone)}"><i class="bi bi-telephone"></i> Call myself</a>
      </div>
      <details class="mb-2">
        <summary class="small" style="cursor:pointer;">Shared call brief</summary>
        <div class="small text-muted-custom mt-1">Lisa introduces herself as an AI assistant. If you call manually, introduce yourself before using these points.</div>
        <div class="small mt-1" style="white-space: pre-wrap;">${escapeHtml(row.pitch_body || "")}</div>
      </details>
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <select class="form-select form-select-sm call-outcome" style="width:auto;">
          <option value="">Log outcome…</option>
          ${CALL_OUTCOMES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
        </select>
        <input type="text" class="form-control form-control-sm call-notes" maxlength="2000" placeholder="Notes (optional)" style="max-width:18rem;">
        <button type="button" class="btn btn-sm btn-outline-secondary call-save-btn">Save</button>
      </div>
      <div class="mt-3 pt-3 border-top">
        <div class="form-check mb-2">
          <input class="form-check-input ai-call-consent" type="checkbox" id="ai-call-consent-${row.id}">
          <label class="form-check-label small" for="ai-call-consent-${row.id}">I confirm this person requested or consented to this call.</label>
        </div>
        <button type="button" class="btn btn-sm btn-brand ai-call-btn" disabled><i class="bi bi-robot me-1"></i>Approve Lisa call</button>
        <span class="small text-muted-custom ms-2 ai-call-state">${aiCallsAvailable ? "" : "Daily Lisa call limit reached."}</span>
      </div>
    </div>`).join("");

  body.querySelectorAll("[data-lead-id]").forEach(card => {
    const consent = card.querySelector(".ai-call-consent");
    const button = card.querySelector(".ai-call-btn");
    const state = card.querySelector(".ai-call-state");
    consent.disabled = !aiCallsAvailable;
    consent.addEventListener("change", () => { button.disabled = !consent.checked || !aiCallsAvailable; });
    button.addEventListener("click", async () => {
      if (!consent.checked || !confirm("Approve one AI call from Lisa to this number now?")) return;
      button.disabled = true;
      consent.disabled = true;
      state.textContent = "Starting call…";
      try {
        const result = await api.post(`/api/v1/admin/outreach/ai-call/${card.dataset.leadId}`, {
          approved: true,
          consent_confirmed: true,
        });
        state.textContent = `Call ${result.status || "queued"}.`;
      } catch (err) {
        state.textContent = err.message || "Could not start the call.";
        consent.disabled = false;
        button.disabled = !consent.checked;
      }
    });
  });

  body.querySelectorAll(".call-save-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const card = btn.closest("[data-lead-id]");
      const outcome = card.querySelector(".call-outcome").value;
      if (!outcome) { alert("Pick an outcome first."); return; }
      btn.disabled = true;
      try {
        await api.post(`/api/v1/admin/outreach/call-log/${card.dataset.leadId}`, {
          outcome,
          notes: card.querySelector(".call-notes").value.trim(),
        });
        await loadCallList();
        await loadLeads();
      } catch (err) {
        alert(err.message || "Could not log the call.");
        btn.disabled = false;
      }
    });
  });
}

function wireOutreachPanel() {
  document.getElementById("call-list-modal").addEventListener("show.bs.modal", loadCallList);

  document.getElementById("oe-enabled").addEventListener("change", async (e) => {
    const on = e.target.checked;
    if (await saveOutreachSettings({ enabled: on })) {
      outreachMsg(on ? "Cold outreach is on — reviewed pitches will send on the daily cap." : "Cold outreach paused.", true);
    }
  });

  document.getElementById("oe-autodraft").addEventListener("change", async (e) => {
    const on = e.target.checked;
    if (await saveOutreachSettings({ autodraft: on })) {
      outreachMsg(on
        ? "Auto-draft on — the engine will audit & pitch raw leads to keep the queue full (up to the daily cap)."
        : "Auto-draft off — only pitches you've reviewed will send.", true);
    }
  });

  document.getElementById("oe-cap").addEventListener("change", async (e) => {
    const cap = parseInt(e.target.value, 10);
    if (!Number.isInteger(cap) || cap < 1 || cap > 500) {
      outreachMsg("Daily cap must be between 1 and 500.", false);
      await loadOutreachStats();
      return;
    }
    if (await saveOutreachSettings({ daily_cap: cap })) outreachMsg("Daily cap updated to " + cap + ".", true);
  });

  document.getElementById("oe-discovery-save").addEventListener("click", async () => {
    const target = parseInt(document.getElementById("oe-discovery-target").value, 10);
    const queries = document.getElementById("oe-discovery-queries").value.trim();
    if (!Number.isInteger(target) || target < 1 || target > 50) {
      outreachMsg("Daily discovery target must be between 1 and 50.", false);
      return;
    }
    if (!queries) {
      outreachMsg("Add at least one niche and location search.", false);
      return;
    }
    const saved = await saveOutreachSettings({
      discovery_enabled: document.getElementById("oe-discovery-enabled").checked,
      discovery_daily_target: target,
      discovery_queries: queries,
    });
    if (saved) outreachMsg("Automatic daily lead discovery updated.", true);
  });
}

function accountDemoMessage(message, ok) {
  const box = document.getElementById("account-demo-alert");
  box.className = `alert alert-${ok ? "success" : "danger"} py-2 small mt-3`;
  box.textContent = message;
  box.classList.remove("d-none");
}

function renderAccountDemoWorkflow(steps) {
  document.getElementById("account-demo-workflow").innerHTML = (steps || []).map((step, index) => `
    <div class="account-demo-step" data-step="${index + 1}">
      <div class="row g-2">
        <div class="col-8"><input class="form-control account-demo-step-label" maxlength="80" value="${escapeHtml(step.label || "")}" aria-label="Step ${index + 1} label"></div>
        <div class="col-4"><select class="form-select account-demo-step-actor" aria-label="Step ${index + 1} actor">
          ${["Lisa", "Team", "System"].map(actor => `<option ${step.actor === actor ? "selected" : ""}>${actor}</option>`).join("")}
        </select></div>
      </div>
      <textarea class="form-control account-demo-step-detail" rows="2" maxlength="280" aria-label="Step ${index + 1} detail">${escapeHtml(step.detail || "")}</textarea>
    </div>`).join("");
}

function openAccountDemo(lead, demo) {
  accountDemoLead = { ...lead, account_demo: demo };
  document.getElementById("account-demo-business").textContent = lead.business_name;
  document.getElementById("account-demo-priority").checked = Number(demo.is_high_priority ?? lead.is_high_priority) === 1;
  document.getElementById("account-demo-headline").value = demo.headline || "";
  document.getElementById("account-demo-summary").value = demo.outcome_summary || "";
  document.getElementById("account-demo-friction").value = demo.friction_label || "";
  document.getElementById("account-demo-proof").value = demo.proof_note || "";
  renderAccountDemoWorkflow(demo.workflow || []);
  const status = document.getElementById("account-demo-status");
  status.textContent = demo.status === "published" ? "Published" : "Draft";
  status.className = `status-pill ${demo.status === "published" ? "sent" : "pending"}`;
  document.getElementById("account-demo-metrics").textContent =
    `${Number(demo.intent_score || 0)}/100 intent · ${Number(demo.views || 0)} views · ${Number(demo.max_scroll_depth || 0)}% depth · ${Number(demo.engaged_seconds || 0)}s active · ${Number(demo.interaction_count || 0)} interactions · ${Number(demo.cta_clicks || 0)} CTA clicks`;
  const open = document.getElementById("account-demo-open");
  open.href = demo.url || "#";
  open.classList.toggle("d-none", demo.status !== "published");
  document.getElementById("account-demo-publish").textContent = demo.status === "published" ? "Republish changes" : "Publish walkthrough";
  document.getElementById("account-demo-alert").classList.add("d-none");
  accountDemoModal.show();
}

function accountDemoPayload() {
  return {
    is_high_priority: document.getElementById("account-demo-priority").checked,
    headline: document.getElementById("account-demo-headline").value.trim(),
    outcome_summary: document.getElementById("account-demo-summary").value.trim(),
    friction_label: document.getElementById("account-demo-friction").value.trim(),
    proof_note: document.getElementById("account-demo-proof").value.trim(),
    workflow: [...document.querySelectorAll(".account-demo-step")].map(step => ({
      label: step.querySelector(".account-demo-step-label").value.trim(),
      actor: step.querySelector(".account-demo-step-actor").value,
      detail: step.querySelector(".account-demo-step-detail").value.trim(),
    })),
  };
}

async function saveAccountDemo() {
  const response = await api.patch(`/api/v1/admin/marketing-leads/${accountDemoLead.id}/account-demo`, accountDemoPayload());
  accountDemoLead.account_demo = response.demo;
  return response.demo;
}

document.getElementById("account-demo-save").addEventListener("click", async () => {
  try {
    const demo = await saveAccountDemo();
    openAccountDemo(accountDemoLead, demo);
    accountDemoMessage("Draft saved.", true);
    await loadLeads();
  } catch (err) {
    accountDemoMessage(err.message || "Could not save the walkthrough.", false);
  }
});

document.getElementById("account-demo-publish").addEventListener("click", async () => {
  try {
    await saveAccountDemo();
    const response = await api.post(`/api/v1/admin/marketing-leads/${accountDemoLead.id}/account-demo/publish`, {});
    openAccountDemo(accountDemoLead, response.demo);
    accountDemoMessage("Published. Regenerate the lead's pitch to include this private link.", true);
    await loadLeads();
  } catch (err) {
    accountDemoMessage(err.message || "Could not publish the walkthrough.", false);
  }
});

document.getElementById("account-demo-regenerate").addEventListener("click", async () => {
  if (!confirm("Replace the current draft with a fresh version grounded in the latest audit and dossier?")) return;
  const button = document.getElementById("account-demo-regenerate");
  button.disabled = true;
  try {
    const response = await api.post(`/api/v1/admin/marketing-leads/${accountDemoLead.id}/account-demo/generate`, {});
    openAccountDemo(accountDemoLead, response.demo);
    accountDemoMessage("Regenerated from the latest evidence. Review it before publishing.", true);
    await loadLeads();
  } catch (err) {
    accountDemoMessage(err.message || "Could not regenerate the walkthrough.", false);
  } finally {
    button.disabled = false;
  }
});

// --- Outreach performance analytics ---------------------------------------

const REPLY_CLASSIFICATION_TONE = {
  interested: "positive",
  question: "positive",
  not_interested: "negative",
  unsubscribe: "negative",
  needs_review: "warning",
};

function replyClassificationLabel(classification) {
  return String(classification || "pending").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatShortDate(value) {
  if (!value) return "—";
  const d = new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return escapeHtml(String(value));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderAnalyticsMetrics(overview) {
  document.getElementById("am-emails-total").textContent = Number(overview.emails_sent_total || 0).toLocaleString();
  document.getElementById("am-emails-sub").textContent =
    `${overview.emails_sent_today || 0} today · ${overview.emails_sent_7d || 0} this week`;

  document.getElementById("am-replies-total").textContent = Number(overview.replies_total || 0).toLocaleString();
  document.getElementById("am-replies-sub").textContent = `${overview.reply_rate || 0}% reply rate`;

  document.getElementById("am-replies-interested").textContent = Number(overview.replies_interested || 0).toLocaleString();
  document.getElementById("am-replies-review").textContent = `${overview.replies_needing_review || 0} need review`;

  document.getElementById("am-demo-views").textContent = Number(overview.demo_views_total || 0).toLocaleString();
  document.getElementById("am-demo-clicks").textContent = `${overview.demo_cta_clicks_total || 0} CTA clicks`;

  document.getElementById("am-demo-intent").textContent = Number(overview.demo_avg_intent || 0).toLocaleString();
  document.getElementById("am-demo-hot").textContent = `${overview.demo_hot_count || 0} hot leads (70+)`;

  document.getElementById("am-calls-total").textContent = Number(overview.calls_total || 0).toLocaleString();
  document.getElementById("am-calls-connected").textContent = `${overview.calls_connected || 0} connected`;

  // Top-of-page KPI strip mirrors a subset of the same overview figures —
  // these have their own -hero ids so they don't collide with the ids above.
  const pct = (num, den) => den > 0 ? `${Math.round((num / den) * 100)}%` : null;

  const demosTotal = Number(overview.demos_total || 0);
  const demosPublished = Number(overview.demos_published || 0);
  document.getElementById("am-demos-generated-hero").textContent = demosTotal.toLocaleString();
  document.getElementById("am-demos-generated-hero-trend").textContent =
    demosTotal > 0 ? `${pct(demosPublished, demosTotal)} published` : "No demos yet";

  const demoViewsTotal = Number(overview.demo_views_total || 0);
  document.getElementById("am-demo-views-hero").textContent = demoViewsTotal.toLocaleString();
  document.getElementById("am-demo-views-hero-trend").textContent =
    demosTotal > 0 ? `${(demoViewsTotal / demosTotal).toFixed(1)}x views per demo` : "No demos yet";

  const demoClicksTotal = Number(overview.demo_cta_clicks_total || 0);
  document.getElementById("am-demo-clicks-hero").textContent = demoClicksTotal.toLocaleString();
  document.getElementById("am-demo-clicks-hero-trend").textContent =
    demoViewsTotal > 0 ? `${pct(demoClicksTotal, demoViewsTotal)} engagement rate` : "No views yet";

  const callsTotal = Number(overview.calls_total || 0);
  const callsConnected = Number(overview.calls_connected || 0);
  document.getElementById("am-calls-total-hero").textContent = callsTotal.toLocaleString();
  document.getElementById("am-calls-total-hero-trend").textContent =
    callsTotal > 0 ? `${pct(callsConnected, callsTotal)} connected` : "No calls yet";
}

function renderSendTrendChart(trend) {
  const el = document.getElementById("send-trend-chart");
  if (!el || !window.Chart) return;
  if (sendTrendChart) sendTrendChart.destroy();
  sendTrendChart = new Chart(el.getContext("2d"), {
    type: "line",
    data: {
      labels: trend.map(d => formatShortDate(d.date)),
      datasets: [
        {
          label: "Emails sent",
          data: trend.map(d => d.sent),
          borderColor: "#2457d6",
          backgroundColor: "rgba(36,87,214,.12)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: "Replies received",
          data: trend.map(d => d.replies),
          borderColor: "#10b981",
          backgroundColor: "rgba(16,185,129,.12)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10 } } },
    },
  });
}

function renderReplyBreakdownChart(breakdown) {
  const el = document.getElementById("reply-breakdown-chart");
  document.getElementById("reply-breakdown-empty").classList.toggle("d-none", breakdown.length > 0);
  el.closest(".chart-wrap").classList.toggle("d-none", breakdown.length === 0);
  if (!breakdown.length || !window.Chart) return;
  if (replyBreakdownChart) replyBreakdownChart.destroy();
  const palette = ["#2457d6", "#10b981", "#f0a43a", "#a52b2b", "#8b5cf6", "#22a9c7", "#94a3b8"];
  replyBreakdownChart = new Chart(el.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: breakdown.map(b => replyClassificationLabel(b.classification)),
      datasets: [{ data: breakdown.map(b => b.count), backgroundColor: palette }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10 } } },
    },
  });
}

function renderSendsTable(sends) {
  const tbody = document.getElementById("sends-tbody");
  document.getElementById("sends-empty").classList.toggle("d-none", sends.length > 0);
  document.getElementById("sends-count-label").textContent = sends.length ? `(most recent ${sends.length})` : "";
  tbody.innerHTML = sends.map(s => `
    <tr>
      <td class="fw-semibold">${escapeHtml(s.business_name || "—")}</td>
      <td class="small text-muted-custom">${escapeHtml(s.subject || "—")}</td>
      <td class="small text-muted-custom">${formatShortDate(s.sent_at)}</td>
      <td class="text-end">${s.replied ? '<span class="status-pill sent">Replied</span>' : '<span class="small text-muted-custom">—</span>'}</td>
    </tr>`).join("");
}

function renderRepliesList(replies) {
  const list = document.getElementById("replies-list");
  document.getElementById("replies-empty").classList.toggle("d-none", replies.length > 0);
  document.getElementById("replies-count-label").textContent = replies.length ? `(most recent ${replies.length})` : "";

  list.innerHTML = replies.map(r => {
    const tone = REPLY_CLASSIFICATION_TONE[r.classification] || "neutral";
    const alreadyReplied = r.status === "replied";
    return `
    <div class="reply-card" data-reply-id="${r.id}">
      <div class="reply-card-head">
        <span class="reply-from">${escapeHtml(r.business_name || r.from_email)}</span>
        <span class="small text-muted-custom">${escapeHtml(r.from_email)}</span>
        <span class="reply-classification tone-${tone}">${escapeHtml(replyClassificationLabel(r.classification))}</span>
        <span class="small text-muted-custom ms-auto">${formatShortDate(r.received_at)}</span>
      </div>
      <div class="small fw-semibold mb-1">${escapeHtml(r.subject || "(no subject)")}</div>
      <div class="reply-body-preview mb-2">${escapeHtml(r.body || "")}</div>
      ${alreadyReplied
        ? `<div class="small text-muted-custom"><i class="bi bi-reply-fill me-1"></i>Replied ${formatShortDate(r.replied_at)}: ${escapeHtml(r.reply_subject || "")}</div>`
        : `
        <details>
          <summary class="small" style="cursor:pointer;">Write a reply</summary>
          <div class="mt-2">
            <input type="text" class="form-control form-control-sm mb-2 reply-subject-input" maxlength="255" placeholder="Subject" value="${escapeHtml(r.subject ? 'Re: ' + r.subject : '')}">
            <textarea class="form-control form-control-sm mb-2 reply-body-input" rows="4" maxlength="12000" placeholder="Write your reply…"></textarea>
            <button type="button" class="btn btn-sm btn-brand reply-send-btn">Send reply</button>
            <span class="small ms-2 reply-send-status"></span>
          </div>
        </details>`}
    </div>`;
  }).join("");

  list.querySelectorAll(".reply-card").forEach(card => {
    const btn = card.querySelector(".reply-send-btn");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const subject = card.querySelector(".reply-subject-input").value.trim();
      const body = card.querySelector(".reply-body-input").value.trim();
      const status = card.querySelector(".reply-send-status");
      if (!subject || !body) {
        status.className = "small ms-2 reply-send-status text-danger";
        status.textContent = "Add a subject and a message first.";
        return;
      }
      btn.disabled = true;
      status.className = "small ms-2 reply-send-status text-muted-custom";
      status.textContent = "Sending…";
      try {
        await api.post(`/api/v1/admin/nurturer-replies/${card.dataset.replyId}/send`, { subject, body });
        await loadAnalytics();
      } catch (err) {
        status.className = "small ms-2 reply-send-status text-danger";
        status.textContent = err.message || "Could not send the reply.";
        btn.disabled = false;
      }
    });
  });
}

function renderTopDemos(demos) {
  const list = document.getElementById("top-demos-list");
  document.getElementById("top-demos-empty").classList.toggle("d-none", demos.length > 0);
  list.innerHTML = demos.map(d => `
    <div class="demo-row">
      <span class="intent-pill" title="Engagement intent score">${Number(d.intent_score || 0)}</span>
      <div class="flex-grow-1 min-w-0">
        <div class="fw-semibold text-truncate">
          ${escapeHtml(d.business_name)}
          ${d.status === "published" ? '<span class="status-pill sent ms-1">Published</span>' : '<span class="status-pill pending ms-1">Draft</span>'}
        </div>
        <div class="demo-meta">${Number(d.views || 0)} views · ${Number(d.cta_clicks || 0)} CTA clicks · ${Number(d.interaction_count || 0)} interactions · ${Number(d.max_scroll_depth || 0)}% depth · ${Number(d.engaged_seconds || 0)}s active</div>
      </div>
      ${d.url ? `<a class="btn btn-sm btn-outline-secondary" href="${escapeHtml(d.url)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i></a>` : ""}
    </div>`).join("");
}

async function loadAnalytics() {
  let data;
  try {
    data = await api.get("/api/v1/admin/marketing-leads/analytics");
  } catch (err) {
    return; // non-critical panel — leave whatever was last rendered
  }
  renderAnalyticsMetrics(data.overview || {});
  renderSendTrendChart(data.send_trend || []);
  renderReplyBreakdownChart(data.reply_breakdown || []);
  renderSendsTable(data.recent_sends || []);
  renderRepliesList(data.recent_replies || []);
  renderTopDemos(data.top_demos || []);
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  pitchModal = new bootstrap.Modal(document.getElementById("pitch-modal"));
  discoverModal = new bootstrap.Modal(document.getElementById("discover-modal"));
  dossierModal = new bootstrap.Modal(document.getElementById("dossier-modal"));
  accountDemoModal = new bootstrap.Modal(document.getElementById("account-demo-modal"));
  document.getElementById("lead-search").addEventListener("input", applyLeadFilters);
  document.getElementById("lead-status-filter").addEventListener("change", applyLeadFilters);
  wireOutreachPanel();
  await loadLeads();
  await loadAnalytics();
})();
