let monitorModal = null;
let editingMonitorId = null;
let clients = [];

function renderUptimeStats(rows) {
  const active = rows.filter(m => m.is_active);
  document.getElementById('stat-up').textContent = active.filter(m => m.last_status === 'up').length;
  document.getElementById('stat-down').textContent = active.filter(m => m.last_status === 'down').length;

  const speeds = active.map(m => m.avg_response_ms).filter(v => v != null);
  document.getElementById('stat-avg').textContent = speeds.length
    ? `${Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)}ms`
    : '—';
  document.getElementById('stat-total').textContent = rows.length;
  document.getElementById('stat-total-sub').textContent = `${active.length} active`;
}

function statusPill(monitor) {
  if (!monitor.is_active) return '<span class="status-pill archived">paused</span>';
  if (!monitor.last_status) return '<span class="status-pill read">waiting for first check</span>';
  return monitor.last_status === 'up'
    ? '<span class="status-pill published">● up</span>'
    : '<span class="status-pill flagged">● down</span>';
}

function pct(value) {
  return value == null ? '—' : `${value}%`;
}

async function loadMonitors() {
  const response = await api.get('/api/v1/admin/uptime');
  const rows = Array.isArray(response) ? response : [];
  renderUptimeStats(rows);
  const tbody = document.getElementById('monitors-tbody');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted-custom py-4">No monitors yet. Add your first site.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(m => `
    <tr>
      <td class="ps-3">
        ${escapeHtml(m.name)}${m.client_name ? `<span class="small text-muted-custom"> · ${escapeHtml(m.client_name)}</span>` : ''}<br>
        <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener" class="small text-muted-custom">${escapeHtml(m.url)}</a>
      </td>
      <td>${statusPill(m)}</td>
      <td>${pct(m.uptime_24h)}</td>
      <td>${pct(m.uptime_30d)}</td>
      <td class="small">${m.avg_response_ms != null ? m.avg_response_ms + 'ms' : '—'}</td>
      <td class="small text-muted-custom">${m.last_checked_at ? new Date(m.last_checked_at + 'Z').toLocaleString() : 'never'}</td>
      <td class="text-end pe-3 text-nowrap">
        <button class="btn btn-sm btn-outline-secondary edit-btn" data-id="${m.id}">Edit</button>
        <button class="btn btn-sm btn-outline-secondary toggle-btn ms-1" data-id="${m.id}" data-active="${m.is_active}">${m.is_active ? 'Pause' : 'Resume'}</button>
        <button class="btn btn-sm btn-outline-danger delete-btn ms-1" data-id="${m.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const monitor = rows.find(m => m.id === Number(btn.dataset.id));
      if (monitor) openMonitorModal(monitor);
    });
  });

  tbody.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api.patch(`/api/v1/admin/uptime/${btn.dataset.id}`, { is_active: btn.dataset.active !== '1' });
        await loadMonitors();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this monitor and its check history?')) return;
      try {
        await api.delete(`/api/v1/admin/uptime/${btn.dataset.id}`);
        await loadMonitors();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function openMonitorModal(monitor = null) {
  editingMonitorId = monitor ? monitor.id : null;
  document.getElementById('monitor-form').reset();
  document.getElementById('monitor-msg').classList.add('d-none');
  document.getElementById('monitor-modal-title').textContent = monitor ? 'Edit Monitor' : 'Add Monitor';

  const select = document.getElementById('monitor-client');
  select.innerHTML = '<option value="">— None —</option>'
    + clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.email)})</option>`).join('');

  if (monitor) {
    document.getElementById('monitor-name').value = monitor.name;
    document.getElementById('monitor-url').value = monitor.url;
    select.value = monitor.client_id || '';
  }
  monitorModal.show();
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  monitorModal = new bootstrap.Modal(document.getElementById('monitor-modal'));

  try {
    const clientRows = await api.get('/api/v1/admin/clients');
    clients = Array.isArray(clientRows) ? clientRows : [];
  } catch (_) {
    clients = []; // monitors work fine without client links
  }

  document.getElementById('new-monitor-btn').addEventListener('click', () => openMonitorModal());

  document.getElementById('monitor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('monitor-msg');
    msg.classList.add('d-none');

    const payload = {
      name: document.getElementById('monitor-name').value,
      url: document.getElementById('monitor-url').value,
      client_id: document.getElementById('monitor-client').value || null,
    };

    try {
      if (editingMonitorId) {
        await api.patch(`/api/v1/admin/uptime/${editingMonitorId}`, payload);
      } else {
        await api.post('/api/v1/admin/uptime', payload);
      }
      monitorModal.hide();
      await loadMonitors();
    } catch (err) {
      msg.className = 'alert alert-danger py-2 small';
      msg.textContent = err.message;
      msg.classList.remove('d-none');
    }
  });

  await loadMonitors();
})();
