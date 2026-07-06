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
  const query = params.toString() ? `?${params.toString()}` : "";
  const inquiries = await api.get(`/api/v1/admin/inquiries${query}`);
  const list = document.getElementById("inquiries-list");
  const empty = document.getElementById("empty-state");

  if (inquiries.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("d-none");
    return;
  }
  empty.classList.add("d-none");

  list.innerHTML = inquiries.map(i => `
    <div class="admin-card p-3 mb-3" data-id="${i.id}">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>
          <strong>${escapeHtml(i.name)}</strong>
          <span class="text-muted-custom small ms-2">${escapeHtml(i.email)}</span>
          ${i.type === "project_request" ? '<span class="status-pill unread ms-2">Project Request</span>' : ""}
        </div>
        <div class="d-flex gap-2 align-items-center">
          ${notifyBadge(i)}
          <span class="status-pill ${i.status}">${i.status}</span>
        </div>
      </div>
      ${projectRequestDetails(i)}
      <p class="mb-2">${escapeHtml(i.message)}</p>
      <div class="d-flex justify-content-between align-items-center">
        <small class="text-muted-custom">${new Date(i.created_at).toLocaleString()}</small>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary status-btn" data-id="${i.id}" data-status="read">Mark Read</button>
          <button class="btn btn-sm btn-outline-danger status-btn" data-id="${i.id}" data-status="flagged">Flag</button>
          <button class="btn btn-sm btn-outline-secondary status-btn" data-id="${i.id}" data-status="archived">Archive</button>
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
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById("status-filter").addEventListener("change", (e) => loadInquiries(e.target.value));

  const exportLink = document.getElementById("export-csv-link");
  if (exportLink && typeof PAGE_TYPE !== "undefined" && PAGE_TYPE) {
    exportLink.href = `/api/v1/admin/inquiries/export?type=${encodeURIComponent(PAGE_TYPE)}`;
  }

  await loadInquiries();
})();
