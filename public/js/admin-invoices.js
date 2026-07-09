let invoiceModal = null;
let editingId = null;

const INVOICE_PILL_CLASS = {
  paid: 'published',
  sent: 'unread',
  draft: 'read',
  void: 'archived',
};

function formatAmount(subunits, currency) {
  return `${currency} ${(subunits / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function isOverdue(invoice) {
  return invoice.status === 'sent' && invoice.due_date && invoice.due_date < new Date().toISOString().slice(0, 10);
}

function renderStats(rows) {
  const paid = rows.filter(i => i.status === 'paid');
  const outstanding = rows.filter(i => i.status === 'sent');
  const sumByCurrency = list => {
    const totals = {};
    list.forEach(i => { totals[i.currency] = (totals[i.currency] || 0) + i.total; });
    const entries = Object.entries(totals);
    return entries.length ? entries.map(([c, t]) => formatAmount(t, c)).join(' + ') : '—';
  };

  document.getElementById('stat-collected').textContent = sumByCurrency(paid);
  document.getElementById('stat-collected-sub').textContent = `${paid.length} paid`;
  document.getElementById('stat-outstanding').textContent = sumByCurrency(outstanding);
  document.getElementById('stat-outstanding-sub').textContent = `${outstanding.length} awaiting payment`;
  document.getElementById('stat-drafts').textContent = rows.filter(i => i.status === 'draft').length;
  document.getElementById('stat-overdue').textContent = rows.filter(isOverdue).length;
}

async function loadInvoices() {
  const response = await api.get('/api/v1/admin/invoices');
  const rows = Array.isArray(response) ? response : [];
  renderStats(rows);
  const tbody = document.getElementById('invoices-tbody');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted-custom py-4">No invoices yet. Create your first one.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(inv => `
    <tr>
      <td class="ps-3"><code class="small">${escapeHtml(inv.invoice_number)}</code></td>
      <td>${escapeHtml(inv.client_name)}<br><span class="small text-muted-custom">${escapeHtml(inv.client_email)}</span></td>
      <td>${formatAmount(inv.total, inv.currency)}</td>
      <td>
        <span class="status-pill ${INVOICE_PILL_CLASS[inv.status] || 'read'}">${inv.status}</span>
        ${isOverdue(inv) ? '<span class="status-pill flagged ms-1">overdue</span>' : ''}
      </td>
      <td class="small text-muted-custom">${escapeHtml(inv.issue_date || '')}</td>
      <td class="small text-muted-custom">${escapeHtml(inv.due_date || '—')}</td>
      <td class="text-end pe-3 text-nowrap">
        <a class="btn btn-sm btn-outline-secondary" href="/invoice.html?token=${encodeURIComponent(inv.token)}" target="_blank" rel="noopener">View</a>
        ${inv.status !== 'paid' && inv.status !== 'void' ? `
          <button class="btn btn-sm btn-outline-secondary edit-btn ms-1" data-id="${inv.id}">Edit</button>
          <button class="btn btn-sm btn-brand-outline send-btn ms-1" data-id="${inv.id}">${inv.status === 'sent' ? 'Re-send' : 'Send'}</button>
          <button class="btn btn-sm btn-outline-secondary mark-paid-btn ms-1" data-id="${inv.id}">Mark paid</button>
          <button class="btn btn-sm btn-outline-danger void-btn ms-1" data-id="${inv.id}">Void</button>
        ` : ''}
        ${inv.status !== 'paid' ? `<button class="btn btn-sm btn-outline-danger delete-btn ms-1" data-id="${inv.id}">Delete</button>` : ''}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openModal(Number(btn.dataset.id)));
  });

  tbody.querySelectorAll('.send-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Email this invoice to the client (with a pay-online link)?')) return;
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        await api.post(`/api/v1/admin/invoices/${btn.dataset.id}/send`, {});
        await loadInvoices();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = 'Send';
      }
    });
  });

  tbody.querySelectorAll('.mark-paid-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Mark this invoice as paid (e.g. bank transfer or cash received outside Paystack)?')) return;
      try {
        await api.patch(`/api/v1/admin/invoices/${btn.dataset.id}`, { status: 'paid' });
        await loadInvoices();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  tbody.querySelectorAll('.void-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Void this invoice? It stays viewable but can no longer be paid or edited.')) return;
      try {
        await api.patch(`/api/v1/admin/invoices/${btn.dataset.id}`, { status: 'void' });
        await loadInvoices();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this invoice permanently?')) return;
      try {
        await api.delete(`/api/v1/admin/invoices/${btn.dataset.id}`);
        await loadInvoices();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function itemRowHtml(item = {}) {
  return `
    <div class="row g-2 mb-2 inv-item-row">
      <div class="col-6">
        <input type="text" class="form-control item-description" placeholder="Description" value="${escapeHtml(item.description || '')}">
      </div>
      <div class="col-2">
        <input type="number" min="0" step="any" class="form-control item-quantity" placeholder="Qty" value="${item.quantity ?? 1}">
      </div>
      <div class="col-3">
        <input type="number" min="0" step="0.01" class="form-control item-price" placeholder="Unit price" value="${item.unit_amount != null ? (item.unit_amount / 100).toFixed(2) : ''}">
      </div>
      <div class="col-1 d-flex align-items-center">
        <button type="button" class="btn btn-sm btn-outline-danger remove-item-btn" aria-label="Remove line">&times;</button>
      </div>
    </div>`;
}

function wireItemRows() {
  const container = document.getElementById('inv-items');
  container.querySelectorAll('.remove-item-btn').forEach(btn => {
    btn.onclick = () => {
      if (container.querySelectorAll('.inv-item-row').length > 1) {
        btn.closest('.inv-item-row').remove();
      } else {
        btn.closest('.inv-item-row').querySelectorAll('input').forEach(i => { i.value = ''; });
      }
      updateTotal();
    };
  });
  container.querySelectorAll('input').forEach(input => {
    input.oninput = updateTotal;
  });
}

function collectItems() {
  return Array.from(document.querySelectorAll('.inv-item-row')).map(row => ({
    description: row.querySelector('.item-description').value.trim(),
    quantity: Number(row.querySelector('.item-quantity').value) || 1,
    unit_price: Number(row.querySelector('.item-price').value) || 0,
  })).filter(item => item.description !== '' || item.unit_price > 0);
}

function updateTotal() {
  const currency = document.getElementById('inv-currency').value;
  const total = collectItems().reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  document.getElementById('inv-total').textContent =
    `Total: ${currency} ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

async function openModal(id = null) {
  editingId = id;
  const form = document.getElementById('invoice-form');
  form.reset();
  document.getElementById('invoice-msg').classList.add('d-none');
  document.getElementById('invoice-modal-title').textContent = id ? 'Edit Invoice' : 'New Invoice';
  document.getElementById('inv-issue-date').value = new Date().toISOString().slice(0, 10);

  const itemsContainer = document.getElementById('inv-items');
  itemsContainer.innerHTML = itemRowHtml();

  if (id) {
    try {
      const invoice = await api.get(`/api/v1/admin/invoices/${id}`);
      document.getElementById('inv-client-name').value = invoice.client_name;
      document.getElementById('inv-client-email').value = invoice.client_email;
      document.getElementById('inv-currency').value = invoice.currency;
      document.getElementById('inv-issue-date').value = invoice.issue_date || '';
      document.getElementById('inv-due-date').value = invoice.due_date || '';
      document.getElementById('inv-notes').value = invoice.notes || '';
      itemsContainer.innerHTML = (invoice.items || []).map(itemRowHtml).join('') || itemRowHtml();
    } catch (err) {
      alert(err.message);
      return;
    }
  }

  wireItemRows();
  updateTotal();
  invoiceModal.show();
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  invoiceModal = new bootstrap.Modal(document.getElementById('invoice-modal'));

  document.getElementById('new-invoice-btn').addEventListener('click', () => openModal());
  document.getElementById('inv-currency').addEventListener('change', updateTotal);
  document.getElementById('add-item-btn').addEventListener('click', () => {
    document.getElementById('inv-items').insertAdjacentHTML('beforeend', itemRowHtml());
    wireItemRows();
  });

  document.getElementById('invoice-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('invoice-msg');
    msg.classList.add('d-none');
    const saveBtn = document.getElementById('invoice-save-btn');
    saveBtn.disabled = true;

    const payload = {
      client_name: document.getElementById('inv-client-name').value,
      client_email: document.getElementById('inv-client-email').value,
      currency: document.getElementById('inv-currency').value,
      issue_date: document.getElementById('inv-issue-date').value,
      due_date: document.getElementById('inv-due-date').value || null,
      notes: document.getElementById('inv-notes').value,
      items: collectItems(),
    };

    try {
      if (editingId) {
        await api.put(`/api/v1/admin/invoices/${editingId}`, payload);
      } else {
        await api.post('/api/v1/admin/invoices', payload);
      }
      invoiceModal.hide();
      await loadInvoices();
    } catch (err) {
      msg.className = 'alert alert-danger py-2 small';
      msg.textContent = err.message;
      msg.classList.remove('d-none');
    } finally {
      saveBtn.disabled = false;
    }
  });

  await loadInvoices();
})();
