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
};

function renderOwner(owner) {
  const initial = esc((owner.name || 'P').trim().charAt(0).toUpperCase());
  document.getElementById('owner-card').innerHTML = `
    <div class="d-flex align-items-center gap-3">
      <div class="owner-avatar" style="background: var(--section-blue-soft); color: var(--section-blue);">${initial}</div>
      <div>
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <h4 class="mb-0">${esc(owner.name)}</h4>
          <span class="badge" style="background: var(--section-blue-soft); color: var(--section-blue); font-weight: 500;">${esc(owner.role)}</span>
        </div>
        <p class="mb-0 small text-muted-custom mt-1">${esc(owner.tagline)}</p>
      </div>
    </div>`;
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
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <span class="fw-semibold fs-5">${Number(a.stat_value).toLocaleString()}</span>
            <span class="small text-muted-custom ms-1">${esc(a.stat_label)}</span>
          </div>
          <a href="${esc(a.manage_url)}" class="btn btn-sm btn-outline-secondary">${esc(a.manage_label)} &rarr;</a>
        </div>
      </div>
    </div>`;
  }).join('');
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  try {
    const data = await api.get('/api/v1/admin/team');
    renderOwner(data.owner);
    renderAgents(data.agents);
  } catch (err) {
    const box = document.getElementById('team-error');
    box.textContent = 'Could not load the team: ' + err.message;
    box.classList.remove('d-none');
  }
})();
