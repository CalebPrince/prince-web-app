function formatAmount(subunits, currency) {
  return `${currency} ${(subunits / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function renderStats(data) {
  document.getElementById("stat-published").textContent = data.projects.published;
  document.getElementById("stat-published-sub").textContent =
    data.projects.drafts > 0 ? `${data.projects.drafts} draft(s) waiting` : `${data.projects.total} total`;
  document.getElementById("stat-unread").textContent = data.inquiries.unread;
  document.getElementById("stat-unread-sub").textContent = `${data.inquiries.total} total`;
  document.getElementById("stat-recent").textContent = data.inquiries.last_30_days;
  document.getElementById("stat-tags").textContent = data.tags_in_use;

  const revenue = data.payments.revenue_by_currency;
  document.getElementById("stat-revenue").textContent =
    revenue.length > 0 ? revenue.map(r => formatAmount(r.total, r.currency)).join(" + ") : "—";
  document.getElementById("stat-revenue-sub").textContent =
    data.payments.pending > 0 ? `${data.payments.pending} pending` : "no pending payments";

  if (data.new_chat_feedback > 0) {
    document.getElementById("chat-feedback-text").textContent =
      `🎉 ${data.new_chat_feedback} new Live Chat lead(s) — click to review.`;
    document.getElementById("chat-feedback-banner").classList.remove("d-none");
  }

  if (data.webhooks_pending > 0) {
    const warn = document.getElementById("webhook-warning");
    warn.textContent = `${data.webhooks_pending} inquiry notification(s) still queued for Slack — check that the cron job is running.`;
    warn.classList.remove("d-none");
  }
}

function renderRecentInquiries(inquiries) {
  const box = document.getElementById("recent-inquiries");
  document.getElementById("inquiries-empty").classList.toggle("d-none", inquiries.length > 0);

  box.innerHTML = inquiries.map(i => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <div class="me-3 text-truncate">
        <strong>${escapeHtml(i.name)}</strong>
        <span class="text-muted-custom small ms-2">${escapeHtml(i.email)}</span>
      </div>
      <div class="d-flex align-items-center gap-2 flex-shrink-0">
        <span class="status-pill ${i.status}">${i.status}</span>
        <small class="text-muted-custom">${new Date(i.created_at).toLocaleDateString()}</small>
      </div>
    </div>
  `).join("");
}

function renderDraftProjects(drafts) {
  const box = document.getElementById("draft-projects");
  document.getElementById("drafts-empty").classList.toggle("d-none", drafts.length > 0);

  box.innerHTML = drafts.map(d => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <span class="me-3 text-truncate">${escapeHtml(d.title)}</span>
      <small class="text-muted-custom flex-shrink-0">updated ${new Date(d.updated_at).toLocaleDateString()}</small>
    </div>
  `).join("");
}

const PAYMENT_STATUS_PILL_CLASS = { success: "published", pending: "unread", failed: "flagged" };

function renderRecentPayments(payments) {
  const box = document.getElementById("recent-payments");
  document.getElementById("payments-empty").classList.toggle("d-none", payments.length > 0);

  box.innerHTML = payments.map(p => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <div class="me-3 text-truncate">
        <strong>${escapeHtml(p.customer_name || p.email)}</strong>
        <span class="text-muted-custom small ms-2">${formatAmount(p.amount, p.currency)}</span>
      </div>
      <div class="d-flex align-items-center gap-2 flex-shrink-0">
        <span class="status-pill ${PAYMENT_STATUS_PILL_CLASS[p.status] || "read"}">${p.status}</span>
        <small class="text-muted-custom">${new Date(p.created_at).toLocaleDateString()}</small>
      </div>
    </div>
  `).join("");
}

function renderUpcomingAppointments(appointments) {
  const box = document.getElementById("upcoming-appointments");
  document.getElementById("appointments-empty").classList.toggle("d-none", appointments.length > 0);

  box.innerHTML = appointments.map(a => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <div class="me-3 text-truncate">
        <strong>${escapeHtml(a.client_name)}</strong>
        ${a.topic ? `<span class="text-muted-custom small ms-2">${escapeHtml(a.topic)}</span>` : ""}
      </div>
      <small class="text-muted-custom flex-shrink-0">${new Date(`${a.appointment_date}T00:00`).toLocaleDateString()} · ${a.appointment_time}</small>
    </div>
  `).join("");
}

function renderRateLimits(rl) {
  rl = rl || { window_hits: 0, distinct_ips: 0, top: [] };
  const top = rl.top || [];
  document.getElementById("rate-limit-summary").textContent =
    `${rl.window_hits} request(s) across ${rl.distinct_ips} IP(s)`;
  document.getElementById("rate-limit-empty").classList.toggle("d-none", top.length > 0);

  document.getElementById("rate-limit-top").innerHTML = top.map(r => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <div class="me-3 text-truncate">
        <strong>${escapeHtml(r.ip_address)}</strong>
        <span class="text-muted-custom small ms-2">${escapeHtml(r.endpoint)}</span>
      </div>
      <span class="status-pill ${r.hits >= 20 ? "flagged" : "read"} flex-shrink-0">${r.hits} hits</span>
    </div>
  `).join("");
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById("welcome-line").textContent =
    `Signed in as ${user.email} — here's how your portfolio is doing.`;

  const data = await api.get("/api/v1/admin/dashboard");
  renderStats(data);
  renderRecentInquiries(data.recent_inquiries);
  renderDraftProjects(data.draft_projects);
  renderUpcomingAppointments(data.upcoming_appointments);
  renderRecentPayments(data.recent_payments);
  renderRateLimits(data.rate_limit);
})();
