const selectedIds = new Set();

function updateBulkToolbar() {
  const toolbar = document.getElementById('bulk-toolbar');
  const count = selectedIds.size;
  toolbar.classList.toggle('d-none', count === 0);
  toolbar.classList.toggle('d-flex', count > 0);
  document.getElementById('bulk-count').textContent = `${count} selected`;

  const rowChecks = document.querySelectorAll('.row-checkbox');
  const selectAll = document.getElementById('select-all-checkbox');
  if (rowChecks.length === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  } else {
    const checkedCount = [...rowChecks].filter(cb => cb.checked).length;
    selectAll.checked = checkedCount === rowChecks.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < rowChecks.length;
  }
}

async function loadSubscribers() {
  const response = await api.get('/api/v1/admin/newsletter');
  const rows = Array.isArray(response) ? response : [];
  const tbody = document.getElementById('subscribers-tbody');
  const empty = document.getElementById('empty-state');

  selectedIds.clear();

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted-custom py-4">No subscribers yet.</td></tr>';
    empty.classList.add('d-none');
    updateBulkToolbar();
    return;
  }
  empty.classList.add('d-none');

  const renderPage = pageRows => {
    tbody.innerHTML = pageRows.map(s => `
    <tr>
      <td class="ps-3"><input type="checkbox" class="form-check-input row-checkbox" data-id="${s.id}"></td>
      <td>${escapeHtml(s.email)}</td>
      <td><span class="status-pill ${s.status === 'subscribed' ? 'published' : 'archived'}">${s.status}</span></td>
      <td class="small text-muted-custom">${new Date(s.created_at).toLocaleDateString()}</td>
      <td class="text-end pe-3">
        <button class="btn btn-sm btn-outline-danger remove-btn" data-id="${s.id}">Remove</button>
      </td>
    </tr>
    `).join('');

    tbody.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this subscriber?')) return;
        await api.delete(`/api/v1/admin/newsletter/${btn.dataset.id}`);
        await loadSubscribers();
      });
    });

    tbody.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id;
        if (cb.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        updateBulkToolbar();
      });
    });

    updateBulkToolbar();
  };

  AdminPagination.page('newsletter-subscribers', rows, renderPage, { anchor: document.getElementById('pagination') });
}

async function loadNewsletterDrafts() {
  const el = document.getElementById('newsletter-drafts');
  const rows = await api.get('/api/v1/admin/newsletter-drafts');
  if (!rows.length) {
    el.innerHTML = '<div class="small text-muted-custom">No blog announcements queued yet.</div>';
    return;
  }
  el.innerHTML = rows.map(d => `
    <article class="border rounded p-3 mb-2">
      <div class="d-flex justify-content-between gap-2 mb-2">
        <strong>${escapeHtml(d.subject_line || d.article_title)}</strong>
        <span class="status-pill ${d.status === 'drafted' ? 'published' : d.status === 'failed' ? 'archived' : 'draft'}">${escapeHtml(d.status)}</span>
      </div>
      <div class="small text-muted-custom mb-2">Promotes: <a href="${escapeHtml(d.article_url)}" target="_blank" rel="noopener">${escapeHtml(d.article_title)}</a></div>
      ${d.email_body ? `<div class="small" style="white-space:pre-wrap">${escapeHtml(d.email_body)}</div>` : `<div class="small text-muted-custom">${escapeHtml(d.error_note || 'Waiting for the newsletter drafting cron.')}</div>`}
    </article>
  `).join('');
}

document.getElementById('select-all-checkbox').addEventListener('change', (e) => {
  document.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.checked = e.target.checked;
    if (e.target.checked) selectedIds.add(cb.dataset.id);
    else selectedIds.delete(cb.dataset.id);
  });
  updateBulkToolbar();
});

document.getElementById('bulk-clear-btn').addEventListener('click', () => {
  selectedIds.clear();
  document.querySelectorAll('.row-checkbox').forEach(cb => { cb.checked = false; });
  updateBulkToolbar();
});

document.getElementById('bulk-remove-btn').addEventListener('click', async () => {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  if (!confirm(`Remove ${ids.length} subscriber${ids.length === 1 ? '' : 's'}?`)) return;

  const btn = document.getElementById('bulk-remove-btn');
  btn.disabled = true;
  try {
    await Promise.all(ids.map(id => api.delete(`/api/v1/admin/newsletter/${id}`)));
    await loadSubscribers();
  } catch (err) {
    alert(err.message || 'Could not remove selected subscribers.');
    await loadSubscribers();
  } finally {
    btn.disabled = false;
  }
});

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  await Promise.all([loadSubscribers(), loadNewsletterDrafts()]);
})();
