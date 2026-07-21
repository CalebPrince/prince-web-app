let linkModal = null;
let notesModal = null;
let subscriptionModal = null;
let recordPaymentModal = null;
let notesReference = null;

const STATUS_PILL_CLASS = {
  success: 'published', paid: 'published', active: 'published',
  pending: 'unread',
  failed: 'flagged', past_due: 'flagged',
  cancelled: 'archived',
};

const SOURCE_LABEL = {
  payment_link: 'Payment link',
  tier_checkout: 'Tier checkout',
  manual: 'Manual',
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
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted-custom py-4">No transactions yet.</td></tr>';
    empty.classList.add('d-none');
    return;
  }
  empty.classList.add('d-none');

  tbody.innerHTML = rows.map(p => `
    <tr>
      <td class="ps-3"><code class="small">${escapeHtml(p.reference)}</code></td>
      <td>${escapeHtml(p.customer_name || '—')}<br><span class="small text-muted-custom">${escapeHtml(p.email)}</span></td>
      <td>${formatAmount(p.amount, p.currency)}</td>
      <td class="small text-muted-custom">${SOURCE_LABEL[p.source] || 'Tier checkout'}</td>
      <td>${renderTermsCell(p)}</td>
      <td><span class="status-pill ${STATUS_PILL_CLASS[p.status] || 'read'}">${p.status}</span></td>
      <td class="text-center">
        <input type="checkbox" class="form-check-input reviewed-checkbox" data-reference="${escapeHtml(p.reference)}" ${p.reviewed ? 'checked' : ''}>
      </td>
      <td class="small text-muted-custom">${new Date(p.created_at).toLocaleString()}</td>
      <td class="text-end pe-3">
        ${p.status === 'pending' || p.status === 'failed' ? `<button class="btn btn-sm btn-outline-secondary recheck-btn" data-reference="${escapeHtml(p.reference)}">Recheck</button>` : ''}
        <button class="btn btn-sm btn-outline-secondary notes-btn ms-1" data-reference="${escapeHtml(p.reference)}" data-notes="${escapeHtml(p.notes || '')}">${p.notes ? 'Notes ✓' : 'Add note'}</button>
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
        // row that's been stuck pending or failed (e.g. the webhook never fired).
        await api.post('/api/v1/payments/verify', { reference: btn.dataset.reference });
      } catch (_) {
        // Paystack may legitimately report "not found" for a checkout the
        // customer never finished -- either way, reload to show the result.
      }
      await loadPayments();
    });
  });

  tbody.querySelectorAll('.reviewed-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      try {
        await api.patch(`/api/v1/admin/payments/${encodeURIComponent(checkbox.dataset.reference)}`, {
          reviewed: checkbox.checked,
        });
      } catch (err) {
        alert(err.message);
        checkbox.checked = !checkbox.checked;
      } finally {
        checkbox.disabled = false;
      }
    });
  });

  tbody.querySelectorAll('.notes-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      notesReference = btn.dataset.reference;
      document.getElementById('notes-textarea').value = btn.dataset.notes || '';
      notesModal.show();
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
        ${l.status === 'pending' ? `<button class="btn btn-sm btn-outline-secondary mark-link-paid-btn ms-1" data-id="${l.id}">Mark as paid</button>` : ''}
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

  tbody.querySelectorAll('.mark-link-paid-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm("Mark this as paid? Only do this once you've actually confirmed the money in your wallet/account.")) return;
      btn.disabled = true;
      try {
        await api.post(`/api/v1/admin/payment-links/${btn.dataset.id}/mark-paid`, {});
        await Promise.all([loadLinks(), loadPayments()]);
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });
}

const INTERVAL_LABEL = {
  monthly: '/month', quarterly: '/quarter', biannually: '/6 months', annually: '/year',
};

async function loadSubscriptions() {
  const response = await api.get('/api/v1/admin/subscriptions');
  const rows = Array.isArray(response) ? response : [];
  const tbody = document.getElementById('subscriptions-tbody');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted-custom py-4">No subscriptions yet. Create one to bill a client on a schedule.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(s => `
    <tr>
      <td class="ps-3">${escapeHtml(s.client_name)}<br><span class="small text-muted-custom">${escapeHtml(s.client_email)}</span></td>
      <td>${escapeHtml(s.plan_name)}</td>
      <td>${formatAmount(s.amount, s.currency)}<span class="small text-muted-custom">${INTERVAL_LABEL[s.billing_interval] || ''}</span></td>
      <td><span class="status-pill ${STATUS_PILL_CLASS[s.status] || 'read'}">${escapeHtml(s.status)}</span></td>
      <td class="small text-muted-custom">${s.next_payment_at ? new Date(s.next_payment_at + 'Z').toLocaleDateString() : '—'}</td>
      <td class="small">${s.charge_count > 0 ? `${formatAmount(s.charged_total, s.currency)} <span class="text-muted-custom">(${s.charge_count})</span>` : '—'}</td>
      <td class="text-end pe-3 text-nowrap">
        ${s.status === 'pending' && s.checkout_url ? `<button class="btn btn-sm btn-outline-secondary copy-checkout-btn" data-url="${escapeHtml(s.checkout_url)}">Copy checkout link</button>` : ''}
        ${s.status === 'active' || s.status === 'past_due' ? `<button class="btn btn-sm btn-outline-danger cancel-sub-btn ms-1" data-id="${s.id}">Cancel</button>` : ''}
        ${s.status === 'pending' || s.status === 'cancelled' ? `<button class="btn btn-sm btn-outline-danger delete-sub-btn ms-1" data-id="${s.id}">Delete</button>` : ''}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.copy-checkout-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.url);
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = original; }, 2000);
      } catch (_) {
        prompt('Copy this link:', btn.dataset.url);
      }
    });
  });

  tbody.querySelectorAll('.cancel-sub-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Cancel this subscription? Paystack will stop charging the client.')) return;
      btn.disabled = true;
      try {
        await api.post(`/api/v1/admin/subscriptions/${btn.dataset.id}/cancel`, {});
        await loadSubscriptions();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });

  tbody.querySelectorAll('.delete-sub-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this subscription record?')) return;
      try {
        await api.delete(`/api/v1/admin/subscriptions/${btn.dataset.id}`);
        await loadSubscriptions();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function switchTab(tab) {
  ['transactions', 'links', 'subscriptions'].forEach(name => {
    document.getElementById(`tab-${name}`).classList.toggle('active', tab === name);
    document.getElementById(`panel-${name}`).classList.toggle('d-none', tab !== name);
  });
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  linkModal = new bootstrap.Modal(document.getElementById('link-modal'));
  notesModal = new bootstrap.Modal(document.getElementById('notes-modal'));
  document.getElementById('notes-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!notesReference) return;
    try {
      await api.patch(`/api/v1/admin/payments/${encodeURIComponent(notesReference)}`, {
        notes: document.getElementById('notes-textarea').value,
      });
      notesModal.hide();
      await loadPayments();
    } catch (err) {
      alert(err.message);
    }
  });
  document.getElementById('new-link-btn').addEventListener('click', () => {
    document.getElementById('link-form').reset();
    document.getElementById('link-form').classList.remove('d-none');
    document.getElementById('link-result').classList.add('d-none');
    document.getElementById('link-msg').classList.add('d-none');
    linkModal.show();
  });

  recordPaymentModal = new bootstrap.Modal(document.getElementById('record-payment-modal'));
  document.getElementById('record-payment-btn').addEventListener('click', () => {
    document.getElementById('record-payment-form').reset();
    document.getElementById('record-payment-msg').classList.add('d-none');
    recordPaymentModal.show();
  });

  document.getElementById('record-payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('record-payment-msg');
    msg.classList.add('d-none');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const result = await api.post('/api/v1/admin/payments/manual', {
        description: document.getElementById('record-description').value,
        amount: Number(document.getElementById('record-amount').value),
        currency: document.getElementById('record-currency').value,
        customer_name: document.getElementById('record-client-name').value,
        email: document.getElementById('record-client-email').value,
        paid_at: document.getElementById('record-paid-at').value,
        notes: document.getElementById('record-notes').value,
        send_receipt: document.getElementById('record-send-receipt').checked,
      });
      recordPaymentModal.hide();
      await loadPayments();
      if (document.getElementById('record-send-receipt').checked && !result.receipt_sent) {
        alert('Payment recorded, but the receipt email could not be sent — check Email delivery (SMTP) settings.');
      }
    } catch (err) {
      msg.className = 'alert alert-danger py-2 small';
      msg.textContent = err.message;
      msg.classList.remove('d-none');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('tab-transactions').addEventListener('click', () => switchTab('transactions'));
  document.getElementById('tab-links').addEventListener('click', () => switchTab('links'));
  document.getElementById('tab-subscriptions').addEventListener('click', () => switchTab('subscriptions'));

  subscriptionModal = new bootstrap.Modal(document.getElementById('subscription-modal'));
  document.getElementById('new-subscription-btn').addEventListener('click', () => {
    document.getElementById('subscription-form').reset();
    document.getElementById('subscription-form').classList.remove('d-none');
    document.getElementById('subscription-result').classList.add('d-none');
    document.getElementById('subscription-msg').classList.add('d-none');
    subscriptionModal.show();
  });

  document.getElementById('subscription-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('subscription-msg');
    msg.classList.add('d-none');
    try {
      const result = await api.post('/api/v1/admin/subscriptions', {
        client_name: document.getElementById('sub-client-name').value,
        client_email: document.getElementById('sub-client-email').value,
        plan_name: document.getElementById('sub-plan-name').value,
        amount: Number(document.getElementById('sub-amount').value),
        currency: document.getElementById('sub-currency').value,
        billing_interval: document.getElementById('sub-interval').value,
      });
      document.getElementById('subscription-form').classList.add('d-none');
      document.getElementById('subscription-result-url').value = result.checkout_url;
      document.getElementById('subscription-result').classList.remove('d-none');
      await loadSubscriptions();
    } catch (err) {
      msg.className = 'alert alert-danger py-2 small';
      msg.textContent = err.message;
      msg.classList.remove('d-none');
    }
  });

  document.getElementById('copy-subscription-result-btn').addEventListener('click', async () => {
    const input = document.getElementById('subscription-result-url');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (_) {
      input.select();
    }
  });

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

  await Promise.all([loadPayments(), loadLinks(), loadSubscriptions()]);
})();
