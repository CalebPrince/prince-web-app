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
