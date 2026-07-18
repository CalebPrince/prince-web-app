let inviteModal = null;
let clientModal = null;
let currentClientId = null;
let clientsCache = [];

function formatAmount(subunits, currency) {
  return `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function clientInitials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2)
    .map(part => part[0] || '').join('').toUpperCase();
}

function renderClientStats(rows) {
  document.getElementById('stat-total').textContent = rows.length;
  document.getElementById('stat-portal').textContent = rows.filter(c => c.has_password).length;
  document.getElementById('stat-active').textContent = rows.filter(c => Number(c.is_active)).length;
}

function renderClients() {
  const tbody = document.getElementById('clients-tbody');
  const empty = document.getElementById('clients-empty');
  const query = document.getElementById('client-search').value.trim().toLowerCase();
  const filter = document.getElementById('client-filter').value;
  const rows = clientsCache.filter(c => {
    const matchesQuery = !query || [c.name, c.email, c.phone]
      .some(value => String(value || '').toLowerCase().includes(query));
    const matchesFilter = filter === 'all'
      || (filter === 'active' && Number(c.is_active))
      || (filter === 'invited' && !c.has_password && Number(c.is_active))
      || (filter === 'deactivated' && !Number(c.is_active));
    return matchesQuery && matchesFilter;
  });

  if (!rows.length) {
    tbody.innerHTML = '';
    empty.classList.remove('d-none');
    document.getElementById('clients-empty-title').textContent = clientsCache.length ? 'No matching clients' : 'No clients yet';
    document.getElementById('clients-empty-copy').textContent = clientsCache.length ? 'Try another search or account filter.' : 'Invite a client to give them access to proposals, files, and messages.';
    return;
  }
  empty.classList.add('d-none');

  tbody.innerHTML = rows.map(c => `
    <tr class="client-row" data-id="${c.id}" tabindex="0" aria-label="Open ${escapeHtml(c.name)}">
      <td class="ps-3"><div class="d-flex align-items-center gap-2"><div class="client-avatar">${escapeHtml(clientInitials(c.name))}</div><div><div class="client-name">${escapeHtml(c.name)}</div><div class="small text-muted-custom">${escapeHtml(c.email)}${c.phone ? " · " + escapeHtml(c.phone) : ""}</div></div></div></td>
      <td><span class="status-pill ${c.has_password ? 'published' : 'unread'}">${c.has_password ? 'Active' : 'Invited'}</span></td>
      <td>${c.proposal_count || 0}</td>
      <td class="small text-muted-custom">${c.last_proposal_at ? new Date(c.last_proposal_at).toLocaleDateString() : '—'}</td>
      <td><span class="status-pill ${c.is_active ? 'published' : 'archived'}">${c.is_active ? 'Active' : 'Deactivated'}</span></td>
      <td class="text-end pe-3 client-actions">
        <button class="btn btn-sm btn-outline-secondary view-client-btn" data-id="${c.id}">Open</button>
        <div class="dropdown d-inline-block">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-label="More actions for ${escapeHtml(c.name)}"><i class="bi bi-three-dots"></i></button>
          <ul class="dropdown-menu dropdown-menu-end client-action-menu">
            <li><button class="dropdown-item toggle-active-btn" data-id="${c.id}" data-active="${c.is_active}">${c.is_active ? 'Deactivate account' : 'Reactivate account'}</button></li>
            <li><hr class="dropdown-divider"></li>
            <li><button class="dropdown-item text-danger delete-client-btn" data-id="${c.id}">Delete permanently</button></li>
          </ul>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.view-client-btn').forEach(btn => {
    btn.addEventListener('click', () => openClientDetail(btn.dataset.id));
  });
  tbody.querySelectorAll('.client-row').forEach(row => {
    row.addEventListener('click', event => {
      if (!event.target.closest('button, a, .dropdown-menu')) openClientDetail(row.dataset.id);
    });
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter') openClientDetail(row.dataset.id);
    });
  });

  tbody.querySelectorAll('.delete-client-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm("Delete this client permanently? This removes their portal account, files, and messages. This can't be undone.")) return;
      try {
        await api.delete(`/api/v1/admin/clients/${btn.dataset.id}`);
        await loadClients();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  tbody.querySelectorAll('.toggle-active-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nowActive = btn.dataset.active === '1' || btn.dataset.active === 'true';
      try {
        await api.patch(`/api/v1/admin/clients/${btn.dataset.id}`, { is_active: !nowActive });
        await loadClients();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function loadClients() {
  const tbody = document.getElementById('clients-tbody');
  const error = document.getElementById('clients-error');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted-custom py-5"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Loading clients…</td></tr>';
  error.classList.add('d-none');
  try {
    clientsCache = await api.get('/api/v1/admin/clients');
    renderClientStats(clientsCache);
    renderClients();
  } catch (err) {
    tbody.innerHTML = '';
    error.textContent = err.message || 'Clients could not be loaded. Refresh the page to try again.';
    error.classList.remove('d-none');
  }
}

function renderProposals(proposals) {
  if (!proposals.length) {
    return '<div class="text-muted-custom small">No proposals for this client yet.</div>';
  }
  return proposals.map(p => `
    <div class="admin-card p-3 mb-2">
      <div class="d-flex justify-content-between">
        <div class="fw-semibold">${escapeHtml(p.title)}</div>
        <span class="status-pill ${p.status === 'accepted' ? 'published' : 'unread'}">${escapeHtml(p.status)}</span>
      </div>
      <div class="small text-muted-custom">${formatAmount(p.total_amount, p.currency)}</div>
    </div>
  `).join('');
}

function renderFiles(files) {
  if (!files.length) {
    return '<div class="text-muted-custom small">No files yet.</div>';
  }
  return files.map(f => `
    <div class="d-flex justify-content-between align-items-center admin-card p-2">
      <a href="${escapeHtml(f.file_path)}" target="_blank" rel="noopener">${escapeHtml(f.original_name)}</a>
      <span class="small text-muted-custom">${f.uploaded_by === 'admin' ? 'Sent by you' : 'From client'} · ${new Date(f.created_at).toLocaleDateString()}</span>
    </div>
  `).join('');
}

function renderMessages(messages) {
  const thread = document.getElementById('detail-messages-thread');
  if (!messages.length) {
    thread.innerHTML = '<div class="text-muted-custom small">No messages yet.</div>';
    return;
  }
  thread.innerHTML = messages.map(m => `
    <div class="d-flex ${m.sender_type === 'admin' ? 'justify-content-end' : 'justify-content-start'}">
      <div class="p-2 rounded" style="max-width: 80%; background: ${m.sender_type === 'admin' ? 'var(--brand, #4f46e5)' : 'var(--bg-soft)'}; color: ${m.sender_type === 'admin' ? '#fff' : 'inherit'};">
        <div>${escapeHtml(m.body)}</div>
        <div class="small" style="opacity: 0.7;">${new Date(m.created_at).toLocaleString()}</div>
      </div>
    </div>
  `).join('');
  thread.scrollTop = thread.scrollHeight;
}

function switchDetailTab(tab) {
  ['proposals', 'files', 'messages'].forEach(t => {
    document.getElementById(`detail-tab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`detail-panel-${t}`).classList.toggle('d-none', t !== tab);
  });
}

async function openClientDetail(id) {
  currentClientId = id;
  const client = await api.get(`/api/v1/admin/clients/${id}`);
  document.getElementById('client-modal-title').textContent = client.name;
  document.getElementById('client-modal-subtitle').textContent = `${client.email}${client.phone ? " · " + client.phone : ""}`;
  document.getElementById('detail-panel-proposals').innerHTML = renderProposals(client.proposals || []);
  document.getElementById('detail-files-list').innerHTML = renderFiles(client.files || []);
  renderMessages(client.messages || []);
  switchDetailTab('proposals');
  clientModal.show();
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  inviteModal = new bootstrap.Modal(document.getElementById('invite-modal'));
  clientModal = new bootstrap.Modal(document.getElementById('client-modal'));

  document.getElementById('client-search').addEventListener('input', renderClients);
  document.getElementById('client-filter').addEventListener('change', renderClients);

  document.getElementById('invite-btn').addEventListener('click', () => {
    document.getElementById('invite-form').reset();
    document.getElementById('invite-form').classList.remove('d-none');
    document.getElementById('invite-result').classList.add('d-none');
    document.getElementById('invite-msg').classList.add('d-none');
    inviteModal.show();
  });

  document.getElementById('invite-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('invite-msg');
    msg.classList.add('d-none');
    try {
      const result = await api.post('/api/v1/admin/clients/invite', {
        name: document.getElementById('invite-name').value,
        email: document.getElementById('invite-email').value,
        phone: document.getElementById('invite-phone').value,
      });
      document.getElementById('invite-form').classList.add('d-none');
      document.getElementById('invite-result-url').value = result.url;
      document.getElementById('invite-result').classList.remove('d-none');
      await loadClients();
    } catch (err) {
      msg.className = 'alert alert-danger py-2 small';
      msg.textContent = err.message;
      msg.classList.remove('d-none');
    }
  });

  document.getElementById('copy-invite-result-btn').addEventListener('click', async () => {
    const input = document.getElementById('invite-result-url');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (_) {
      input.select();
    }
  });

  document.getElementById('detail-tab-proposals').addEventListener('click', () => switchDetailTab('proposals'));
  document.getElementById('detail-tab-files').addEventListener('click', () => switchDetailTab('files'));
  document.getElementById('detail-tab-messages').addEventListener('click', () => switchDetailTab('messages'));

  document.getElementById('detail-file-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('detail-file-input');
    if (!input.files.length || !currentClientId) return;
    const formData = new FormData();
    formData.append('file', input.files[0]);
    try {
      const res = await fetch(`/api/v1/admin/clients/${currentClientId}/files`, {
        method: 'POST',
        credentials: 'same-origin',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Upload failed.');
      }
      document.getElementById('detail-file-form').reset();
      const client = await api.get(`/api/v1/admin/clients/${currentClientId}`);
      document.getElementById('detail-files-list').innerHTML = renderFiles(client.files || []);
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById('detail-message-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('detail-message-input');
    const body = input.value.trim();
    if (!body || !currentClientId) return;
    try {
      await api.post(`/api/v1/admin/clients/${currentClientId}/messages`, { body });
      input.value = '';
      const messages = await api.get(`/api/v1/admin/clients/${currentClientId}/messages`);
      renderMessages(messages);
    } catch (err) {
      alert(err.message);
    }
  });

  await loadClients();
  const requestedClientId = Number(new URLSearchParams(location.search).get('open'));
  if (requestedClientId && clientsCache.some(client => Number(client.id) === requestedClientId)) {
    await openClientDetail(requestedClientId);
    const requestedTab = new URLSearchParams(location.search).get('tab');
    if (['proposals', 'files', 'messages'].includes(requestedTab)) switchDetailTab(requestedTab);
  }
})();
