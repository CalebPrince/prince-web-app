let stepModal = null;
let enrollModal = null;
let editingStepId = null;
let stepsCache = [];

const ENROLLMENT_PILL_CLASS = {
  active: 'published',
  completed: 'read',
  stopped: 'archived',
};

async function loadSteps() {
  const response = await api.get('/api/v1/admin/drip/steps');
  stepsCache = Array.isArray(response) ? response : [];
  const tbody = document.getElementById('steps-tbody');

  if (stepsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted-custom py-4">No steps yet. Add the first email in your sequence.</td></tr>';
    return;
  }

  tbody.innerHTML = stepsCache.map(s => `
    <tr>
      <td class="ps-3"><span class="fw-semibold">Day ${s.day_offset}</span></td>
      <td>${escapeHtml(s.subject)}<br><span class="small text-muted-custom">${escapeHtml(s.body.slice(0, 90))}${s.body.length > 90 ? '…' : ''}</span></td>
      <td>
        <div class="form-check form-switch">
          <input type="checkbox" class="form-check-input step-toggle" data-id="${s.id}" ${s.is_active ? 'checked' : ''}>
        </div>
      </td>
      <td class="small text-muted-custom">${s.sent_count} sent</td>
      <td class="text-end pe-3 text-nowrap">
        <button class="btn btn-sm btn-outline-secondary edit-step-btn" data-id="${s.id}">Edit</button>
        <button class="btn btn-sm btn-outline-danger delete-step-btn ms-1" data-id="${s.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.step-toggle').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const step = stepsCache.find(s => s.id === Number(toggle.dataset.id));
      toggle.disabled = true;
      try {
        await api.put(`/api/v1/admin/drip/steps/${step.id}`, { ...step, is_active: toggle.checked });
        step.is_active = toggle.checked ? 1 : 0;
      } catch (err) {
        alert(err.message);
        toggle.checked = !toggle.checked;
      } finally {
        toggle.disabled = false;
      }
    });
  });

  tbody.querySelectorAll('.edit-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = stepsCache.find(s => s.id === Number(btn.dataset.id));
      if (step) openStepModal(step);
    });
  });

  tbody.querySelectorAll('.delete-step-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this step? Emails already sent are unaffected.')) return;
      try {
        await api.delete(`/api/v1/admin/drip/steps/${btn.dataset.id}`);
        await loadSteps();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function loadEnrollments() {
  const response = await api.get('/api/v1/admin/drip/enrollments');
  const rows = Array.isArray(response) ? response : [];
  const tbody = document.getElementById('enrollments-tbody');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted-custom py-4">No enrollments yet. Leads are added automatically when you send a pitch.</td></tr>';
    return;
  }

  const totalSteps = stepsCache.filter(s => s.is_active).length;
  tbody.innerHTML = rows.map(e => `
    <tr>
      <td class="ps-3">${escapeHtml(e.name || '—')}<br><span class="small text-muted-custom">${escapeHtml(e.email)}</span></td>
      <td class="small text-muted-custom">${e.source === 'marketing_lead' ? 'Marketing lead' : 'Manual'}</td>
      <td><span class="status-pill ${ENROLLMENT_PILL_CLASS[e.status] || 'read'}">${escapeHtml(e.status)}</span></td>
      <td class="small">${e.steps_received}/${totalSteps || '?'} emails${e.last_sent_at ? `<br><span class="text-muted-custom">last: ${new Date(e.last_sent_at + 'Z').toLocaleDateString()}</span>` : ''}</td>
      <td class="small text-muted-custom">${new Date(e.enrolled_at + 'Z').toLocaleDateString()}</td>
      <td class="text-end pe-3 text-nowrap">
        ${e.status === 'active' ? `<button class="btn btn-sm btn-outline-secondary stop-btn" data-id="${e.id}">Stop</button>` : ''}
        ${e.status === 'stopped' ? `<button class="btn btn-sm btn-outline-secondary resume-btn" data-id="${e.id}">Resume</button>` : ''}
        <button class="btn btn-sm btn-outline-danger delete-enrollment-btn ms-1" data-id="${e.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.stop-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api.patch(`/api/v1/admin/drip/enrollments/${btn.dataset.id}`, { status: 'stopped' });
        await loadEnrollments();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  tbody.querySelectorAll('.resume-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api.patch(`/api/v1/admin/drip/enrollments/${btn.dataset.id}`, { status: 'active' });
        await loadEnrollments();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  tbody.querySelectorAll('.delete-enrollment-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this enrollment and its send history?')) return;
      try {
        await api.delete(`/api/v1/admin/drip/enrollments/${btn.dataset.id}`);
        await loadEnrollments();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function openStepModal(step = null) {
  editingStepId = step ? step.id : null;
  document.getElementById('step-form').reset();
  document.getElementById('step-msg').classList.add('d-none');
  document.getElementById('step-modal-title').textContent = step ? 'Edit Step' : 'Add Step';
  if (step) {
    document.getElementById('step-day').value = step.day_offset;
    document.getElementById('step-subject').value = step.subject;
    document.getElementById('step-body').value = step.body;
    document.getElementById('step-active').checked = Boolean(step.is_active);
  }
  stepModal.show();
}

function switchTab(tab) {
  document.getElementById('tab-steps').classList.toggle('active', tab === 'steps');
  document.getElementById('tab-enrollments').classList.toggle('active', tab === 'enrollments');
  document.getElementById('panel-steps').classList.toggle('d-none', tab !== 'steps');
  document.getElementById('panel-enrollments').classList.toggle('d-none', tab !== 'enrollments');
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  stepModal = new bootstrap.Modal(document.getElementById('step-modal'));
  enrollModal = new bootstrap.Modal(document.getElementById('enroll-modal'));

  document.getElementById('tab-steps').addEventListener('click', () => switchTab('steps'));
  document.getElementById('tab-enrollments').addEventListener('click', () => switchTab('enrollments'));
  document.getElementById('new-step-btn').addEventListener('click', () => openStepModal());
  document.getElementById('enroll-btn').addEventListener('click', () => {
    document.getElementById('enroll-form').reset();
    document.getElementById('enroll-msg').classList.add('d-none');
    enrollModal.show();
  });

  document.getElementById('step-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('step-msg');
    msg.classList.add('d-none');
    const payload = {
      day_offset: Number(document.getElementById('step-day').value),
      subject: document.getElementById('step-subject').value,
      body: document.getElementById('step-body').value,
      is_active: document.getElementById('step-active').checked,
    };
    try {
      if (editingStepId) {
        await api.put(`/api/v1/admin/drip/steps/${editingStepId}`, payload);
      } else {
        await api.post('/api/v1/admin/drip/steps', payload);
      }
      stepModal.hide();
      await loadSteps();
    } catch (err) {
      msg.className = 'alert alert-danger py-2 small';
      msg.textContent = err.message;
      msg.classList.remove('d-none');
    }
  });

  document.getElementById('enroll-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('enroll-msg');
    msg.classList.add('d-none');
    try {
      await api.post('/api/v1/admin/drip/enrollments', {
        email: document.getElementById('enroll-email').value,
        name: document.getElementById('enroll-name').value,
      });
      enrollModal.hide();
      switchTab('enrollments');
      await loadEnrollments();
    } catch (err) {
      msg.className = 'alert alert-danger py-2 small';
      msg.textContent = err.message;
      msg.classList.remove('d-none');
    }
  });

  await loadSteps();
  await loadEnrollments();
})();
