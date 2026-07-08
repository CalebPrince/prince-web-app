let proposalModal = null;
let quoteRequests = [];

const STATUS_CLASS = {
  draft: 'read',
  sent: 'unread',
  accepted: 'published',
  declined: 'flagged',
};

function formatAmount(subunits, currency) {
  return `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
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
  document.getElementById('proposal-form').reset();
  document.getElementById('proposal-terms').value = defaultTerms();
  document.getElementById('proposal-msg').classList.add('d-none');
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
          <div class="fw-semibold">${escapeHtml(p.title)}</div>
          <div class="small text-muted-custom">${new Date(p.created_at).toLocaleString()}</div>
        </td>
        <td>
          <div>${escapeHtml(p.client_name)}</div>
          <div class="small text-muted-custom">${escapeHtml(p.client_email)}</div>
        </td>
        <td>${formatAmount(p.total_amount, p.currency)}</td>
        <td><span class="status-pill ${STATUS_CLASS[p.status] || 'read'}">${escapeHtml(p.status)}</span></td>
        <td>${p.paid_milestone_count || 0}/${p.milestone_count || 0} paid</td>
        <td class="text-end">
          <div class="d-inline-flex flex-wrap justify-content-end gap-2">
            <a href="${url}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-secondary">View</a>
            <button type="button" class="btn btn-sm btn-outline-secondary copy-proposal-btn" data-url="${escapeHtml(url)}">Copy link</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

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
  try {
    const result = await api.post('/api/v1/admin/proposals', {
      inquiry_id: document.getElementById('inquiry-id').value,
      client_name: document.getElementById('client-name').value.trim(),
      client_email: document.getElementById('client-email').value.trim(),
      title: document.getElementById('proposal-title').value.trim(),
      currency: document.getElementById('proposal-currency').value,
      scope: document.getElementById('proposal-scope').value.trim(),
      timeline: document.getElementById('proposal-timeline').value.trim(),
      terms: document.getElementById('proposal-terms').value.trim(),
      milestones: collectMilestones(),
    });
    proposalModal.hide();
    const url = `${window.location.origin}${result.url}`;
    const resultBox = document.getElementById('proposal-result');
    resultBox.innerHTML = `Proposal created. <a href="${url}" target="_blank" rel="noopener">Open proposal</a>`;
    resultBox.classList.remove('d-none');
    await loadProposals();
  } catch (err) {
    msg.className = 'alert alert-danger py-2 small';
    msg.textContent = err.message;
    msg.classList.remove('d-none');
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

  try {
    await loadQuoteRequests();
  } catch (err) {
    showPageError(`Could not load quote requests: ${err.message}`);
  }

  try {
    await loadProposals();
  } catch (err) {
    showProposalListError(`Could not load proposals: ${err.message}`);
  }
  const inquiryId = new URLSearchParams(window.location.search).get('inquiry_id');
  if (inquiryId) {
    resetProposalForm();
    document.getElementById('inquiry-id').value = inquiryId;
    prefillFromQuote(inquiryId);
    proposalModal.show();
  }
})();
