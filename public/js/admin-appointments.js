const STATUS_PILL = { confirmed: 'unread', completed: 'published', cancelled: 'archived' };

async function loadAppointments(status = 'confirmed') {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const response = await api.get(`/api/v1/admin/appointments${query}`);
  const rows = Array.isArray(response) ? response : [];
  const filtered = status ? rows.filter(r => r.status === status) : rows;
  const tbody = document.getElementById('appointments-tbody');
  const empty = document.getElementById('empty-state');

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted-custom py-4">No bookings yet.</td></tr>';
    empty.classList.add('d-none');
    return;
  }
  empty.classList.add('d-none');

  tbody.innerHTML = filtered.map(a => `
    <tr>
      <td class="ps-3">${a.appointment_date} at ${a.appointment_time}</td>
      <td>${escapeHtml(a.client_name)}<br><span class="small text-muted-custom">${escapeHtml(a.client_email)}</span></td>
      <td class="small text-muted-custom">${escapeHtml(a.topic || '—')}</td>
      <td><span class="status-pill ${STATUS_PILL[a.status] || 'read'}">${a.status}</span></td>
      <td class="text-end pe-3">
        ${a.status === 'confirmed' ? `
          <button class="btn btn-sm btn-outline-secondary status-btn" data-id="${a.id}" data-status="completed">Mark Completed</button>
          <button class="btn btn-sm btn-outline-danger status-btn" data-id="${a.id}" data-status="cancelled">Cancel</button>
        ` : ''}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.patch(`/api/v1/admin/appointments/${btn.dataset.id}`, { status: btn.dataset.status });
      await loadAppointments(document.getElementById('status-filter').value);
    });
  });
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById('status-filter').addEventListener('change', (e) => loadAppointments(e.target.value));

  await loadAppointments('confirmed');
})();
