let linkModal = null;

const STATUS_PILL_CLASS = {
  success: 'published', paid: 'published',
  pending: 'unread',
  failed: 'flagged', cancelled: 'archived',
};

function formatAmount(subunits, currency) {
  return `${currency} ${(subunits / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function renderTermsCell(payment) {
  if (payment.source !== 'tier_checkout') {
    return '<span class="small text-muted-custom">N/A</span>';
  }
  if (!payment.tos_accepted) {
    return '<span class="status-pill flagged">Missing</span>';
  }

  const acceptedAt = payment.tos_accepted_at ? new Date(payment.tos_accepted_at).toLocaleString() : 'Recorded';
  const version = payment.tos_version ? escapeHtml(payment.tos_version) : 'unknown';
  return `<span class="status-pill published">Accepted</span><br><span class="small text-muted-custom">v${version} · ${escapeHtml(acceptedAt)}</span>`;
}

function renderPaymentStats(rows) {
  const successful = rows.filter(p => p.status === 'success');
  const revenueByCurrency = {};
  successful.forEach(p => {
    revenueByCurrency[p.currency] = (revenueByCurrency[p.currency] || 0) + p.amount;
  });
  const revenueEntries = Object.entries(revenueByCurrency);

  document.getElementById('stat-revenue').textContent =
    revenueEntries.length > 0 ? revenueEntries.map(([currency, total]) => formatAmount(total, currency)).join(' + ') : '—';
  document.getElementById('stat-revenue-sub').textContent = `${successful.length} successful`;
  document.getElementById('stat-pending').textContent = rows.filter(p => p.status === 'pending').length;
  document.getElementById('stat-failed').textContent = rows.filter(p => p.status === 'failed').length;
  document.getElementById('stat-total').textContent = rows.length;
}

async function loadPayments() {
  const response = await api.get('/api/v1/admin/payments');
  const rows = Array.isArray(response) ? response : [];
  renderPaymentStats(rows);
  const tbody = document.getElementById('payments-tbody');
  const empty = document.getElementById('payments-empty');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted-custom py-4">No transactions yet.</td></tr>';
    empty.classList.add('d-none');
    return;
  }
  empty.classList.add('d-none');

  tbody.innerHTML = rows.map(p => `
    <tr>
      <td class="ps-3"><code class="small">${escapeHtml(p.reference)}</code></td>
      <td>${escapeHtml(p.customer_name || '—')}<br><span class="small text-muted-custom">${escapeHtml(p.email)}</span></td>
      <td>${formatAmount(p.amount, p.currency)}</td>
      <td class="small text-muted-custom">${p.source === 'payment_link' ? 'Payment link' : 'Tier checkout'}</td>
      <td>${renderTermsCell(p)}</td>
      <td><span class="status-pill ${STATUS_PILL_CLASS[p.status] || 'read'}">${p.status}</span></td>
      <td class="small text-muted-custom">${new Date(p.created_at).toLocaleString()}</td>
      <td class="text-end pe-3">
        ${p.status === 'pending' ? `<button class="btn btn-sm btn-outline-secondary recheck-btn" data-reference="${escapeHtml(p.reference)}">Recheck</button>` : ''}
        <button class="btn btn-sm btn-outline-danger delete-btn ms-1" data-reference="${escapeHtml(p.reference)}">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete this transaction?')) return;
      btn.disabled = true;
      try {
        await api.delete('/api/v1/admin/payments/' + btn.dataset.reference);
        await loadPayments();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });

  tbody.querySelectorAll('.recheck-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        // Same public verify endpoint the checkout page itself calls after a
        // successful charge -- reused here to re-ask Paystack directly for a
        // row that's been stuck pending (e.g. the webhook never fired).
        await api.post('/api/v1/payments/verify', { reference: btn.dataset.reference });
      } catch (_) {
        // Paystack may legitimately report "not found" for a checkout the
        // customer never finished -- either way, reload to show the result.
      }
      await loadPayments();
    });
  });
}

async function loadLinks() {
  const response = await api.get('/api/v1/admin/payment-links');
  const rows = Array.isArray(response) ? response : [];
  const tbody = document.getElementById('links-tbody');
  const empty = document.getElementById('links-empty');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted-custom py-4">No payment links yet.</td></tr>';
    empty.classList.add('d-none');
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
