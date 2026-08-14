let latestRuns = [];

function roadmapStatusPill(row) {
  if (!row.reachable) return '<span class="status-pill flagged">unreachable</span>';
  if (row.score == null) return '<span class="status-pill read">no AI narrative</span>';
  return '<span class="status-pill published">reachable</span>';
}

async function loadRoadmapHistory() {
  const rows = await api.get('/api/v1/admin/growth-roadmap');
  latestRuns = Array.isArray(rows) ? rows : [];
  const tbody = document.getElementById('roadmap-history-tbody');

  if (latestRuns.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted-custom py-4">No roadmaps run yet.</td></tr>';
    return;
  }

  tbody.innerHTML = latestRuns.map(r => `
    <tr>
      <td class="ps-3"><a href="#" class="view-run-link" data-id="${r.id}">${escapeHtml(r.final_url || r.url)}</a></td>
      <td>${roadmapStatusPill(r)}</td>
      <td>${r.score != null ? r.score + ' / 100' : '—'}</td>
      <td class="small text-muted-custom">${r.created_at ? new Date(r.created_at + 'Z').toLocaleString() : ''}</td>
      <td class="text-end pe-3">
        <button class="btn btn-sm btn-outline-danger delete-run-btn" data-id="${r.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.view-run-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const row = await api.get(`/api/v1/admin/growth-roadmap/${link.dataset.id}`);
      renderRoadmapResult(row);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  tbody.querySelectorAll('.delete-run-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this roadmap run?')) return;
      try {
        await api.delete(`/api/v1/admin/growth-roadmap/${btn.dataset.id}`);
        await loadRoadmapHistory();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function findingCards(items) {
  if (!items || !items.length) return '<p class="text-muted-custom small mb-0">Nothing flagged here.</p>';
  return items.map((item, i) => `
    <div class="transcript-card${i % 2 === 1 ? ' is-agent' : ''}">
      <span>${escapeHtml(item.finding)}</span>
      <p>${escapeHtml(item.detail)}</p>
    </div>
  `).join('');
}

function renderRoadmapResult(data) {
  const container = document.getElementById('roadmap-result');
  const url = data.final_url || data.url;

  if (!data.reachable) {
    container.innerHTML = `
      <div class="admin-card p-4">
        <div class="alert alert-warning mb-0">Could not audit <strong>${escapeHtml(url)}</strong>: ${escapeHtml(data.error || 'unreachable')}</div>
      </div>`;
    return;
  }

  const findings = data.findings;
  if (!findings) {
    container.innerHTML = `
      <div class="admin-card p-4">
        <div class="alert alert-warning mb-0">Site was reachable, but the AI narrative could not be generated: ${escapeHtml(data.error || 'unknown error')}</div>
      </div>`;
    return;
  }

  const signals = data.signals || {};
  const tracking = (signals.tracking_tags || []).length
    ? signals.tracking_tags.join(', ')
    : 'none detected';

  container.innerHTML = `
    <div class="workflow-mockup" aria-label="Growth roadmap result for ${escapeHtml(url)}">
      <aside class="workflow-rail">
        <div class="workflow-brand"><span>P</span><strong>Growth Roadmap</strong></div>
        <nav aria-label="Result navigation">
          <span class="active">Findings <b>${findings.traffic.length + findings.conversion.length + findings.tracking.length}</b></span>
          <span>Traffic</span>
          <span>Conversion</span>
          <span>Tracking</span>
        </nav>
        <div class="rail-status"><span class="status-dot is-live"></span><div><strong>Real audit</strong><small>${escapeHtml(tracking)}</small></div></div>
      </aside>
      <div class="workflow-main">
        <header class="workflow-topbar">
          <div><span class="mock-breadcrumb">${escapeHtml(url)}</span><h3>${escapeHtml(findings.summary || 'Roadmap findings')}</h3></div>
          <span class="window-chip ${signals.uses_https ? 'is-success' : ''}">${signals.uses_https ? 'HTTPS OK' : 'No HTTPS'}</span>
        </header>
        <div class="workflow-grid">
          <div class="workflow-conversation">
            <div class="conversation-meta"><span class="call-avatar">TR</span><div><strong>Traffic</strong><small>Readiness signals, not visitor counts</small></div></div>
            ${findingCards(findings.traffic)}
            <div class="conversation-meta mt-3"><span class="call-avatar">CV</span><div><strong>Conversion</strong><small>What happens once someone lands</small></div></div>
            ${findingCards(findings.conversion)}
            <div class="conversation-meta mt-3"><span class="call-avatar">TK</span><div><strong>Tracking</strong><small>Detected tags: ${escapeHtml(tracking)}</small></div></div>
            ${findingCards(findings.tracking)}
            <div class="confidence-row"><span>Overall growth score</span><span>${findings.score} / 100</span></div>
          </div>
          <aside class="workflow-actions">
            <span class="mock-label">Recommended next steps</span>
            ${(findings.recommendations || []).map(r => `
              <div class="action-row"><span class="task-check">✓</span><div><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(r.detail)}</small></div></div>
            `).join('')}
            <div class="action-summary"><span>Response time</span><strong>${signals.response_time_ms != null ? signals.response_time_ms + 'ms' : '—'}</strong></div>
          </aside>
        </div>
      </div>
    </div>`;
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById('roadmap-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('roadmap-msg');
    const submitBtn = document.getElementById('roadmap-submit');
    msg.classList.add('d-none');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Running…';

    try {
      const data = await api.post('/api/v1/admin/growth-roadmap', {
        url: document.getElementById('roadmap-url').value,
      });
      renderRoadmapResult(data);
      await loadRoadmapHistory();
    } catch (err) {
      msg.className = 'alert alert-danger py-2 small mt-3';
      msg.textContent = err.message;
      msg.classList.remove('d-none');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Run roadmap';
    }
  });

  await loadRoadmapHistory();
})();
