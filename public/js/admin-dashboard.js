function formatAmount(subunits, currency) {
  return `${currency} ${(subunits / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function dashboardDisplayName(user) {
  const suppliedName = user.name || user.display_name || user.full_name;
  if (suppliedName) return String(suppliedName).trim().split(/\s+/)[0];
  const emailName = String(user.email || 'there').split('@')[0].split(/[._-]+/)[0];
  return emailName.charAt(0).toUpperCase() + emailName.slice(1);
}

function startDashboardClock(user) {
  const greeting = document.getElementById('dashboard-greeting');
  const date = document.getElementById('dashboard-date');
  const time = document.getElementById('dashboard-time');
  const timezone = document.getElementById('dashboard-timezone');
  const firstName = dashboardDisplayName(user);

  function update() {
    const now = new Date();
    const hour = now.getHours();
    const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    greeting.textContent = `${salutation}, ${firstName}.`;
    date.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    }).format(now);
    time.textContent = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(now);
    timezone.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ');
    time.dateTime = now.toISOString();
  }

  update();
  window.setInterval(update, 1000);
}

const DASHBOARD_MODE_COPY = {
  operational: 'Delivery health, workload, and immediate action.',
  sales: 'Lead movement, open opportunities, and deals won.',
  financial: 'Collected revenue, receivables, targets, and project profit.',
};

function summaryMoney(rows, empty = '—') {
  return rows?.length ? rows.map(row => formatAmount(row.total, row.currency)).join('<small> + </small>') : empty;
}

function renderModeSummary(mode, summaries) {
  const data = summaries?.[mode] || {};
  const cards = mode === 'operational' ? [
    ['Active projects', data.active_projects || 0, 'Configured delivery work'],
    ['Overdue projects', data.overdue_projects || 0, 'Past project deadline'],
    ['Late milestones', data.overdue_milestones || 0, 'Incomplete and overdue'],
    ['Open tasks', data.open_tasks || 0, 'Admin task queue'],
  ] : mode === 'sales' ? [
    ['Open pipeline', data.open_pipeline || 0, 'Not won or lost'],
    ['New leads · 30 days', data.new_leads_30_days || 0, 'Recent inquiries'],
    ['Deals won this month', data.won_this_month || 0, 'Accepted proposals'],
    ['Open proposal value', summaryMoney(data.open_proposal_value), 'Draft and sent proposals'],
  ] : [
    ['Revenue this month', summaryMoney(data.month_revenue), 'Successful Paystack payments'],
    ['Outstanding invoices', summaryMoney(data.outstanding_invoices, 'Nothing due'), 'Sent and unpaid'],
    ['Portfolio profit', summaryMoney(data.portfolio_profit), 'Project value less actual cost'],
    ['Monthly target', data.monthly_target?.total ? formatAmount(data.monthly_target.total, data.monthly_target.currency) : 'Not set', 'Configured in Reports'],
  ];
  document.getElementById('dashboard-mode-summary').innerHTML = `<header><span>${mode} view</span><p>${DASHBOARD_MODE_COPY[mode]}</p></header>${cards.map(([label,value,note]) => `<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('')}`;
}

function applyDashboardMode(mode, summaries, userEmail) {
  if (!DASHBOARD_MODE_COPY[mode]) mode = 'operational';
  localStorage.setItem('admin_dashboard_mode', mode);
  document.querySelectorAll('[data-dashboard-mode]').forEach(button => {
    const active = button.dataset.dashboardMode === mode;
    button.classList.toggle('active', active); button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.dashboard-mode-section').forEach(section => {
    const hasContent = section.id !== 'dashboard-attention' || section.dataset.hasItems === '1';
    section.classList.toggle('d-none', section.dataset.visibleMode !== mode || !hasContent);
  });
  document.querySelectorAll('.row').forEach(row => {
    const modeChildren = [...row.children].filter(child => child.classList.contains('dashboard-mode-section'));
    if (!modeChildren.length) return;
    row.classList.toggle('dashboard-single-mode', modeChildren.filter(child => !child.classList.contains('d-none')).length === 1);
  });
  document.getElementById('welcome-line').textContent = `Signed in as ${userEmail} — ${DASHBOARD_MODE_COPY[mode]}`;
  renderModeSummary(mode, summaries);
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

function renderDashboardRows(box, rows) {
  const limit = 3;
  box.innerHTML = rows.slice(0, limit).join("");
  if (rows.length <= limit) return;

  const overflow = document.createElement('div');
  overflow.className = 'dashboard-card-overflow d-none';
  overflow.innerHTML = rows.slice(limit).join("");

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'dashboard-card-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.textContent = `Show ${rows.length - limit} more`;
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    overflow.classList.toggle('d-none', expanded);
    toggle.textContent = expanded ? `Show ${rows.length - limit} more` : 'Show less';
  });

  box.append(overflow, toggle);
}

function renderRecentInquiries(inquiries) {
  const box = document.getElementById("recent-inquiries");
  document.getElementById("inquiries-empty").classList.toggle("d-none", inquiries.length > 0);

  renderDashboardRows(box, inquiries.map(i => `
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
  `));
}

function renderDraftProjects(drafts) {
  const box = document.getElementById("draft-projects");
  document.getElementById("drafts-empty").classList.toggle("d-none", drafts.length > 0);

  renderDashboardRows(box, drafts.map(d => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <span class="me-3 text-truncate">${escapeHtml(d.title)}</span>
      <small class="text-muted-custom flex-shrink-0">updated ${new Date(d.updated_at).toLocaleDateString()}</small>
    </div>
  `));
}

const PAYMENT_STATUS_PILL_CLASS = { success: "published", pending: "unread", failed: "flagged" };

function renderRecentPayments(payments) {
  const box = document.getElementById("recent-payments");
  document.getElementById("payments-empty").classList.toggle("d-none", payments.length > 0);

  renderDashboardRows(box, payments.map(p => `
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
  `));
}

function renderUpcomingAppointments(appointments) {
  const box = document.getElementById("upcoming-appointments");
  document.getElementById("appointments-empty").classList.toggle("d-none", appointments.length > 0);

  renderDashboardRows(box, appointments.map(a => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <div class="me-3 text-truncate">
        <strong>${escapeHtml(a.client_name)}</strong>
        ${a.topic ? `<span class="text-muted-custom small ms-2">${escapeHtml(a.topic)}</span>` : ""}
      </div>
      <small class="text-muted-custom flex-shrink-0">${new Date(`${a.appointment_date}T00:00`).toLocaleDateString()} · ${a.appointment_time}</small>
    </div>
  `));
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

const ATTENTION_ICONS = { Inquiry:'bi-inbox', Chat:'bi-chat-dots', Booking:'bi-calendar-check', Payment:'bi-credit-card', Proposal:'bi-file-earmark-check', Invoice:'bi-receipt', Uptime:'bi-activity', 'Follow-up':'bi-alarm', Task:'bi-check2-square' };
function renderAttention(items) {
  const priority = { danger: 0, warning: 1, info: 2, success: 3 };
  const rows = [...(items || [])].sort((a,b)=>(priority[a.level]??2)-(priority[b.level]??2)).slice(0,6);
  const shell = document.getElementById('dashboard-attention');
  shell.dataset.hasItems = rows.length ? '1' : '0';
  shell.classList.toggle('d-none', rows.length === 0);
  const list = document.getElementById('dashboard-attention-list');
  list.innerHTML = rows.map(item => `<a class="dashboard-attention-item attention-${escapeHtml(item.level)}" href="${escapeHtml(item.href)}" data-notification-key="${escapeHtml(item.key)}"><span class="dashboard-attention-icon"><i class="bi ${ATTENTION_ICONS[item.type]||'bi-bell'}"></i></span><span class="dashboard-attention-copy"><small>${escapeHtml(item.type)}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></span><i class="bi bi-chevron-right"></i></a>`).join('');
  list.querySelectorAll('[data-notification-key]').forEach(link=>link.addEventListener('click',async event=>{event.preventDefault();try{await api.patch(`/api/v1/admin/notifications/${encodeURIComponent(link.dataset.notificationKey)}`,{});}catch(_){}location.href=link.href;}));
}

const REVENUE_ACTION_ICONS = { 'Follow-up':'bi-arrow-repeat', 'Stale lead':'bi-hourglass-split', Proposal:'bi-file-earmark-check', Outreach:'bi-send' };
function renderRevenueActions(feed) {
  const shell = document.getElementById('revenue-runway');
  const list = document.getElementById('revenue-runway-list');
  const items = feed?.items || [];
  const value = summaryMoney(feed?.value_by_currency || [], '');
  document.getElementById('revenue-runway-summary').innerHTML = items.length
    ? `${items.length} direct next move${items.length === 1 ? '' : 's'}${value ? ` protecting <strong>${value}</strong> in visible opportunity value` : ''}.`
    : 'Your immediate queue is clear. Add a next action to an active lead to keep momentum visible.';
  shell.classList.toggle('is-clear', items.length === 0);
  list.innerHTML = items.length ? items.map((item, index) => `<a class="revenue-action" href="${escapeHtml(item.href)}">
    <span class="revenue-action-sequence">${String(index + 1).padStart(2, '0')}</span>
    <span class="revenue-action-icon"><i class="bi ${REVENUE_ACTION_ICONS[item.kind] || 'bi-arrow-right'}"></i></span>
    <span class="revenue-action-copy"><small>${escapeHtml(item.kind)}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></span>
    ${item.value > 0 ? `<span class="revenue-action-value">${escapeHtml(formatAmount(item.value, item.currency))}</span>` : ''}
    <span class="revenue-action-cta">Act now <i class="bi bi-arrow-right"></i></span>
  </a>`).join('') : `<div class="revenue-runway-clear"><i class="bi bi-check2-circle"></i><div><strong>No urgent revenue actions</strong><span>Open the pipeline and schedule the next move for a lead.</span></div><a href="/admin/pipeline.html">Plan next action</a></div>`;
  document.getElementById('welcome-line').textContent = items.length
    ? `${items.length} revenue action${items.length === 1 ? '' : 's'} ready â€” start with the first one.`
    : 'No urgent revenue actions. Use the pipeline to prepare the next move.';
}

// Sales engine scoreboard (sales mode): today's quota progress, streak, and
// a 14-day activity strip. Data comes from the outreach scoreboard endpoint;
// a failure leaves the card at its placeholder dashes rather than breaking
// the rest of the dashboard.
async function loadScoreboard() {
  let s;
  try {
    s = await api.get("/api/v1/admin/outreach/scoreboard");
  } catch (_) {
    return;
  }

  document.getElementById("sb-streak").textContent = s.streak;

  const setBar = (prefix, value, target) => {
    document.getElementById(`sb-${prefix}`).textContent = value;
    document.getElementById(`sb-${prefix}-target`).textContent = target;
    const bar = document.getElementById(`sb-${prefix}-bar`);
    const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
    bar.style.width = `${pct}%`;
    bar.classList.toggle("bg-success", value >= target);
  };
  setBar("emails", s.today.emails, s.targets.emails);
  setBar("calls", s.today.calls, s.targets.calls);

  const social = document.getElementById("sb-social");
  social.textContent = s.today.social ? "posted ✓" : "not yet";
  social.classList.toggle("text-success", s.today.social);
  social.classList.toggle("text-muted-custom", !s.today.social);

  // 14-day strip: bar height = that day's touches relative to the busiest
  // day in the window; a dot-height stub marks a fully idle day. Social-only
  // days still count as activity (min height), matching the streak rule.
  const history = s.history || [];
  const max = Math.max(1, ...history.map(d => d.emails + d.calls));
  document.getElementById("sb-history").innerHTML = history.map(d => {
    const touches = d.emails + d.calls;
    const active = touches > 0 || d.social;
    const h = active ? Math.max(12, Math.round(((touches || 1) / max) * 100)) : 6;
    const label = `${d.date}: ${d.emails} email(s), ${d.calls} call(s)${d.social ? ", social posted" : ""}`;
    return `<div title="${escapeHtml(label)}" style="flex:1;height:${h}%;border-radius:2px;background:${active ? "var(--section-leads)" : "var(--bg-soft)"};${active ? "" : "border:1px solid var(--border-color);"}"></div>`;
  }).join("");
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();
  startDashboardClock(user);

  document.getElementById("welcome-line").textContent =
    `Signed in as ${user.email} — here's how your portfolio is doing.`;

  const [data, notifications] = await Promise.all([api.get("/api/v1/admin/dashboard"), api.get("/api/v1/admin/notifications")]);
  loadScoreboard(); // independent fetch — the scoreboard failing must not blank the dashboard
  renderStats(data);
  renderRecentInquiries(data.recent_inquiries);
  renderDraftProjects(data.draft_projects);
  renderUpcomingAppointments(data.upcoming_appointments);
  renderRecentPayments(data.recent_payments);
  renderRateLimits(data.rate_limit);
  renderAttention(notifications.items);
  let dashboardMode = localStorage.getItem('admin_dashboard_mode') || 'operational';
  document.querySelectorAll('[data-dashboard-mode]').forEach(button => button.addEventListener('click', () => {
    dashboardMode = button.dataset.dashboardMode;
    applyDashboardMode(dashboardMode, data.mode_summaries, user.email);
  }));
  applyDashboardMode(dashboardMode, data.mode_summaries, user.email);
  renderRevenueActions(data.revenue_actions);
})();
