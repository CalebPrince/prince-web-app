const STAGE_CLASS = {
  new: 'unread',
  reviewing: 'pending',
  proposal_sent: 'sent',
  won: 'published',
  lost: 'flagged',
};
const STAGE_LABEL = {
  new: 'New',
  reviewing: 'Reviewing',
  proposal_sent: 'Proposal Sent',
  won: 'Won',
  lost: 'Lost',
};

const selectedIds = new Set();
let inboxRows = [];
let activeInquiryId = null;
let inboxStatus = "";
let inboxSearch = "";

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
}

function inboxDate(value, full = false) {
  const date = new Date(value);
  if (full) return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function visibleInboxRows() {
  const query = inboxSearch.toLowerCase();
  return inboxRows.filter(row => {
    if (inboxStatus && row.status !== inboxStatus) return false;
    if (!query) return true;
    return [row.name, row.email, row.message].some(value => String(value || "").toLowerCase().includes(query));
  });
}

function updateInboxCounts() {
  const counts = { all: inboxRows.length, read: 0, unread: 0, flagged: 0, archived: 0 };
  inboxRows.forEach(row => { if (counts[row.status] !== undefined) counts[row.status]++; });
  Object.entries(counts).forEach(([key, count]) => {
    const el = document.querySelector(`[data-count="${key}"]`);
    if (el) el.textContent = count ? String(count) : "";
  });
}

function renderInboxList() {
  const rows = visibleInboxRows();
  const list = document.getElementById("inquiries-list");
  const empty = document.getElementById("empty-state");
  empty.classList.toggle("d-none", rows.length > 0);
  list.innerHTML = rows.map((row, index) => `
    <button type="button" class="inquiry-message ${row.status === "unread" ? "is-unread" : ""} ${Number(row.id) === Number(activeInquiryId) ? "active" : ""}"
      data-id="${row.id}" role="option" aria-selected="${Number(row.id) === Number(activeInquiryId)}" style="--avatar-hue:${(Number(row.id) * 47) % 360}deg">
      <span class="inquiry-avatar">${escapeHtml(initials(row.name))}</span>
      <span class="inquiry-message-copy">
        <span class="inquiry-message-line"><strong>${escapeHtml(row.name)}</strong><time>${inboxDate(row.created_at)}</time></span>
        <span class="inquiry-message-subject">${escapeHtml(row.email)}</span>
        <span class="inquiry-message-preview">${escapeHtml(row.message)}</span>
      </span>
      ${row.status === "flagged" ? '<i class="bi bi-flag-fill inquiry-row-flag" aria-label="Flagged"></i>' : ""}
      ${row.status === "unread" ? '<span class="inquiry-unread-dot" aria-label="Unread"></span>' : ""}
    </button>
  `).join("");
  list.querySelectorAll(".inquiry-message").forEach(button => {
    button.addEventListener("click", () => selectInboxInquiry(Number(button.dataset.id)));
  });
}

function renderInboxReader() {
  const reader = document.getElementById("inquiry-reader");
  const row = inboxRows.find(item => Number(item.id) === Number(activeInquiryId));
  if (!row) {
    reader.innerHTML = '<div class="inquiry-reader-empty"><div class="inquiry-empty-mark"><i class="bi bi-envelope-open"></i></div><h4>Select a message</h4><p>Choose an inquiry from the list to read it here.</p></div>';
    return;
  }
  const paragraphs = escapeHtml(row.message).split(/\r?\n/).filter(Boolean).map(text => `<p>${text}</p>`).join("") || "<p>No message supplied.</p>";
  reader.innerHTML = `
    <header class="inquiry-reader-header">
      <div class="inquiry-reader-sender" style="--avatar-hue:${(Number(row.id) * 47) % 360}deg">
        <span class="inquiry-avatar">${escapeHtml(initials(row.name))}</span>
        <span><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.email)}</small></span>
      </div>
      <div class="inquiry-reader-actions">
        <button type="button" class="btn btn-sm btn-outline-secondary" data-action="${row.status === "unread" ? "read" : "unread"}">${row.status === "unread" ? "Mark read" : "Mark unread"}</button>
        <button type="button" class="inquiry-icon-btn ${row.status === "flagged" ? "active" : ""}" data-action="${row.status === "flagged" ? "read" : "flagged"}" title="${row.status === "flagged" ? "Remove flag" : "Flag"}"><i class="bi bi-flag${row.status === "flagged" ? "-fill" : ""}"></i></button>
        <button type="button" class="inquiry-icon-btn" data-action="archived" title="Archive"><i class="bi bi-archive"></i></button>
        <button type="button" class="inquiry-icon-btn danger" data-action="delete" title="Delete permanently"><i class="bi bi-trash3"></i></button>
      </div>
    </header>
    <div class="inquiry-reader-body">
      <div class="inquiry-message-meta"><span>${inboxDate(row.created_at, true)}</span><span>${escapeHtml(row.status)}</span></div>
      <h2>New inquiry from ${escapeHtml(row.name)}</h2>
      <div class="inquiry-letter">${paragraphs}</div>
      <a class="btn btn-dark inquiry-reply-btn" href="mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent("Re: your inquiry")}"><i class="bi bi-reply me-2"></i>Reply by email</a>
    </div>`;
  reader.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => inboxAction(button.dataset.action)));
}

async function selectInboxInquiry(id) {
  activeInquiryId = id;
  const row = inboxRows.find(item => Number(item.id) === id);
  if (row && row.status === "unread") {
    await api.patch(`/api/v1/admin/inquiries/${id}`, { status: "read" });
    row.status = "read";
  }
  renderInboxList();
  renderInboxReader();
  updateInboxCounts();
}

async function inboxAction(action) {
  if (!activeInquiryId) return;
  if (action === "delete") {
    if (!confirm("Delete this inquiry permanently?")) return;
    await api.delete(`/api/v1/admin/inquiries/${activeInquiryId}`);
    inboxRows = inboxRows.filter(row => Number(row.id) !== Number(activeInquiryId));
  } else {
    await api.patch(`/api/v1/admin/inquiries/${activeInquiryId}`, { status: action });
    const row = inboxRows.find(item => Number(item.id) === Number(activeInquiryId));
    if (row) row.status = action;
  }
  const next = visibleInboxRows()[0];
  activeInquiryId = next ? Number(next.id) : null;
  updateInboxCounts(); renderInboxList(); renderInboxReader();
}

async function initInbox() {
  inboxRows = await api.get("/api/v1/admin/inquiries?type=contact");
  updateInboxCounts();
  document.querySelectorAll(".inquiry-tab").forEach(tab => tab.addEventListener("click", () => {
    inboxStatus = tab.dataset.status;
    document.querySelectorAll(".inquiry-tab").forEach(item => item.classList.toggle("active", item === tab));
    const first = visibleInboxRows()[0]; activeInquiryId = first ? Number(first.id) : null;
    renderInboxList(); renderInboxReader();
  }));
  document.getElementById("inquiry-search-input").addEventListener("input", event => {
    inboxSearch = event.target.value.trim();
    const first = visibleInboxRows()[0];
    if (!visibleInboxRows().some(row => Number(row.id) === Number(activeInquiryId))) activeInquiryId = first ? Number(first.id) : null;
    renderInboxList(); renderInboxReader();
  });
  const first = visibleInboxRows()[0];
  activeInquiryId = first ? Number(first.id) : null;
  renderInboxList(); renderInboxReader();
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

async function bulkSetStatus(status) {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  const verb = { read: "mark", flagged: "flag", archived: "archive" }[status] || "update";
  if (!confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} ${ids.length} item${ids.length === 1 ? "" : "s"} as ${status}?`)) return;

  await Promise.all(ids.map(id => api.patch(`/api/v1/admin/inquiries/${id}`, { status })));
  await loadInquiries(document.getElementById("status-filter").value);
}

function notifyBadge(i) {
  const detail = `Slack: ${i.slack_sent ? "sent" : "not sent"} · Email: ${i.email_sent ? "sent" : "not sent"}`;
  if (!i.notify_status) {
    return "";
  }
  if (i.notify_status === "sent") {
    return `<span class="status-pill published" title="${detail}">✓ Notified</span>`;
  }
  if (i.notify_attempts >= 5) {
    return `<span class="status-pill flagged" title="${detail}">✗ Notification failed</span>`;
  }
  const label = i.notify_attempts > 0 ? `⏳ Retrying (${i.notify_attempts}/5)` : "⏳ Queued";
  return `<span class="status-pill unread" title="${detail}">${label}</span>`;
}

function projectRequestDetails(i) {
  if (i.type !== "project_request") return "";

  let attachmentsHtml = "";
  try {
    const paths = i.attachments ? JSON.parse(i.attachments) : [];
    if (paths.length) {
      attachmentsHtml = `<div class="mt-2 d-flex flex-wrap gap-2">${paths.map((p, idx) =>
        `<a href="${p}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-secondary">📎 Attachment ${idx + 1}</a>`
      ).join("")}</div>`;
    }
  } catch (_) {}

  return `
    <div class="d-flex flex-wrap gap-3 small text-muted-custom mb-2">
      <span><strong>Type:</strong> ${escapeHtml(i.project_type || "—")}</span>
      <span><strong>Budget:</strong> ${escapeHtml(i.budget || "—")}</span>
      <span><strong>Timeline:</strong> ${escapeHtml(i.timeline || "—")}</span>
    </div>
    ${i.features ? `<div class="small text-muted-custom mb-2"><strong>Features:</strong> ${escapeHtml(i.features)}</div>` : ""}
    ${attachmentsHtml}
  `;
}

async function loadInquiries(status = "") {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (typeof PAGE_TYPE !== "undefined" && PAGE_TYPE) params.set("type", PAGE_TYPE);
  const stageFilter = document.getElementById("stage-filter");
  if (stageFilter && stageFilter.value) params.set("pipeline_stage", stageFilter.value);
  const query = params.toString() ? `?${params.toString()}` : "";
  const inquiries = await api.get(`/api/v1/admin/inquiries${query}`);
  const list = document.getElementById("inquiries-list");
  const empty = document.getElementById("empty-state");

  selectedIds.clear();

  if (inquiries.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("d-none");
    updateBulkToolbar();
    return;
  }
  empty.classList.add("d-none");

  const renderPage = pageInquiries => {
    list.innerHTML = pageInquiries.map(i => `
    <div class="admin-card p-3 mb-3" data-id="${i.id}">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div class="d-flex align-items-start gap-2">
          <input type="checkbox" class="form-check-input row-checkbox mt-1" data-id="${i.id}">
          <div>
            <strong>${escapeHtml(i.name)}</strong>
            <span class="text-muted-custom small ms-2">${escapeHtml(i.email)}</span>
            ${i.type === "project_request" ? '<span class="status-pill unread ms-2">Project Request</span>' : ""}
          </div>
        </div>
        <div class="d-flex gap-2 align-items-center">
          ${notifyBadge(i)}
          ${i.type === "project_request" ? `<span class="status-pill ${STAGE_CLASS[i.pipeline_stage] || 'unread'}">${STAGE_LABEL[i.pipeline_stage] || i.pipeline_stage}</span>` : ""}
          <span class="status-pill ${i.status}">${i.status}</span>
        </div>
      </div>
      ${projectRequestDetails(i)}
      <p class="mb-2">${escapeHtml(i.message)}</p>
      <div class="d-flex justify-content-between align-items-center">
        <small class="text-muted-custom">${new Date(i.created_at).toLocaleString()}</small>
        <div class="d-flex gap-2 align-items-center">
          ${i.type === "project_request" ? `
            <select class="form-select form-select-sm stage-select" data-id="${i.id}" style="width:auto;">
              ${Object.keys(STAGE_LABEL).map(s => `<option value="${s}" ${s === i.pipeline_stage ? "selected" : ""}>${STAGE_LABEL[s]}</option>`).join("")}
            </select>
            <a class="btn btn-sm btn-outline-primary" href="/admin/proposals.html?inquiry_id=${encodeURIComponent(i.id)}">Create Proposal</a>
          ` : ""}
          <button class="btn btn-sm btn-outline-secondary status-btn" data-id="${i.id}" data-status="read">Mark Read</button>
          <button class="btn btn-sm btn-outline-danger status-btn" data-id="${i.id}" data-status="flagged">Flag</button>
          <button class="btn btn-sm btn-outline-secondary status-btn" data-id="${i.id}" data-status="archived">Archive</button>
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${i.id}" title="Delete permanently">Delete</button>
        </div>
      </div>
    </div>
    `).join("");

    list.querySelectorAll(".status-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        await api.patch(`/api/v1/admin/inquiries/${btn.dataset.id}`, { status: btn.dataset.status });
        await loadInquiries(document.getElementById("status-filter").value);
      });
    });

    list.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this permanently? This can't be undone.")) return;
        await api.delete(`/api/v1/admin/inquiries/${btn.dataset.id}`);
        await loadInquiries(document.getElementById("status-filter").value);
      });
    });

    list.querySelectorAll(".stage-select").forEach(select => {
      select.addEventListener("change", async () => {
        await api.patch(`/api/v1/admin/inquiries/${select.dataset.id}`, { pipeline_stage: select.value });
        await loadInquiries(document.getElementById("status-filter").value);
      });
    });

    list.querySelectorAll(".row-checkbox").forEach(cb => {
      cb.addEventListener("change", () => {
        const id = cb.dataset.id;
        if (cb.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        updateBulkToolbar();
      });
    });

    updateBulkToolbar();
  };

  AdminPagination.page('inquiries', inquiries, renderPage, { anchor: list });
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  if (document.getElementById("inquiry-inbox")) {
    const exportLink = document.getElementById("export-csv-link");
    exportLink.href = "/api/v1/admin/inquiries/export?type=contact";
    await initInbox();
    return;
  }

  document.getElementById("status-filter").addEventListener("change", (e) => loadInquiries(e.target.value));
  const stageFilter = document.getElementById("stage-filter");
  if (stageFilter) {
    stageFilter.addEventListener("change", () => loadInquiries(document.getElementById("status-filter").value));
  }

  const exportLink = document.getElementById("export-csv-link");
  if (exportLink && typeof PAGE_TYPE !== "undefined" && PAGE_TYPE) {
    exportLink.href = `/api/v1/admin/inquiries/export?type=${encodeURIComponent(PAGE_TYPE)}`;
  }

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

  document.getElementById("bulk-read-btn").addEventListener("click", () => bulkSetStatus("read"));
  document.getElementById("bulk-flag-btn").addEventListener("click", () => bulkSetStatus("flagged"));
  document.getElementById("bulk-archive-btn").addEventListener("click", () => bulkSetStatus("archived"));

  await loadInquiries();
})();
