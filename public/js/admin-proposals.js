let proposalModal = null;
let quoteRequests = [];
let editingProposalId = null;
// While a booking's draft is still 'queued', the cron hasn't filled it in
// yet — re-poll so the card flips from the spinner to reviewable/failed on
// its own, without Caleb having to reload the page.
let proposalDraftPollTimer = null;

const STATUS_CLASS = {
  draft: 'read',
  sent: 'unread',
  accepted: 'published',
  declined: 'flagged',
};

const SERVICE_CATEGORY_LABEL = {
  website: 'Websites',
  mobile_app: 'Mobile apps',
  brand_system: 'Brand systems',
  strategy: 'Strategy',
  other: 'Other',
};

function formatAmount(subunits, currency) {
  return `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function setMockupPreview(url) {
  document.getElementById('proposal-mockup-image-url').value = url || '';
  const wrap = document.getElementById('mockup-preview-wrap');
  const img = document.getElementById('mockup-preview');
  if (url) {
    img.src = url;
    wrap.classList.remove('d-none');
  } else {
    img.src = '';
    wrap.classList.add('d-none');
  }
}

function defaultTerms() {
  return 'Work begins after the first milestone payment is confirmed. Scope changes may require a revised quote. Final files and deployment are handed over after all agreed milestones are paid.';
}

function milestoneRow(title = '', amount = '', dueNote = '') {
  const div = document.createElement('div');
  div.className = 'admin-card p-3 milestone-row';
  div.innerHTML = `
    <div class="row g-2 align-items-end">
      <div class="col-md-5">
        <label class="form-label">Milestone</label>
        <input type="text" class="form-control milestone-title" value="${escapeHtml(title)}" placeholder="50% deposit">
      </div>
      <div class="col-md-3">
        <label class="form-label">Amount</label>
        <input type="number" min="0" step="0.01" class="form-control milestone-amount" value="${escapeHtml(amount)}" placeholder="0.00">
      </div>
      <div class="col-md-3">
        <label class="form-label">Due note</label>
        <input type="text" class="form-control milestone-due" value="${escapeHtml(dueNote)}" placeholder="Due before kickoff">
      </div>
      <div class="col-md-1">
        <button type="button" class="btn btn-sm btn-outline-danger remove-milestone-btn" aria-label="Remove milestone" title="Remove milestone">&times;</button>
      </div>
    </div>
  `;
  div.querySelector('.remove-milestone-btn').addEventListener('click', () => div.remove());
  return div;
}

function resetProposalForm() {
  editingProposalId = null;
  document.getElementById('proposal-form').reset();
  document.getElementById('proposal-modal-title').textContent = 'Create Proposal';
  document.getElementById('proposal-submit-btn').textContent = 'Create Proposal';
  document.getElementById('inquiry-id').disabled = false;
  document.getElementById('proposal-terms').value = defaultTerms();
  document.getElementById('proposal-msg').classList.add('d-none');
  document.getElementById('draft-with-ai-brief').value = '';
  document.getElementById('draft-with-ai-brief').classList.add('d-none');
  document.getElementById('draft-with-ai-note').classList.add('d-none');
  setMockupPreview('');
  document.getElementById('mockup-msg').classList.add('d-none');
  const wrap = document.getElementById('milestones-wrap');
  wrap.innerHTML = '';
  wrap.appendChild(milestoneRow('50% deposit', '', 'Due before kickoff'));
  wrap.appendChild(milestoneRow('50% final payment', '', 'Due before final handoff'));
}

async function loadQuoteRequests() {
  const rows = await api.get('/api/v1/admin/proposals/quote-requests');
  quoteRequests = Array.isArray(rows) ? rows : [];
  const select = document.getElementById('inquiry-id');
  select.innerHTML = '<option value="">No linked quote request</option>' + quoteRequests.map(q =>
    `<option value="${q.id}">${escapeHtml(q.name)} - ${escapeHtml(q.project_type || 'Project')} - ${new Date(q.created_at).toLocaleDateString()}</option>`
  ).join('');
}

async function loadProposals() {
  const response = await api.get('/api/v1/admin/proposals');
  const rows = Array.isArray(response) ? response : [];
  const tbody = document.getElementById('proposals-table-body');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted-custom py-4">No proposals yet.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(p => {
    const url = `${window.location.origin}/proposal.html?token=${p.token}`;
    return `
      <tr>
        <td>
          <div class="fw-semibold">${escapeHtml(p.title)}${p.service_category ? ` <span class="badge bg-secondary-subtle text-secondary-emphasis fw-normal">${escapeHtml(SERVICE_CATEGORY_LABEL[p.service_category] || p.service_category)}</span>` : ''}</div>
          <div class="small text-muted-custom">${new Date(p.created_at).toLocaleString()}</div>
        </td>
        <td>
          <div>${escapeHtml(p.client_name)}</div>
          <div class="small text-muted-custom">${escapeHtml(p.client_email)}</div>
        </td>
        <td>${formatAmount(p.total_amount, p.currency)}</td>
        <td>
          <span class="status-pill ${STATUS_CLASS[p.status] || 'read'}">${escapeHtml(p.status)}</span>
          ${p.status === 'accepted' ? `<div class="small text-muted-custom mt-1">Signed by ${escapeHtml(p.accepted_by_name || p.client_name)}<br>${new Date(p.accepted_at).toLocaleString()}</div>` : ''}
        </td>
        <td>${p.paid_milestone_count || 0}/${p.milestone_count || 0} paid</td>
        <td class="text-end">
          <div class="d-inline-flex flex-wrap justify-content-end gap-2">
            <a href="${url}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-secondary">View</a>
            <button type="button" class="btn btn-sm btn-outline-secondary edit-proposal-btn" data-id="${p.id}" ${p.status === 'accepted' ? 'disabled' : ''}>Edit</button>
            <button type="button" class="btn btn-sm btn-outline-secondary copy-proposal-btn" data-url="${escapeHtml(url)}">Copy link</button>
            <button type="button" class="btn btn-sm btn-brand send-proposal-btn" data-id="${p.id}">Email</button>
            <button type="button" class="btn btn-sm btn-outline-secondary invite-portal-btn" data-name="${escapeHtml(p.client_name)}" data-email="${escapeHtml(p.client_email)}">Invite to portal</button>
            <button type="button" class="btn btn-sm btn-outline-danger delete-proposal-btn" data-id="${p.id}" title="Delete permanently">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.delete-proposal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm("Delete this proposal permanently? This can't be undone.")) return;
      try {
        await api.delete(`/api/v1/admin/proposals/${btn.dataset.id}`);
        await loadProposals();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  tbody.querySelectorAll('.copy-proposal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.url);
        const old = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = old; }, 2000);
      } catch (_) {
        prompt('Copy this proposal link:', btn.dataset.url);
      }
    });
  });

  tbody.querySelectorAll('.invite-portal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const resultBox = document.getElementById('proposal-result');
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Inviting...';
      try {
        const result = await api.post('/api/v1/admin/clients/invite', {
          name: btn.dataset.name,
          email: btn.dataset.email,
        });
        resultBox.className = 'alert alert-success py-2 small';
        resultBox.innerHTML = `Portal invite sent. <a href="${escapeHtml(result.url)}" target="_blank" rel="noopener">Open setup link</a>`;
        resultBox.classList.remove('d-none');
      } catch (err) {
        resultBox.className = 'alert alert-danger py-2 small';
        resultBox.textContent = err.message || 'Could not send portal invite.';
        resultBox.classList.remove('d-none');
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    });
  });

  tbody.querySelectorAll('.edit-proposal-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditProposal(btn.dataset.id));
  });

  tbody.querySelectorAll('.send-proposal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const resultBox = document.getElementById('proposal-result');
      const old = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending...';
      try {
        const result = await api.post(`/api/v1/admin/proposals/${btn.dataset.id}/send`, {});
        resultBox.className = 'alert alert-success py-2 small';
        resultBox.innerHTML = `Proposal email sent. <a href="${escapeHtml(result.url)}" target="_blank" rel="noopener">Open proposal</a>`;
        resultBox.classList.remove('d-none');
      } catch (err) {
        resultBox.className = 'alert alert-danger py-2 small';
        resultBox.textContent = err.message || 'Could not send proposal email.';
        resultBox.classList.remove('d-none');
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    });
  });
}

async function openEditProposal(id) {
  const msg = document.getElementById('proposal-msg');
  msg.classList.add('d-none');
  try {
    const proposal = await api.get(`/api/v1/admin/proposals/${id}`);
    editingProposalId = proposal.id;
    document.getElementById('proposal-form').reset();
    document.getElementById('proposal-modal-title').textContent = 'Edit Proposal';
    document.getElementById('proposal-submit-btn').textContent = 'Save Changes';
    document.getElementById('draft-with-ai-brief').classList.add('d-none');
    document.getElementById('draft-with-ai-note').classList.add('d-none');
    document.getElementById('inquiry-id').value = proposal.inquiry_id || '';
    document.getElementById('inquiry-id').disabled = true;
    document.getElementById('client-name').value = proposal.client_name || '';
    document.getElementById('client-email').value = proposal.client_email || '';
    document.getElementById('proposal-title').value = proposal.title || '';
    document.getElementById('proposal-currency').value = proposal.currency || 'GHS';
    document.getElementById('proposal-scope').value = proposal.scope || '';
    document.getElementById('proposal-timeline').value = proposal.timeline || '';
    document.getElementById('proposal-terms').value = proposal.terms || '';
    document.getElementById('proposal-service-category').value = proposal.service_category || '';
    setMockupPreview(proposal.mockup_image_url || '');

    const wrap = document.getElementById('milestones-wrap');
    wrap.innerHTML = '';
    (proposal.milestones || []).forEach(m => {
      wrap.appendChild(milestoneRow(m.title || '', Number(m.amount || 0) / 100, m.due_note || ''));
    });
    if (!wrap.children.length) {
      wrap.appendChild(milestoneRow());
    }
    proposalModal.show();
  } catch (err) {
    const resultBox = document.getElementById('proposal-result');
    resultBox.className = 'alert alert-danger py-2 small';
    resultBox.textContent = err.message || 'Could not load proposal.';
    resultBox.classList.remove('d-none');
  }
}

function prefillFromQuote(id) {
  const q = quoteRequests.find(item => String(item.id) === String(id));
  if (!q) return;
  document.getElementById('client-name').value = q.name || '';
  document.getElementById('client-email').value = q.email || '';
  document.getElementById('proposal-title').value = `${q.project_type || 'Project'} proposal`;
  document.getElementById('proposal-timeline').value = q.timeline || '';
  document.getElementById('proposal-scope').value = [
    q.message || '',
    q.features ? `Requested features: ${q.features}` : '',
    q.budget ? `Requested budget: ${q.budget}` : '',
  ].filter(Boolean).join('\n\n');
}

const GROUNDING_LABEL = {
  engineering_tiers: 'Grounded in a real published pricing tier.',
  inquiry_budget: "Grounded in the client's own stated budget.",
  none: 'No real pricing data to ground this in — these are placeholder numbers.',
};

// Shared by draftWithAi() (a live generate() call) and the "Review & Create"
// button on a queued booking draft (already-fetched fields) — same JSON
// shape either way, so the form-filling logic only needs to exist once.
function applyDraftToForm(draft) {
  if (draft.client_name) document.getElementById('client-name').value = draft.client_name;
  if (draft.client_email) document.getElementById('client-email').value = draft.client_email;
  document.getElementById('proposal-title').value = draft.title || '';
  document.getElementById('proposal-currency').value = draft.currency || 'GHS';
  document.getElementById('proposal-scope').value = draft.scope || '';
  document.getElementById('proposal-timeline').value = draft.timeline || '';
  document.getElementById('proposal-terms').value = draft.terms || defaultTerms();

  const wrap = document.getElementById('milestones-wrap');
  wrap.innerHTML = '';
  (draft.milestones || []).forEach(m => {
    wrap.appendChild(milestoneRow(m.title || '', m.amount || '', m.due_note || ''));
  });
  if (!wrap.children.length) {
    wrap.appendChild(milestoneRow());
  }
}

async function draftWithAi() {
  const note = document.getElementById('draft-with-ai-note');
  note.classList.add('d-none');

  const inquiryId = document.getElementById('inquiry-id').value;
  const brief = document.getElementById('draft-with-ai-brief').value.trim();
  if (!inquiryId && !brief) {
    note.className = 'alert alert-danger py-2 small mt-2';
    note.textContent = 'Pick a quote request above, or describe the project in the box first.';
    note.classList.remove('d-none');
    return;
  }

  const btn = document.getElementById('draft-with-ai-btn');
  const originalLabel = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Drafting…';

  try {
    const draft = await api.post('/api/v1/admin/proposals/generate', {
      inquiry_id: inquiryId || undefined,
      brief: brief || undefined,
    });

    applyDraftToForm(draft);

    note.className = 'alert alert-info py-2 small mt-2';
    note.textContent = (GROUNDING_LABEL[draft.grounding_source] || '') + (draft.grounding_note ? ' ' + draft.grounding_note : '');
    note.classList.remove('d-none');
  } catch (err) {
    note.className = 'alert alert-danger py-2 small mt-2';
    note.textContent = err.message || 'Could not generate a draft.';
    note.classList.remove('d-none');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalLabel;
  }
}

function fxRecalc() {
  const amount = Number(document.getElementById('fx-amount').value || 0);
  const rate = Number(document.getElementById('fx-rate').value || 0);
  const buffer = Number(document.getElementById('fx-buffer').value || 0);
  const result = document.getElementById('fx-result');
  if (!amount || !rate) {
    result.textContent = 'Enter a target amount and rate to see the converted GHS figure.';
    return null;
  }
  const base = amount * rate;
  const total = base * (1 + buffer / 100);
  result.innerHTML = `<strong>GHS ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> (GHS ${base.toLocaleString(undefined, { minimumFractionDigits: 2 })} converted + ${buffer}% buffer for rate movement)`;
  return total;
}

function collectMilestones() {
  return [...document.querySelectorAll('.milestone-row')].map(row => ({
    title: row.querySelector('.milestone-title').value.trim(),
    amount: Number(row.querySelector('.milestone-amount').value),
    due_note: row.querySelector('.milestone-due').value.trim(),
  })).filter(m => m.title || m.amount);
}

async function createProposal(e) {
  e.preventDefault();
  const msg = document.getElementById('proposal-msg');
  msg.classList.add('d-none');
  const payload = {
    inquiry_id: document.getElementById('inquiry-id').value,
    client_name: document.getElementById('client-name').value.trim(),
    client_email: document.getElementById('client-email').value.trim(),
    title: document.getElementById('proposal-title').value.trim(),
    currency: document.getElementById('proposal-currency').value,
    service_category: document.getElementById('proposal-service-category').value,
    scope: document.getElementById('proposal-scope').value.trim(),
    timeline: document.getElementById('proposal-timeline').value.trim(),
    terms: document.getElementById('proposal-terms').value.trim(),
    mockup_image_url: document.getElementById('proposal-mockup-image-url').value.trim(),
    milestones: collectMilestones(),
  };
  try {
    const result = editingProposalId
      ? await api.put(`/api/v1/admin/proposals/${editingProposalId}`, payload)
      : await api.post('/api/v1/admin/proposals', payload);
    proposalModal.hide();
    const url = `${window.location.origin}${result.url}`;
    const resultBox = document.getElementById('proposal-result');
    resultBox.className = 'alert alert-success py-2 small';
    resultBox.innerHTML = editingProposalId
      ? `Proposal updated. <a href="${url}" target="_blank" rel="noopener">Open proposal</a>`
      : `Proposal created. <a href="${url}" target="_blank" rel="noopener">Open proposal</a>`;
    resultBox.classList.remove('d-none');
    await loadProposals();
  } catch (err) {
    msg.className = 'alert alert-danger py-2 small';
    msg.textContent = err.message;
    msg.classList.remove('d-none');
  }
}

function proposalDraftCard(d) {
  const div = document.createElement('div');
  div.className = 'border rounded p-3';

  if (d.status === 'queued') {
    div.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <span class="spinner-border spinner-border-sm me-2"></span>
          <strong>${escapeHtml(d.client_name)}</strong>
          ${d.topic ? `<span class="small text-muted-custom"> — ${escapeHtml(d.topic)}</span>` : ''}
          <div class="small text-muted-custom">Drafting a proposal from the booking…</div>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary dismiss-draft-btn" data-id="${d.id}">Dismiss</button>
      </div>`;
  } else if (d.status === 'failed') {
    div.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <strong>${escapeHtml(d.client_name)}</strong>
          <div class="small text-danger">Could not draft a proposal automatically${d.error_note ? ' — ' + escapeHtml(d.error_note.replace(/\.+$/, '')) : ''}. Use "Draft with AI" on a new proposal instead.</div>
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary dismiss-draft-btn" data-id="${d.id}">Dismiss</button>
      </div>`;
  } else {
    div.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <strong>${escapeHtml(d.client_name)}</strong> <span class="small text-muted-custom">${escapeHtml(d.client_email)}</span>
          ${d.topic ? `<div class="small text-muted-custom">${escapeHtml(d.topic)}</div>` : ''}
          <div class="small mt-1">${escapeHtml(d.title || '')}</div>
        </div>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-sm btn-brand review-draft-btn" data-id="${d.id}">Review &amp; Create</button>
          <button type="button" class="btn btn-sm btn-outline-secondary dismiss-draft-btn" data-id="${d.id}">Dismiss</button>
        </div>
      </div>`;
  }

  return div;
}

async function reviewProposalDraft(draft) {
  resetProposalForm();
  applyDraftToForm(draft);
  const note = document.getElementById('draft-with-ai-note');
  note.className = 'alert alert-info py-2 small mt-2';
  note.textContent = 'Drafted automatically from a booked discovery call.'
    + (GROUNDING_LABEL[draft.grounding_source] ? ' ' + GROUNDING_LABEL[draft.grounding_source] : '')
    + (draft.grounding_note ? ' ' + draft.grounding_note : '');
  note.classList.remove('d-none');
  proposalModal.show();

  try {
    await api.delete(`/api/v1/admin/proposal-drafts/${draft.id}`);
  } catch (_) {
    // Non-fatal — worst case this row just reappears on the next load.
  }
  await loadProposalDrafts();
}

async function loadProposalDrafts() {
  // Any in-flight poll is about to be made redundant by this fresh load —
  // clear it so a button-triggered reload can't leave two timers running.
  if (proposalDraftPollTimer) {
    clearTimeout(proposalDraftPollTimer);
    proposalDraftPollTimer = null;
  }
  const card = document.getElementById('proposal-drafts-card');
  const list = document.getElementById('proposal-drafts-list');
  try {
    const drafts = await api.get('/api/v1/admin/proposal-drafts');
    if (!Array.isArray(drafts) || !drafts.length) {
      card.classList.add('d-none');
      list.innerHTML = '';
      return;
    }

    // Keep refreshing while the cron still has drafting to do.
    if (drafts.some(d => d.status === 'queued')) {
      proposalDraftPollTimer = setTimeout(loadProposalDrafts, 15000);
    }

    card.classList.remove('d-none');
    list.innerHTML = '';
    drafts.forEach(d => list.appendChild(proposalDraftCard(d)));

    list.querySelectorAll('.dismiss-draft-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await api.delete(`/api/v1/admin/proposal-drafts/${btn.dataset.id}`);
          await loadProposalDrafts();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });
    list.querySelectorAll('.review-draft-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const draft = drafts.find(d => String(d.id) === btn.dataset.id);
        if (draft) reviewProposalDraft(draft);
      });
    });
  } catch (_) {
    // Quiet failure — this panel is a convenience, not the primary flow.
    card.classList.add('d-none');
  }
}

function showPageError(message) {
  const box = document.getElementById('proposal-page-error');
  box.textContent = message;
  box.classList.remove('d-none');
}

function showProposalListError(message) {
  document.getElementById('proposals-table-body').innerHTML =
    `<tr><td colspan="6" class="text-center text-danger py-4">${escapeHtml(message)}</td></tr>`;
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  proposalModal = new bootstrap.Modal(document.getElementById('proposal-modal'));
  document.getElementById('new-proposal-btn').addEventListener('click', () => {
    resetProposalForm();
    proposalModal.show();
  });
  document.getElementById('add-milestone-btn').addEventListener('click', () => {
    document.getElementById('milestones-wrap').appendChild(milestoneRow());
  });
  document.getElementById('inquiry-id').addEventListener('change', e => prefillFromQuote(e.target.value));
  document.getElementById('proposal-form').addEventListener('submit', createProposal);
  document.getElementById('draft-with-ai-btn').addEventListener('click', draftWithAi);
  document.getElementById('draft-with-ai-brief-toggle').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('draft-with-ai-brief').classList.toggle('d-none');
  });

  document.getElementById('generate-mockup-btn').addEventListener('click', async () => {
    const msg = document.getElementById('mockup-msg');
    msg.classList.add('d-none');
    const btn = document.getElementById('generate-mockup-btn');
    const originalLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating…';
    try {
      const result = await api.post('/api/v1/admin/proposals/generate-mockup', {
        title: document.getElementById('proposal-title').value.trim(),
        scope: document.getElementById('proposal-scope').value.trim(),
        service_category: document.getElementById('proposal-service-category').value,
      });
      setMockupPreview(result.url);
    } catch (err) {
      msg.className = 'alert alert-danger py-2 small mt-2';
      msg.textContent = err.message || 'Could not generate a mockup.';
      msg.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
    }
  });
  document.getElementById('remove-mockup-btn').addEventListener('click', () => setMockupPreview(''));

  document.getElementById('fx-converter-toggle').addEventListener('click', () => {
    const box = document.getElementById('fx-converter');
    const hidden = box.classList.toggle('d-none');
    document.getElementById('fx-converter-toggle').textContent = hidden ? 'Show' : 'Hide';
  });
  ['fx-amount', 'fx-rate', 'fx-buffer'].forEach(id => {
    document.getElementById(id).addEventListener('input', fxRecalc);
  });
  document.getElementById('fx-add-milestone-btn').addEventListener('click', () => {
    const total = fxRecalc();
    if (!total) return;
    document.getElementById('proposal-currency').value = 'GHS';
    const currency = document.getElementById('fx-currency').value;
    const amount = document.getElementById('fx-amount').value;
    document.getElementById('milestones-wrap').appendChild(
      milestoneRow(`International rate (${currency} ${amount} converted)`, total.toFixed(2), '')
    );
  });

  try {
    await loadQuoteRequests();
  } catch (err) {
    showPageError(`Could not load quote requests: ${err.message}`);
  }

  loadProposalDrafts();

  try {
    await loadProposals();
  } catch (err) {
    showProposalListError(`Could not load proposals: ${err.message}`);
  }
  // Deep-linked from elsewhere (e.g. a Contact's Quick Actions): either a
  // real quote request to prefill from, or — when a contact has no linked
  // inquiry — just their name/email so the form still opens ready to go.
  const qs = new URLSearchParams(window.location.search);
  const inquiryId = qs.get('inquiry_id');
  const clientName = qs.get('client_name');
  const clientEmail = qs.get('client_email');
  if (inquiryId) {
    resetProposalForm();
    document.getElementById('inquiry-id').value = inquiryId;
    prefillFromQuote(inquiryId);
    proposalModal.show();
  } else if (clientName || clientEmail) {
    resetProposalForm();
    document.getElementById('client-name').value = clientName || '';
    document.getElementById('client-email').value = clientEmail || '';
    proposalModal.show();
  }
})();
