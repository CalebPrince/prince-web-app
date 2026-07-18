let currentLead = null;
let pitchModal = null;
let discoverModal = null;
let discoverResults = [];
const selectedIds = new Set();

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

function actionButtons(lead) {
  const buttons = [];
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
  buttons.push(`<button class="btn btn-sm btn-outline-danger remove-btn" data-id="${lead.id}">Delete</button>`);
  return buttons.join(" ");
}

async function loadLeads() {
  const response = await api.get("/api/v1/admin/marketing-leads");
  const rows = Array.isArray(response) ? response : [];
  const tbody = document.getElementById("leads-tbody");
  const empty = document.getElementById("empty-state");

  selectedIds.clear();

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted-custom py-4">No leads yet. Add one to get started.</td></tr>';
    empty.classList.add("d-none");
    updateBulkToolbar();
    return;
  }
  empty.classList.add("d-none");

  const renderPage = pageRows => {
    tbody.innerHTML = pageRows.map(lead => `
    <tr>
      <td class="ps-3"><input type="checkbox" class="form-check-input row-checkbox" data-id="${lead.id}"></td>
      <td>
        <div class="fw-semibold">${escapeHtml(lead.business_name)}</div>
        ${lead.contact_email ? `<div class="small text-muted-custom">${escapeHtml(lead.contact_email)}</div>` : ''}
        ${lead.contact_phone ? `<div class="small text-muted-custom">${escapeHtml(lead.contact_phone)}</div>` : ''}
        ${!lead.contact_email && !lead.contact_phone ? '<div class="small text-muted-custom">No contact info yet</div>' : ''}
      </td>
      <td class="small">${lead.website_url
        ? `<a href="${escapeHtml(lead.website_url)}" target="_blank" rel="noopener">${escapeHtml(lead.website_url.replace(/^https?:\/\//, ""))}</a>`
        : '<span class="text-muted-custom">No website</span>'}</td>
      <td>${Number(lead.estimated_value) ? `<span class="fw-semibold">${escapeHtml(lead.currency || 'GHS')} ${(Number(lead.estimated_value) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>` : '<span class="text-muted-custom small">Not estimated</span>'}</td>
      <td><span class="status-pill ${lead.status}">${lead.status.replace("_", " ")}</span></td>
      <td>${siteCheckBadge(lead)}</td>
      <td class="text-end pe-3">
        <div class="d-flex gap-1 justify-content-end flex-wrap">${actionButtons(lead)}</div>
      </td>
    </tr>
    `).join("");

  tbody.querySelectorAll(".row-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      const id = cb.dataset.id;
      if (cb.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateBulkToolbar();
    });
  });

  updateBulkToolbar();

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
        await api.post(`/api/v1/admin/marketing-leads/${btn.dataset.id}/audit`, {});
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

  AdminPagination.page('marketing-leads', rows, renderPage, { anchor: document.getElementById('pagination') });
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
    const response = await api.post("/api/v1/admin/marketing-leads/bulk", { leads });
    discoverModal.hide();
    document.getElementById("discover-form").reset();
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
    await Promise.all(ids.map(id => api.delete(`/api/v1/admin/marketing-leads/${id}`)));
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

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  pitchModal = new bootstrap.Modal(document.getElementById("pitch-modal"));
  discoverModal = new bootstrap.Modal(document.getElementById("discover-modal"));
  dossierModal = new bootstrap.Modal(document.getElementById("dossier-modal"));
  await loadLeads();
})();
