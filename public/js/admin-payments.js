let linkModal = null;

const STATUS_PILL_CLASS = {
  success: 'published', paid: 'published',
  pending: 'unread',
  failed: 'flagged', cancelled: 'archived',
};

function formatAmount(subunits, currency) {
  return `${currency} ${(subunits / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

async function loadPayments() {
  const rows = await api.get('/api/v1/admin/payments');
  const tbody = document.getElementById('payments-tbody');
  const empty = document.getElementById('payments-empty');

  if (rows.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');

  tbody.innerHTML = rows.map(p => `
    <tr>
      <td class="ps-3"><code class="small">${escapeHtml(p.reference)}</code></td>
      <td>${escapeHtml(p.customer_name || '—')}<br><span class="small text-muted-custom">${escapeHtml(p.email)}</span></td>
      <td>${formatAmount(p.amount, p.currency)}</td>
      <td class="small text-muted-custom">${p.source === 'payment_link' ? 'Payment link' : 'Tier checkout'}</td>
      <td><span class="status-pill ${STATUS_PILL_CLASS[p.status] || 'read'}">${p.status}</span></td>
      <td class="text-end pe-3 small text-muted-custom">${new Date(p.created_at).toLocaleString()}</td>
    </tr>
  `).join('');
}

async function loadLinks() {
  const rows = await api.get('/api/v1/admin/payment-links');
  const tbody = document.getElementById('links-tbody');
  const empty = document.getElementById('links-empty');

  if (rows.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');

  tbody.innerHTML = rows.map(l => `
    <tr>
      <td class="ps-3">${escapeHtml(l.client_name)}<br><span class="small text-muted-custom">${escapeHtml(l.client_email)}</span></td>
      <td>${escapeHtml(l.description)}</td>
      <td>${formatAmount(l.amount, l.currency)}</td>
      <td><span class="status-pill ${STATUS_PILL_CLASS[l.status] || 'read'}">${l.status}</span></td>
      <td class="text-end pe-3">
        <button class="btn btn-sm btn-outline-secondary copy-link-btn" data-token="${l.token}">Copy link</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.copy-link-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const url = `${window.location.origin}/pay.html?token=${btn.dataset.token}`;
      try {
        await navigator.clipboard.writeText(url);
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = original; }, 2000);
      } catch (_) {
        prompt('Copy this link:', url);
      }
    });
  });
}

function switchTab(tab) {
  document.getElementById('tab-transactions').classList.toggle('active', tab === 'transactions');
  document.getElementById('tab-links').classList.toggle('active', tab === 'links');
  document.getElementById('panel-transactions').classList.toggle('d-none', tab !== 'transactions');
  document.getElementById('panel-links').classList.toggle('d-none', tab !== 'links');
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  linkModal = new bootstrap.Modal(document.getElementById('link-modal'));
  document.getElementById('new-link-btn').addEventListener('click', () => {
    document.getElementById('link-form').reset();
    document.getElementById('link-form').classList.remove('d-none');
    document.getElementById('link-result').classList.add('d-none');
    document.getElementById('link-msg').classList.add('d-none');
    linkModal.show();
  });

  document.getElementById('tab-transactions').addEventListener('click', () => switchTab('transactions'));
  document.getElementById('tab-links').addEventListener('click', () => switchTab('links'));

  document.getElementById('link-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('link-msg');
    msg.classList.add('d-none');
    try {
      const result = await api.post('/api/v1/admin/payment-links', {
        client_name: document.getElementById('client-name').value,
        client_email: document.getElementById('client-email').value,
        amount: Number(document.getElementById('link-amount').value),
        currency: document.getElementById('link-currency').value,
        description: document.getElementById('link-description').value,
      });
      document.getElementById('link-form').classList.add('d-none');
      document.getElementById('link-result-url').value = `${window.location.origin}${result.url}`;
      document.getElementById('link-result').classList.remove('d-none');
      await loadLinks();
    } catch (err) {
      msg.className = 'alert alert-danger py-2 small';
      msg.textContent = err.message;
      msg.classList.remove('d-none');
    }
  });

  document.getElementById('copy-link-result-btn').addEventListener('click', async () => {
    const input = document.getElementById('link-result-url');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (_) {
      input.select();
    }
  });

  await Promise.all([loadPayments(), loadLinks()]);
})();
