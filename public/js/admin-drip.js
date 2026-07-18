// Automations admin: a list of trigger-driven email sequences, each opening
// into its own steps / enrolments / AI-sends detail. Everything below the list
// is scoped to `currentAutomation` via ?automation_id= on the drip endpoints.

let automationModal = null;
let stepModal = null;
let enrollModal = null;
let editingStepId = null;
let editingAutomationId = null;
let currentAutomation = null;
let stepsCache = [];

const ENROLLMENT_PILL_CLASS = {
  active: 'published',
  completed: 'read',
  stopped: 'archived',
};

// Keep in step with App\Support\Automations::TRIGGERS and the schema CHECK.
const TRIGGERS = [
  { value: 'manual', label: 'Manual only', hint: 'No automatic enrolment — you add contacts by hand.' },
  { value: 'marketing_pitch_sent', label: 'Marketing pitch sent', hint: 'A cold lead is enrolled when you mark their outreach pitch as sent.' },
  { value: 'inquiry_created', label: 'Contact form inquiry', hint: 'Someone sends a message through the contact form.' },
  { value: 'quote_requested', label: 'Project / quote request', hint: 'Someone submits the detailed project request form.' },
  { value: 'proposal_sent', label: 'Proposal sent', hint: 'You send a proposal to a client.' },
  { value: 'payment_received', label: 'Payment received', hint: 'A client payment succeeds.' },
  { value: 'appointment_booked', label: 'Booking made', hint: 'A lead books a call.' },
  { value: 'project_completed', label: 'Session completed', hint: 'You mark a booked session as completed.' },
  { value: 'newsletter_subscribed', label: 'Newsletter signup', hint: 'Someone subscribes to the newsletter.' },
  { value: 'chat_lead_captured', label: 'Live chat lead', hint: 'A visitor leaves their details in the live chat.' },
];
const TRIGGER_MAP = Object.fromEntries(TRIGGERS.map(t => [t.value, t]));

function triggerLabel(value) {
  return (TRIGGER_MAP[value] || { label: value }).label;
}

function triggerBadge(value) {
  return `<span class="badge" style="background: var(--section-leads-soft); color: var(--section-leads); font-weight: 500;">${escapeHtml(triggerLabel(value))}</span>`;
}

// ===================== LIST VIEW =====================

async function loadAutomations() {
  const response = await api.get('/api/v1/admin/automations');
  const rows = Array.isArray(response) ? response : [];
  const list = document.getElementById('automations-list');
  const empty = document.getElementById('automations-empty');

  empty.classList.toggle('d-none', rows.length !== 0);
  list.innerHTML = rows.map(a => `
    <div class="col-md-6 col-xl-4">
      <div class="admin-card p-3 h-100 d-flex flex-column">
        <div class="d-flex justify-content-between align-items-start mb-2">
          ${triggerBadge(a.trigger_event)}
          <div class="form-check form-switch mb-0" title="${a.is_active ? 'Active' : 'Paused'}">
            <input type="checkbox" class="form-check-input automation-toggle" data-id="${a.id}" ${Number(a.is_active) ? 'checked' : ''}>
          </div>
        </div>
        <h5 class="mb-1">${escapeHtml(a.name)}</h5>
        <p class="small text-muted-custom flex-grow-1">${escapeHtml(a.description || 'No description.')}</p>
        <div class="d-flex gap-3 small text-muted-custom mb-3">
          <span><i class="bi bi-list-ol me-1"></i>${a.active_step_count}/${a.step_count} step${a.step_count === 1 ? '' : 's'} on</span>
          <span><i class="bi bi-people me-1"></i>${a.active_enrollment_count}/${a.enrollment_count} active</span>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-brand open-automation-btn" data-id="${a.id}">Open</button>
          <button class="btn btn-sm btn-outline-secondary edit-automation-btn" data-id="${a.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger delete-automation-btn ms-auto" data-id="${a.id}" title="Delete automation">Delete</button>
        </div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.open-automation-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = rows.find(x => x.id === Number(btn.dataset.id));
      if (a) openDetail(a);
    });
  });

  list.querySelectorAll('.edit-automation-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = rows.find(x => x.id === Number(btn.dataset.id));
      if (a) openAutomationModal(a);
    });
  });

  list.querySelectorAll('.automation-toggle').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      toggle.disabled = true;
      try {
        await api.patch(`/api/v1/admin/automations/${toggle.dataset.id}`, { is_active: toggle.checked });
      } catch (err) {
        alert(err.message);
        toggle.checked = !toggle.checked;
      } finally {
        toggle.disabled = false;
      }
    });
  });

  list.querySelectorAll('.delete-automation-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const a = rows.find(x => x.id === Number(btn.dataset.id));
      if (!confirm(`Delete "${a ? a.name : 'this automation'}"? Its steps and enrolment history are removed too. This cannot be undone.`)) return;
      try {
        await api.delete(`/api/v1/admin/automations/${btn.dataset.id}`);
        await loadAutomations();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function showList() {
  currentAutomation = null;
  document.getElementById('detail-view').classList.add('d-none');
  document.getElementById('automations-view').classList.remove('d-none');
  loadAutomations();
}

// ===================== DETAIL VIEW =====================

async function openDetail(automation) {
  currentAutomation = automation;
  document.getElementById('automations-view').classList.add('d-none');
  document.getElementById('detail-view').classList.remove('d-none');

  document.getElementById('detail-name').textContent = automation.name;
  document.getElementById('detail-description').textContent = automation.description || '';
  document.getElementById('detail-trigger-badge').outerHTML =
    `<span class="badge" id="detail-trigger-badge" style="background: var(--section-leads-soft); color: var(--section-leads); font-weight: 500;">${escapeHtml(triggerLabel(automation.trigger_event))}</span>`;
  const activeToggle = document.getElementById('detail-active-toggle');
  activeToggle.checked = Boolean(Number(automation.is_active));
  document.getElementById('detail-active-label').textContent = activeToggle.checked ? 'Active' : 'Paused';

  switchTab('steps');
  await loadSteps();
  await loadEnrollments();
}

async function loadSteps() {
  if (!currentAutomation) return;
  const response = await api.get(`/api/v1/admin/drip/steps?automation_id=${currentAutomation.id}`);
  stepsCache = Array.isArray(response) ? response : [];
  const tbody = document.getElementById('steps-tbody');

  if (stepsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted-custom py-4">No steps yet. Add the first email in this sequence.</td></tr>';
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
  if (!currentAutomation) return;
  const response = await api.get(`/api/v1/admin/drip/enrollments?automation_id=${currentAutomation.id}`);
  const rows = Array.isArray(response) ? response : [];
  const tbody = document.getElementById('enrollments-tbody');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted-custom py-4">No enrolments yet. Contacts are added automatically when this automation\'s trigger fires, or enrol one by hand.</td></tr>';
    return;
  }

  const totalSteps = stepsCache.filter(s => s.is_active).length;
  tbody.innerHTML = rows.map(e => `
    <tr>
      <td class="ps-3">${escapeHtml(e.name || '—')}<br><span class="small text-muted-custom">${escapeHtml(e.email)}</span></td>
      <td class="small text-muted-custom">${e.source === 'marketing_lead' ? 'Marketing lead' : (e.source === 'trigger' ? 'Auto (trigger)' : 'Manual')}</td>
      <td><span class="status-pill ${ENROLLMENT_PILL_CLASS[e.status] || 'read'}">${escapeHtml(e.status)}</span></td>
      <td>
        <div class="form-check form-switch">
          <input type="checkbox" class="form-check-input nurturer-toggle" data-id="${e.id}" ${Number(e.nurturer_enabled) ? 'checked' : ''}>
        </div>
      </td>
      <td class="small">${e.steps_received}/${totalSteps || '?'} emails${e.last_sent_at ? `<br><span class="text-muted-custom">last: ${new Date(e.last_sent_at + 'Z').toLocaleDateString()}</span>` : ''}</td>
      <td class="small text-muted-custom">${new Date(e.enrolled_at + 'Z').toLocaleDateString()}</td>
      <td class="text-end pe-3 text-nowrap">
        ${e.status === 'active' ? `<button class="btn btn-sm btn-outline-secondary stop-btn" data-id="${e.id}">Stop</button>` : ''}
        ${e.status === 'stopped' ? `<button class="btn btn-sm btn-outline-secondary resume-btn" data-id="${e.id}">Resume</button>` : ''}
        <button class="btn btn-sm btn-outline-danger delete-enrollment-btn ms-1" data-id="${e.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  // Opting a lead in after the fact matters most for the automated path:
  // markSent enrols with Nurturer off, so without this the entire outbound
  // pipeline could never receive an AI follow-up.
  tbody.querySelectorAll('.nurturer-toggle').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      toggle.disabled = true;
      try {
        await api.patch(`/api/v1/admin/drip/enrollments/${toggle.dataset.id}`, { nurturer_enabled: toggle.checked });
      } catch (err) {
        alert(err.message);
        toggle.checked = !toggle.checked;
      } finally {
        toggle.disabled = false;
      }
    });
  });

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
      if (!confirm('Delete this enrolment and its send history?')) return;
      try {
        await api.delete(`/api/v1/admin/drip/enrollments/${btn.dataset.id}`);
        await loadEnrollments();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function loadNurturerSends() {
  const response = await api.get('/api/v1/admin/drip/nurturer-sends');
  const rows = Array.isArray(response) ? response : [];
  const tbody = document.getElementById('ai-sends-tbody');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted-custom py-4">No AI-personalized emails sent yet.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(s => `
    <tr>
      <td class="ps-3">${escapeHtml(s.name || '—')}<br><span class="small text-muted-custom">${escapeHtml(s.email)}</span></td>
      <td class="small text-muted-custom">Sequence ${s.sequence_number}</td>
      <td>${escapeHtml(s.subject_line)}<br><span class="small text-muted-custom">${escapeHtml(s.email_body.slice(0, 90))}${s.email_body.length > 90 ? '…' : ''}</span></td>
      <td class="small text-muted-custom">${new Date(s.sent_at + 'Z').toLocaleString()}</td>
    </tr>
  `).join('');
}

// Defaults mirror send_nurturer_emails.php's fallbacks — keep the two in
// sync, since a never-saved setting reads as empty here but falls back there.
const NURTURER_DEFAULT_OFFSETS = { 2: 5, 3: 12 };

let timingSettingsLoaded = false;
async function loadNurturerTiming() {
  if (timingSettingsLoaded) return;
  try {
    const settings = await api.get('/api/v1/admin/settings');
    document.getElementById('nurturer-offset-2').value = settings.nurturer_sequence_2_day_offset || NURTURER_DEFAULT_OFFSETS[2];
    document.getElementById('nurturer-offset-3').value = settings.nurturer_sequence_3_day_offset || NURTURER_DEFAULT_OFFSETS[3];
    timingSettingsLoaded = true;
  } catch (_) {
    // Quiet failure — admin can still type offsets and save.
  }
}

// ===================== MODALS =====================

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

function openAutomationModal(automation = null) {
  editingAutomationId = automation ? automation.id : null;
  const form = document.getElementById('automation-form');
  form.reset();
  document.getElementById('automation-msg').classList.add('d-none');
  document.getElementById('automation-modal-title').textContent = automation ? 'Edit Automation' : 'New Automation';

  const select = document.getElementById('automation-trigger');
  select.innerHTML = TRIGGERS.map(t => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join('');

  if (automation) {
    document.getElementById('automation-name').value = automation.name;
    document.getElementById('automation-description').value = automation.description || '';
    select.value = automation.trigger_event;
    document.getElementById('automation-active').checked = Boolean(Number(automation.is_active));
  }
  updateTriggerHelp();
  automationModal.show();
}

function updateTriggerHelp() {
  const value = document.getElementById('automation-trigger').value;
  document.getElementById('automation-trigger-help').textContent = (TRIGGER_MAP[value] || {}).hint || '';
}

function switchTab(tab) {
  document.getElementById('tab-steps').classList.toggle('active', tab === 'steps');
  document.getElementById('tab-enrollments').classList.toggle('active', tab === 'enrollments');
  document.getElementById('tab-ai-sends').classList.toggle('active', tab === 'ai-sends');
  document.getElementById('panel-steps').classList.toggle('d-none', tab !== 'steps');
  document.getElementById('panel-enrollments').classList.toggle('d-none', tab !== 'enrollments');
  document.getElementById('panel-ai-sends').classList.toggle('d-none', tab !== 'ai-sends');
  if (tab === 'ai-sends') {
    loadNurturerSends();
    loadNurturerTiming();
  }
}

// ===================== INIT =====================

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  automationModal = new bootstrap.Modal(document.getElementById('automation-modal'));
  stepModal = new bootstrap.Modal(document.getElementById('step-modal'));
  enrollModal = new bootstrap.Modal(document.getElementById('enroll-modal'));

  document.getElementById('new-automation-btn').addEventListener('click', () => openAutomationModal());
  document.getElementById('back-btn').addEventListener('click', showList);
  document.getElementById('automation-trigger').addEventListener('change', updateTriggerHelp);

  document.getElementById('edit-automation-btn').addEventListener('click', () => {
    if (currentAutomation) openAutomationModal(currentAutomation);
  });

  document.getElementById('detail-active-toggle').addEventListener('change', async (e) => {
    if (!currentAutomation) return;
    const toggle = e.target;
    toggle.disabled = true;
    try {
      await api.patch(`/api/v1/admin/automations/${currentAutomation.id}`, { is_active: toggle.checked });
      currentAutomation.is_active = toggle.checked ? 1 : 0;
      document.getElementById('detail-active-label').textContent = toggle.checked ? 'Active' : 'Paused';
    } catch (err) {
      alert(err.message);
      toggle.checked = !toggle.checked;
    } finally {
      toggle.disabled = false;
    }
  });

  document.getElementById('tab-steps').addEventListener('click', () => switchTab('steps'));
  document.getElementById('tab-enrollments').addEventListener('click', () => switchTab('enrollments'));
  document.getElementById('tab-ai-sends').addEventListener('click', () => switchTab('ai-sends'));
  document.getElementById('new-step-btn').addEventListener('click', () => openStepModal());
  document.getElementById('enroll-btn').addEventListener('click', () => {
    document.getElementById('enroll-form').reset();
    document.getElementById('enroll-msg').classList.add('d-none');
    document.getElementById('enroll-automation-name').textContent = currentAutomation ? currentAutomation.name : 'this automation';
    enrollModal.show();
  });

  document.getElementById('automation-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('automation-msg');
    msg.classList.add('d-none');
    const payload = {
      name: document.getElementById('automation-name').value,
      trigger_event: document.getElementById('automation-trigger').value,
      description: document.getElementById('automation-description').value,
      is_active: document.getElementById('automation-active').checked,
    };
    try {
      if (editingAutomationId) {
        await api.put(`/api/v1/admin/automations/${editingAutomationId}`, payload);
      } else {
        await api.post('/api/v1/admin/automations', payload);
      }
      automationModal.hide();
      // If we were editing the open automation, refresh its header too.
      if (editingAutomationId && currentAutomation && currentAutomation.id === editingAutomationId) {
        const fresh = (await api.get('/api/v1/admin/automations')).find(a => a.id === editingAutomationId);
        if (fresh) { currentAutomation = fresh; await openDetail(fresh); }
        else showList();
      } else {
        showList();
      }
    } catch (err) {
      const detail = err.data && err.data.errors ? err.data.errors.join(' ') : err.message;
      msg.className = 'alert alert-danger py-2 small';
      msg.textContent = detail;
      msg.classList.remove('d-none');
    }
  });

  document.getElementById('step-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('step-msg');
    msg.classList.add('d-none');
    const payload = {
      automation_id: currentAutomation ? currentAutomation.id : null,
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

  document.getElementById('nurturer-timing-save').addEventListener('click', async () => {
    const msg = document.getElementById('nurturer-timing-msg');
    const btn = document.getElementById('nurturer-timing-save');
    msg.classList.add('d-none');
    btn.disabled = true;
    try {
      await api.put('/api/v1/admin/settings', {
        nurturer_sequence_2_day_offset: document.getElementById('nurturer-offset-2').value,
        nurturer_sequence_3_day_offset: document.getElementById('nurturer-offset-3').value,
      });
      msg.className = 'alert alert-success py-2 small mt-3';
      msg.textContent = 'Saved.';
      msg.classList.remove('d-none');
    } catch (err) {
      msg.className = 'alert alert-danger py-2 small mt-3';
      msg.textContent = err.message;
      msg.classList.remove('d-none');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('enroll-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('enroll-msg');
    msg.classList.add('d-none');
    try {
      await api.post('/api/v1/admin/drip/enrollments', {
        automation_id: currentAutomation ? currentAutomation.id : null,
        email: document.getElementById('enroll-email').value,
        name: document.getElementById('enroll-name').value,
        nurturer_enabled: document.getElementById('enroll-nurturer-enabled').checked,
        lead_industry: document.getElementById('enroll-lead-industry').value,
        last_action: document.getElementById('enroll-last-action').value,
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

  await loadAutomations();
})();
