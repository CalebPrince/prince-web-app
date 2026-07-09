const SEVERITY_CLASS = {
  fatal: 'rejected',
  error: 'rejected',
  warning: 'pending',
  notice: 'submitted',
  info: 'audited',
};

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes);
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function renderSources(sources) {
  const select = document.getElementById('source-filter');
  const previous = select.value;
  select.innerHTML = '<option value="">All readable logs</option>' + sources.map(source => `
    <option value="${escapeHtml(source.id)}">${escapeHtml(source.label)}${source.readable ? '' : ' (unreadable/missing)'}</option>
  `).join('');
  select.value = previous;

  const readable = sources.filter(source => source.readable);
  document.getElementById('sources-summary').innerHTML = readable.length
    ? readable.map(source => `${escapeHtml(source.label)}: ${fmtBytes(source.size)}${source.modified_at ? `, updated ${new Date(source.modified_at).toLocaleString()}` : ''}`).join(' · ')
    : 'No readable log files were found in the known app/public/storage locations.';
}

function renderEntries(entries) {
  const list = document.getElementById('logs-list');
  document.getElementById('empty-state').classList.toggle('d-none', entries.length > 0);
  list.innerHTML = entries.map(entry => `
    <div class="admin-card p-3 mb-2">
      <div class="d-flex flex-wrap justify-content-between gap-2 mb-2">
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <span class="status-pill ${SEVERITY_CLASS[entry.severity] || 'pending'}">${escapeHtml(entry.severity || 'info')}</span>
          <span class="fw-semibold">${escapeHtml(entry.source_label || 'Log')}</span>
        </div>
        <span class="small text-muted-custom">${entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'No timestamp'}</span>
      </div>
      <pre class="mb-0 small" style="white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow:auto;">${escapeHtml(entry.message || '')}</pre>
    </div>
  `).join('');
}

async function loadLogs() {
  const msg = document.getElementById('error-msg');
  msg.classList.add('d-none');
  const qs = new URLSearchParams({
    source: document.getElementById('source-filter').value,
    severity: document.getElementById('severity-filter').value,
    q: document.getElementById('query-filter').value.trim(),
    limit: document.getElementById('limit-filter').value,
  });

  try {
    const response = await api.get(`/api/v1/admin/error-logs?${qs.toString()}`);
    renderSources(response.sources || []);
    renderEntries(response.entries || []);
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.remove('d-none');
  }
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById('refresh-btn').addEventListener('click', loadLogs);
  ['source-filter', 'severity-filter', 'limit-filter'].forEach(id => {
    document.getElementById(id).addEventListener('change', loadLogs);
  });
  document.getElementById('query-filter').addEventListener('input', () => {
    clearTimeout(window.__errorLogSearchTimer);
    window.__errorLogSearchTimer = setTimeout(loadLogs, 300);
  });

  await loadLogs();
})();
