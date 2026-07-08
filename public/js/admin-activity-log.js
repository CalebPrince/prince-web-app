let currentPage = 1;
let currentEntityType = '';

function formatLabel(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const ACTION_PILL_CLASS = {
  deleted: 'rejected',
  created: 'approved',
  approved: 'approved',
  rejected: 'rejected',
  updated: 'audited',
  status_changed: 'submitted',
  pipeline_stage_changed: 'pitch_ready',
};

function formatDetails(entry) {
  const parts = [];
  if (entry.entity_label) parts.push(escapeHtml(entry.entity_label));
  if (entry.details) {
    try {
      const details = JSON.parse(entry.details);
      parts.push(escapeHtml(Object.entries(details).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(', ')));
    } catch (_) {}
  }
  return parts.join(' — ') || '<span class="text-muted-custom">—</span>';
}

async function loadEntityTypes() {
  const types = await api.get('/api/v1/admin/activity-log/entity-types');
  const select = document.getElementById('entity-filter');
  (Array.isArray(types) ? types : []).forEach(type => {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = formatLabel(type);
    select.appendChild(opt);
  });
}

async function loadLog() {
  const qs = new URLSearchParams({ page: currentPage });
  if (currentEntityType) qs.set('entity_type', currentEntityType);

  const response = await api.get(`/api/v1/admin/activity-log?${qs.toString()}`);
  const rows = (response && Array.isArray(response.rows)) ? response.rows : [];
  const total = (response && response.total) || 0;
  const perPage = (response && response.per_page) || 50;
  const tbody = document.getElementById('log-tbody');
  const empty = document.getElementById('empty-state');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted-custom py-4">No activity recorded yet.</td></tr>';
    empty.classList.add('d-none');
  } else {
    empty.classList.add('d-none');
    tbody.innerHTML = rows.map(entry => `
      <tr>
        <td class="ps-3 small text-muted-custom">${new Date(entry.created_at + 'Z').toLocaleString()}</td>
        <td class="small">${escapeHtml(entry.user_email || 'System')}</td>
        <td><span class="status-pill ${ACTION_PILL_CLASS[entry.action] || 'pending'}">${formatLabel(entry.action)}</span></td>
        <td class="small">${formatLabel(entry.entity_type)}${entry.entity_id ? ' #' + escapeHtml(String(entry.entity_id)) : ''}</td>
        <td class="small">${formatDetails(entry)}</td>
      </tr>
    `).join('');
  }

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages} (${total} total)`;
  document.getElementById('prev-page-btn').disabled = currentPage <= 1;
  document.getElementById('next-page-btn').disabled = currentPage >= totalPages;
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  await loadEntityTypes();
  await loadLog();

  document.getElementById('entity-filter').addEventListener('change', e => {
    currentEntityType = e.target.value;
    currentPage = 1;
    loadLog();
  });
  document.getElementById('prev-page-btn').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; loadLog(); }
  });
  document.getElementById('next-page-btn').addEventListener('click', () => {
    currentPage++; loadLog();
  });
})();
