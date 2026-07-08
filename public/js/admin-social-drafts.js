let draftModal = null;
let currentDraftId = null;
let currentDrafts = [];

const STATUS_CLASS = {
  draft: 'unread',
  approved: 'published',
  rejected: 'flagged',
};

const SOURCE_LABEL = {
  blog: 'Blog post',
  project: 'Case study',
  testimonial: 'Testimonial',
  general: 'Original idea',
};

// ai_provider is either 'gemini' or the exact openrouter_model string
// (e.g. 'anthropic/claude-haiku-4.5') — not a fixed set of values, since
// the admin can point openrouter_model at any model OpenRouter offers.
function providerLabel(value) {
  if (!value) return '';
  if (value === 'gemini') return 'Gemini';
  if (value === 'openrouter' || value === 'openrouter/free') return 'OpenRouter';
  const name = value.includes('/') ? value.split('/').pop() : value;
  return name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function renderDraftsTable(drafts) {
  currentDrafts = drafts;
  const tbody = document.getElementById('drafts-tbody');
  const empty = document.getElementById('empty-state');

  if (!drafts.length) {
    tbody.innerHTML = '';
    empty.classList.remove('d-none');
    return;
  }
  empty.classList.add('d-none');

  tbody.innerHTML = drafts.map(d => `
    <tr>
      <td class="ps-3">${SOURCE_LABEL[d.source_type] || d.source_type}</td>
      <td class="small text-muted-custom" style="max-width: 420px;">${escapeHtml((d.content || '').slice(0, 140))}${(d.content || '').length > 140 ? '…' : ''}</td>
      <td>
        <span class="status-pill ${STATUS_CLASS[d.status] || 'unread'}">${escapeHtml(d.status)}</span>
        ${d.ai_provider ? `<div class="small text-muted-custom mt-1">${escapeHtml(providerLabel(d.ai_provider))}</div>` : ''}
      </td>
      <td class="small text-muted-custom">${new Date(d.created_at).toLocaleString()}</td>
      <td class="text-end pe-3">
        <button type="button" class="btn btn-sm btn-outline-secondary review-btn" data-id="${d.id}">Review</button>
        <button type="button" class="btn btn-sm btn-outline-danger delete-btn" data-id="${d.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.review-btn').forEach(btn => {
    btn.addEventListener('click', () => openDraftModal(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this draft?')) return;
      try {
        await api.delete(`/api/v1/admin/social-drafts/${btn.dataset.id}`);
        await loadDrafts();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function loadDrafts() {
  const drafts = await api.get('/api/v1/admin/social-drafts');
  renderDraftsTable(Array.isArray(drafts) ? drafts : []);
}

function updateImagePreview() {
  const url = document.getElementById('draft-image-url').value.trim();
  const preview = document.getElementById('draft-image-preview');
  if (url) {
    preview.src = url;
    preview.classList.remove('d-none');
  } else {
    preview.classList.add('d-none');
  }
}

function openDraftModal(id) {
  const draft = currentDrafts.find(d => d.id === id);
  if (!draft) return;
  currentDraftId = id;

  document.getElementById('draft-modal-source').textContent = SOURCE_LABEL[draft.source_type] || draft.source_type;
  document.getElementById('draft-modal-provider').textContent = draft.ai_provider
    ? `Generated with ${providerLabel(draft.ai_provider)}`
    : '';
  document.getElementById('draft-content').value = draft.content || '';
  document.getElementById('draft-short-content').value = draft.short_content || '';
  document.getElementById('draft-hashtags').value = draft.hashtags || '';
  document.getElementById('draft-image-url').value = draft.image_url || '';
  updateImagePreview();
  document.getElementById('draft-modal-alert').classList.add('d-none');

  const approveBtn = document.getElementById('draft-approve-btn');
  approveBtn.textContent = draft.status === 'approved' ? 'Already approved' : 'Approve';
  approveBtn.disabled = draft.status === 'approved';

  draftModal.show();
}

function showModalAlert(message, isError) {
  const alertBox = document.getElementById('draft-modal-alert');
  alertBox.className = `alert py-2 small ${isError ? 'alert-danger' : 'alert-success'}`;
  alertBox.textContent = message;
  alertBox.classList.remove('d-none');
}

async function saveDraft(extra = {}) {
  const payload = {
    content: document.getElementById('draft-content').value.trim(),
    short_content: document.getElementById('draft-short-content').value.trim(),
    hashtags: document.getElementById('draft-hashtags').value.trim(),
    image_url: document.getElementById('draft-image-url').value.trim(),
    ...extra,
  };
  await api.patch(`/api/v1/admin/social-drafts/${currentDraftId}`, payload);
  await loadDrafts();
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  draftModal = new bootstrap.Modal(document.getElementById('draft-modal'));
  document.getElementById('draft-image-url').addEventListener('input', updateImagePreview);

  document.getElementById('generate-now-btn').addEventListener('click', async () => {
    const btn = document.getElementById('generate-now-btn');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generating…';
    try {
      await api.post('/api/v1/admin/social-drafts/generate', {});
      await loadDrafts();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  });

  document.getElementById('draft-save-btn').addEventListener('click', async () => {
    try {
      await saveDraft();
      showModalAlert('Saved.', false);
    } catch (err) {
      showModalAlert(err.message, true);
    }
  });

  document.getElementById('draft-approve-btn').addEventListener('click', async () => {
    try {
      await saveDraft({ status: 'approved' });
      draftModal.hide();
    } catch (err) {
      showModalAlert(err.message, true);
    }
  });

  document.getElementById('draft-reject-btn').addEventListener('click', async () => {
    try {
      await saveDraft({ status: 'rejected' });
      draftModal.hide();
    } catch (err) {
      showModalAlert(err.message, true);
    }
  });

  await loadDrafts();
})();
