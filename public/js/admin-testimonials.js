function renderStars(rating) {
  if (!rating) return '<span class="text-muted-custom small">—</span>';
  return '★'.repeat(rating) + '<span class="text-muted-custom">' + '★'.repeat(5 - rating) + '</span>';
}

async function loadTestimonials() {
  const response = await api.get('/api/v1/admin/testimonials');
  const rows = Array.isArray(response) ? response : [];
  const tbody = document.getElementById('testimonials-tbody');
  const empty = document.getElementById('empty-state');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted-custom py-4">No testimonial requests yet.</td></tr>';
    empty.classList.add('d-none');
    return;
  }
  empty.classList.add('d-none');

  tbody.innerHTML = rows.map(t => `
    <tr>
      <td class="ps-3">
        <div class="fw-semibold">${escapeHtml(t.client_name)}</div>
        <div class="small text-muted-custom">${escapeHtml(t.client_email)}</div>
      </td>
      <td class="small">${t.project_reference ? escapeHtml(t.project_reference) : '—'}</td>
      <td><span class="status-pill ${t.status}">${t.status}</span></td>
      <td class="small">${renderStars(t.rating)}</td>
      <td class="small" style="max-width: 260px;">${t.quote ? escapeHtml(t.quote) : '<span class="text-muted-custom">—</span>'}</td>
      <td class="small text-muted-custom">${new Date(t.requested_at).toLocaleDateString()}</td>
      <td class="text-end pe-3">
        <div class="d-flex gap-1 justify-content-end flex-wrap">
          ${t.status === 'submitted' ? `
            <button class="btn btn-sm btn-success approve-btn" data-id="${t.id}">Approve</button>
            <button class="btn btn-sm btn-outline-secondary reject-btn" data-id="${t.id}">Reject</button>
          ` : ''}
          <button class="btn btn-sm btn-outline-danger remove-btn" data-id="${t.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.patch(`/api/v1/admin/testimonials/${btn.dataset.id}`, { status: 'approved' });
      await loadTestimonials();
    });
  });
  tbody.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.patch(`/api/v1/admin/testimonials/${btn.dataset.id}`, { status: 'rejected' });
      await loadTestimonials();
    });
  });
  tbody.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this testimonial request?')) return;
      await api.delete(`/api/v1/admin/testimonials/${btn.dataset.id}`);
      await loadTestimonials();
    });
  });
}

document.getElementById('request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById('request-alert');
  const btn = document.getElementById('request-submit-btn');
  alertBox.classList.add('d-none');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    await api.post('/api/v1/admin/testimonials', {
      client_name: document.getElementById('req-name').value,
      client_email: document.getElementById('req-email').value,
      project_reference: document.getElementById('req-project').value,
    });
    document.getElementById('request-form').reset();
    bootstrap.Modal.getInstance(document.getElementById('request-modal')).hide();
    await loadTestimonials();
  } catch (err) {
    alertBox.className = 'alert alert-danger py-2 small';
    alertBox.textContent = err.message || 'Could not send the request.';
    alertBox.classList.remove('d-none');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send request';
  }
});

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  await loadTestimonials();
})();
