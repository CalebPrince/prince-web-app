let currentLead = null;
let pitchModal = null;
let discoverModal = null;
let discoverResults = [];

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
  // A lead with no website has nothing to audit — it can go straight to a
  // (generic, non-fabricated) pitch instead.
  if (lead.website_url && (lead.status === "pending" || lead.audit_findings)) {
    buttons.push(`<button class="btn btn-sm btn-outline-secondary audit-btn" data-id="${lead.id}">${lead.audit_findings ? "Re-run audit" : "Run audit"}</button>`);
  }
  if (!lead.website_url || lead.audit_findings) {
    buttons.push(`<button class="btn btn-sm btn-outline-secondary pitch-btn" data-id="${lead.id}">${lead.pitch_body ? "Regenerate pitch" : "Generate pitch"}</button>`);
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

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted-custom py-4">No leads yet. Add one to get started.</td></tr>';
    empty.classList.add("d-none");
    return;
  }
  empty.classList.add("d-none");

  tbody.innerHTML = rows.map(lead => `
    <tr>
      <td class="ps-3">
        <div class="fw-semibold">${escapeHtml(lead.business_name)}</div>
        ${lead.contact_email ? `<div class="small text-muted-custom">${escapeHtml(lead.contact_email)}</div>` : '<div class="small text-muted-custom">No contact email yet</div>'}
      </td>
      <td class="small">${lead.website_url
        ? `<a href="${escapeHtml(lead.website_url)}" target="_blank" rel="noopener">${escapeHtml(lead.website_url.replace(/^https?:\/\//, ""))}</a>`
        : '<span class="text-muted-custom">No website</span>'}</td>
      <td><span class="status-pill ${lead.status}">${lead.status.replace("_", " ")}</span></td>
      <td>${siteCheckBadge(lead)}</td>
      <td class="text-end pe-3">
        <div class="d-flex gap-1 justify-content-end flex-wrap">${actionButtons(lead)}</div>
      </td>
    </tr>
  `).join("");

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
  document.getElementById("pitch-modal-business").textContent = lead.business_name;
  document.getElementById("pitch-contact-email").value = lead.contact_email || "";
  document.getElementById("pitch-subject").value = lead.pitch_subject || "";
  document.getElementById("pitch-body").value = lead.pitch_body || "";
  document.getElementById("pitch-modal-alert").classList.add("d-none");
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
    pitch_subject: document.getElementById("pitch-subject").value.trim(),
    pitch_body: document.getElementById("pitch-body").value.trim(),
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

document.getElementById("pitch-body").addEventListener("input", renderPitchPreview);

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  pitchModal = new bootstrap.Modal(document.getElementById("pitch-modal"));
  discoverModal = new bootstrap.Modal(document.getElementById("discover-modal"));
  await loadLeads();
})();
