async function loadSubscribers() {
  const rows = await api.get('/api/v1/admin/newsletter');
  const tbody = document.getElementById('subscribers-tbody');
  const empty = document.getElementById('empty-state');

  if (rows.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');

  tbody.innerHTML = rows.map(s => `
    <tr>
      <td class="ps-3">${escapeHtml(s.email)}</td>
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
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  await loadSubscribers();
})();
