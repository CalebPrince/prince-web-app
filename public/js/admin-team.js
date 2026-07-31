// Team roster: the owner plus the AI agents, fetched live from
// /api/v1/admin/team so each agent's configured name, status and headline stat
// are real, not hardcoded.

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// status -> { colour, label fallback }. Colours read fine in light and dark.
const STATUS_COLOR = {
  active: '#10b981',
  standby: '#f59e0b',
  ondemand: '#0ea5e9',
  building: '#3b82f6',
  paused: '#9ca3af',
};

// A soft accent per agent so the avatars aren't all one colour.
const AGENT_ACCENT = {
  lisa: 'var(--section-leads)',
  nurturer: 'var(--section-content)',
  beacon: 'var(--section-blue)',
  proposal: 'var(--section-money)',
  content: 'var(--section-content)',
  arch: 'var(--section-blue)',
  // Money accent — she works on invoices and payment paperwork.
  ada: 'var(--section-money)',
  // System accent — reports on the team rather than working for clients.
  chief: 'var(--section-system)',
  // Content accent — brainstorming/ideation sits alongside Danielle's bucket.
  scout: 'var(--section-content)',
};

const CAPACITY_LABEL = { clear: 'Clear', available: 'Available', focused: 'Focused', full: 'At capacity' };

function capacityDate(value) {
  if (!value) return 'No deadline set';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function renderCapacityProjects(capacity) {
  if (!capacity.projects?.length) return '<div class="team-capacity-empty">No active project assignments.</div>';
  return `<div class="team-capacity-projects">${capacity.projects.map(project => `
    <a href="/admin/projects.html?edit=${Number(project.id)}" class="${project.is_overdue ? 'is-overdue' : ''}">
      <span>${esc(project.title)}</span><small>${project.next_deadline ? `${project.is_overdue ? 'Overdue' : 'Due'} ${capacityDate(project.next_deadline)}` : `${Number(project.progress_percent)}% complete`}</small>
    </a>`).join('')}</div>`;
}

function capacityBlock(capacity, compact = false) {
  const level = capacity.level || 'clear';
  return `<div class="team-capacity ${compact ? 'is-compact' : ''}" data-capacity="${esc(level)}">
    <div class="team-capacity-head"><span><i></i>${CAPACITY_LABEL[level] || 'Clear'}</span><strong>${Number(capacity.active_projects || 0)} active</strong></div>
    <div class="team-capacity-facts"><span>${Number(capacity.overdue_projects || 0)} overdue</span><span>${Number(capacity.due_soon || 0)} due in 14 days</span><span>${capacityDate(capacity.next_deadline)}</span></div>
    ${renderCapacityProjects(capacity)}
  </div>`;
}

function renderCapacitySummary(summary) {
  document.getElementById('team-capacity-summary').innerHTML = `
    <div class="team-capacity-summary-intro"><span>Delivery capacity</span><small>Live workload from operational projects and milestones</small></div>
    <div><span>Active projects</span><strong>${Number(summary.active_projects || 0)}</strong></div>
    <div><span>Overdue</span><strong class="${Number(summary.overdue_projects) ? 'is-alert' : ''}">${Number(summary.overdue_projects || 0)}</strong></div>
    <div><span>Due in 14 days</span><strong>${Number(summary.due_soon || 0)}</strong></div>
    <div><span>Without AI support</span><strong>${Number(summary.unassigned_projects || 0)}</strong></div>`;
}

function renderOwner(owner) {
  const initial = esc((owner.name || 'P').trim().charAt(0).toUpperCase());
  document.getElementById('owner-card').innerHTML = `
    <div class="d-flex align-items-center gap-3">
      <div class="owner-avatar" style="background: var(--section-blue-soft); color: var(--section-blue);">${initial}</div>
      <div class="flex-grow-1">
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <h4 class="mb-0">${esc(owner.name)}</h4>
          <span class="badge" style="background: var(--section-blue-soft); color: var(--section-blue); font-weight: 500;">${esc(owner.role)}</span>
        </div>
        <p class="mb-0 small text-muted-custom mt-1">${esc(owner.tagline)}</p>
      </div>
    </div>
    ${capacityBlock(owner.capacity || {}, false)}`;
}

function renderAgents(agents) {
  const list = document.getElementById('agents-list');
  list.innerHTML = agents.map(a => {
    const color = STATUS_COLOR[a.status] || '#9ca3af';
    const accent = AGENT_ACCENT[a.key] || 'var(--section-leads)';
    return `
    <div class="col-md-6 col-xl-4">
      <div class="admin-card p-3 h-100 d-flex flex-column">
        <div class="d-flex align-items-start gap-3 mb-2">
          <div class="agent-avatar" style="background: color-mix(in srgb, ${accent} 14%, transparent); color: ${accent};"><i class="bi ${esc(a.icon)}"></i></div>
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between align-items-start">
              <h5 class="mb-0">${esc(a.name)}</h5>
              <span class="small" style="white-space:nowrap;"><span class="status-dot" style="background:${color};"></span>${esc(a.status_label)}</span>
            </div>
            <div class="small text-muted-custom">${esc(a.role)}</div>
          </div>
        </div>
        <p class="small text-muted-custom flex-grow-1">${esc(a.description)}</p>
        ${capacityBlock(a.capacity || {}, true)}
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <span class="fw-semibold fs-5">${Number(a.stat_value).toLocaleString()}</span>
            <span class="small text-muted-custom ms-1">${esc(a.stat_label)}</span>
            ${a.secondary_stat_value != null ? `<div class="small text-muted-custom">${Number(a.secondary_stat_value).toLocaleString()} ${esc(a.secondary_stat_label)}</div>` : ''}
          </div>
          <a href="${esc(a.manage_url)}" class="btn btn-sm btn-outline-secondary">${esc(a.manage_label)} &rarr;</a>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ---- Chief's daily brief ----------------------------------------------------

function briefDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function renderDailyBrief(brief) {
  const card = document.getElementById('daily-brief-card');
  const head = `<div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-2">
      <div>
        <span class="brief-kicker text-muted-custom">DAILY BRIEF${brief ? ` — ${esc(briefDate(brief.brief_date))}` : ''}</span>
        <h4 class="mb-0 mt-1">${brief ? esc(brief.headline) : 'No brief yet'}</h4>
      </div>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="brief-run-btn">Write today&rsquo;s brief</button>
    </div>`;

  if (!brief) {
    card.innerHTML = `${head}
      <p class="small text-muted-custom mb-0">Chief writes one of these a day — what every other agent actually did, what looks broken, and what is waiting on you. Schedule <code>database/send_daily_brief.php</code> daily, or write one now.</p>`;
  } else {
    card.innerHTML = `${head}
      <p class="brief-body">${esc(brief.body)}</p>
      <div class="small text-muted-custom mt-3">
        ${brief.provider ? 'Written by Chief' : 'Written from the raw counts — no AI provider answered'}${brief.emailed_at ? ' &middot; emailed to you' : ' &middot; not emailed'}
      </div>`;
  }

  document.getElementById('brief-run-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Writing…';
    try {
      const res = await api.post('/api/v1/admin/chief/brief', { hours: 24 });
      renderDailyBrief(res.brief);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Write today’s brief';
      const box = document.getElementById('team-error');
      box.textContent = 'Could not write the brief: ' + err.message;
      box.classList.remove('d-none');
    }
  });
}

// ---- Chief's customizable reporting dashboard -----------------------------

const CHIEF_VIEW_KEY = 'chief-reporting-view-v1';
let chiefData = null;

function chiefPreferences() {
  try {
    return { window: '24', focus: 'all', ...JSON.parse(localStorage.getItem(CHIEF_VIEW_KEY) || '{}') };
  } catch (_) {
    return { window: '24', focus: 'all' };
  }
}

function saveChiefPreferences() {
  localStorage.setItem(CHIEF_VIEW_KEY, JSON.stringify({
    window: document.getElementById('chief-window').value,
    focus: document.getElementById('chief-focus').value,
  }));
}

function chiefAgents(snapshot) {
  const focus = document.getElementById('chief-focus').value;
  return (snapshot.agents || []).filter(agent => {
    if (focus === 'active') return Number(agent.actions || 0) > 0;
    if (focus === 'always_on') return agent.runs === 'always_on';
    if (focus === 'on_demand') return agent.runs === 'on_demand';
    return true;
  });
}

function renderChiefDashboard(data) {
  chiefData = data;
  const snapshot = data.snapshot || {};
  const agents = chiefAgents(snapshot);
  const agentActions = agents.reduce((sum, agent) => sum + Number(agent.actions || 0), 0);
  const worked = agents.filter(agent => Number(agent.actions || 0) > 0).length;
  const commandCenter = snapshot.command_center || {};
  const waiting = snapshot.waiting_on_you || [];
  const waitingTotal = waiting.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const maxActions = Math.max(1, ...agents.map(agent => Number(agent.actions || 0)));
  const period = document.getElementById('chief-window').selectedOptions[0].textContent;

  const agentRows = agents.length ? agents.map(agent => {
    const meaningful = (agent.did || []).filter(item => !item.context && Number(item.count) > 0);
    const detail = meaningful.length
      ? meaningful.map(item => `${Number(item.count)} ${esc(item.label)}`).join(' · ')
      : esc(agent.config_note || `No recorded output in ${period.toLowerCase()}.`);
    const width = Math.max(2, Math.round((Number(agent.actions || 0) / maxActions) * 100));
    return `<div class="chief-agent-row">
      <div><b>${esc(agent.name)}</b><small>${esc(agent.role)} · ${esc(agent.state)}</small></div>
      <div class="chief-bar-wrap"><div class="chief-bar" aria-label="${Number(agent.actions || 0)} actions"><i style="width:${width}%"></i></div><span>${detail}</span></div>
      <strong>${Number(agent.actions || 0)}</strong>
    </div>`;
  }).join('') : '<p class="small text-muted-custom mb-0">No agents match this focus.</p>';

  const queueRows = waiting.length ? waiting.map(item =>
    `<a href="${esc(item.url)}"><span>${esc(item.label)}</span><strong>${Number(item.count)}</strong></a>`
  ).join('') : '<p class="small text-muted-custom mb-0">Nothing is waiting for your review.</p>';
  const commandRows = (commandCenter.did || []).length
    ? `<div class="mt-4"><span class="brief-kicker text-muted-custom">COMMAND CENTER</span><div class="chief-queue mt-2">${commandCenter.did.map(item =>
        `<div class="d-flex justify-content-between small"><span>${esc(item.label)}</span><strong>${Number(item.count)}</strong></div>`
      ).join('')}</div></div>`
    : '';
  const history = (data.briefs || []).length
    ? `<div class="chief-brief-history"><span class="brief-kicker text-muted-custom align-self-center me-1">RECENT BRIEFS</span>${data.briefs.map(brief =>
        `<a href="#daily-brief-card" data-brief-date="${esc(brief.brief_date)}"><strong>${esc(brief.brief_date)}</strong><br>${esc(brief.headline)}</a>`
      ).join('')}</div>` : '';

  document.getElementById('chief-dashboard-body').innerHTML = `
    <div class="chief-metrics">
      <div class="chief-metric"><strong>${agentActions}</strong><span>Agent actions in view</span></div>
      <div class="chief-metric"><strong>${worked}/${agents.length}</strong><span>Selected agents active</span></div>
      <div class="chief-metric"><strong>${Number(commandCenter.actions || 0)}</strong><span>Your command-center actions</span></div>
      <div class="chief-metric"><strong>${waitingTotal}</strong><span>Items waiting on you</span></div>
    </div>
    <div class="chief-readout">
      <div class="chief-panel"><div class="d-flex justify-content-between align-items-center mb-2"><span class="brief-kicker text-muted-custom">VERIFIED TEAM OUTPUT · ${esc(period.toUpperCase())}</span><small class="text-muted-custom">${esc(snapshot.since || '')}</small></div>${agentRows}</div>
      <aside class="chief-panel"><span class="brief-kicker text-muted-custom">WAITING ON YOU</span><div class="chief-queue mt-2">${queueRows}</div>${commandRows}</aside>
    </div>${history}`;

  document.querySelectorAll('[data-brief-date]').forEach(link => link.addEventListener('click', async () => {
    try {
      const result = await api.get(`/api/v1/admin/chief/brief?date=${encodeURIComponent(link.dataset.briefDate)}`);
      renderDailyBrief(result.brief || null);
    } catch (err) {
      const box = document.getElementById('team-error');
      box.textContent = 'Could not open that brief: ' + err.message;
      box.classList.remove('d-none');
    }
  }));
}

async function loadChiefDashboard() {
  const body = document.getElementById('chief-dashboard-body');
  body.setAttribute('aria-busy', 'true');
  try {
    const hours = document.getElementById('chief-window').value;
    renderChiefDashboard(await api.get(`/api/v1/admin/chief/dashboard?hours=${encodeURIComponent(hours)}`));
  } catch (err) {
    body.innerHTML = `<div class="p-4 text-danger">Could not load Chief's report: ${esc(err.message)}</div>`;
  } finally {
    body.removeAttribute('aria-busy');
  }
}

function initChiefDashboard() {
  const preferences = chiefPreferences();
  const windowSelect = document.getElementById('chief-window');
  const focusSelect = document.getElementById('chief-focus');
  windowSelect.value = preferences.window;
  focusSelect.value = preferences.focus;
  windowSelect.addEventListener('change', () => { saveChiefPreferences(); loadChiefDashboard(); });
  focusSelect.addEventListener('change', () => { saveChiefPreferences(); if (chiefData) renderChiefDashboard(chiefData); });
  loadChiefDashboard();
}

function activityDate(value) {
  if (!value) return 'Not revised';
  const date = new Date(value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function renderArchActivity(items) {
  const list = document.getElementById('arch-activity-list');
  if (!items.length) {
    list.innerHTML = '<div class="arch-activity-empty"><i class="bi bi-window-stack"></i><span>No Arch sites recorded yet.</span><small>Generated sites and client revision requests will appear here.</small></div>';
    return;
  }
  list.innerHTML = items.map(item => {
    const client = item.client_name || item.client_email || 'Visitor details not provided';
    const revised = Number(item.revision_count || 0) > 0;
    return `<article class="arch-activity-row">
      <div class="arch-activity-site">
        <span class="arch-site-mark"><i class="bi bi-window"></i></span>
        <div><strong>${esc(item.business_name)}</strong><small>${esc(item.business_type || item.slug)}</small></div>
      </div>
      <div class="arch-activity-client"><span>Client</span><strong>${esc(client)}</strong>${item.client_name && item.client_email ? `<small>${esc(item.client_email)}</small>` : ''}</div>
      <div class="arch-activity-revision">
        <span>${revised ? `${Number(item.revision_count)} revision${Number(item.revision_count) === 1 ? '' : 's'}` : 'No revisions'}</span>
        <strong>${revised ? esc(item.latest_feedback) : 'Client accepted the first preview'}</strong>
        <small>${revised ? `Last changed ${esc(activityDate(item.latest_revision_at))}` : `Built ${esc(activityDate(item.created_at))}`}</small>
      </div>
      <div class="arch-activity-actions">
        ${item.has_cms ? '<span class="arch-cms-pill">CMS</span>' : ''}
        <a href="${esc(item.preview_url)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-secondary">Preview <i class="bi bi-box-arrow-up-right"></i></a>
        <a href="${esc(item.download_url)}" class="btn btn-sm btn-outline-secondary" title="Download deployable package"><i class="bi bi-download"></i></a>
      </div>
    </article>`;
  }).join('');
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();
  try {
    const data = await api.get('/api/v1/admin/team');
    renderCapacitySummary(data.capacity_summary || {});
    renderOwner(data.owner);
    renderAgents(data.agents);
    renderArchActivity(data.arch_activity || []);
  } catch (err) {
    const box = document.getElementById('team-error');
    box.textContent = 'Could not load the team: ' + err.message;
    box.classList.remove('d-none');
  }
})();
