const INBOX_META = {
  inquiry: { label: 'Inquiry', icon: 'bi-envelope', tone: 'blue' },
  quote: { label: 'Quote request', icon: 'bi-file-earmark-text', tone: 'violet' },
  chat: { label: 'Live chat', icon: 'bi-chat-dots', tone: 'amber' },
  whatsapp: { label: 'WhatsApp', icon: 'bi-whatsapp', tone: 'green' },
  client: { label: 'Client portal', icon: 'bi-people', tone: 'rose' },
};
let inboxItems = [], inboxSource = '', inboxQuery = '', activeInboxKey = '';
const inboxEsc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const inboxTime = value => { const date = new Date(value + 'Z'); return (Date.now() - date.getTime()) / 86400000 < 1 ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
const inboxType = item => ['inquiry', 'quote'].includes(item.source) ? 'inquiry' : (['chat', 'whatsapp'].includes(item.source) ? 'chat' : 'client');

function visibleInbox() {
  const query = inboxQuery.toLowerCase();
  return inboxItems.filter(item => {
    const stateVisible = inboxSource === 'archived' ? item.state === 'archived' : inboxSource === 'flagged' ? item.state === 'flagged' : !['archived', 'deleted'].includes(item.state);
    const sourceVisible = !inboxSource || ['archived', 'flagged'].includes(inboxSource) || (inboxSource === 'unread' ? item.unread : (inboxSource === 'chat' ? ['chat', 'whatsapp'].includes(item.source) : item.source === inboxSource));
    return stateVisible && sourceVisible && (!query || [item.name, item.email, item.phone, item.preview].some(value => String(value || '').toLowerCase().includes(query)));
  });
}

function renderInbox() {
  document.getElementById('inbox-unread-count').textContent = `${inboxItems.filter(item => item.unread && !['archived', 'deleted'].includes(item.state)).length} unread`;
  document.getElementById('inbox-list').innerHTML = visibleInbox().map(item => {
    const meta = INBOX_META[item.source];
    return `<button class="unified-inbox-row source-${meta.tone} ${item.unread ? 'is-unread' : ''} ${item.key === activeInboxKey ? 'active' : ''}" data-key="${inboxEsc(item.key)}" role="option"><span class="inbox-source-icon"><i class="bi ${meta.icon}"></i></span><span class="inbox-row-main"><span class="inbox-row-top"><strong>${inboxEsc(item.name)}</strong><time>${inboxTime(item.created_at)}</time></span><span class="inbox-channel">${meta.label}${item.flagged ? ' · Flagged' : ''}${item.state === 'archived' ? ' · Archived' : ''}</span><span class="inbox-preview">${inboxEsc(item.preview)}</span></span></button>`;
  }).join('') || '<div class="unified-inbox-empty">No conversations match this view.</div>';
  document.querySelectorAll('.unified-inbox-row').forEach(row => row.addEventListener('click', () => openInboxItem(row.dataset.key)));
}

function transcriptHtml(messages) { return (messages || []).map(message => `<div class="inbox-transcript ${message.role === 'user' ? 'from-client' : 'from-admin'}"><small>${message.role === 'user' ? 'Visitor' : 'Lisa'}</small><p>${inboxEsc(message.text)}</p></div>`).join(''); }
function clientThreadHtml(messages) { return (messages || []).map(message => `<div class="inbox-transcript ${message.sender_type === 'client' ? 'from-client' : 'from-admin'}"><small>${message.sender_type === 'client' ? 'Client' : 'Prince Caleb'} · ${new Date(message.created_at + 'Z').toLocaleString()}</small><p>${inboxEsc(message.body)}</p></div>`).join(''); }
function emptyReader() { document.getElementById('inbox-reader').innerHTML = '<div class="inquiry-reader-empty"><div class="inquiry-empty-mark"><i class="bi bi-inboxes"></i></div><h4>Select a conversation</h4><p>Choose any channel from the list to read it here.</p></div>'; }

async function changeInboxState(item, state) {
  if (state === 'deleted' && !confirm('Remove this conversation from the Inbox? The original record will remain available in its source page.')) return false;
  await api.patch(`/api/v1/admin/inbox/${inboxType(item)}/${item.source_id}/state`, { state });
  item.state = state; item.flagged = state === 'flagged'; activeInboxKey = ''; emptyReader(); renderInbox();
  return true;
}

async function openInboxItem(key) {
  const item = inboxItems.find(candidate => candidate.key === key); if (!item) return;
  activeInboxKey = key;
  if (item.unread) { await api.patch(`/api/v1/admin/inbox/${inboxType(item)}/${item.source_id}/read`, {}); item.unread = false; window.dispatchEvent(new Event('admin:notifications-changed')); }
  const meta = INBOX_META[item.source], detail = item.detail || {};
  const body = item.source === 'client' ? clientThreadHtml(detail.messages) : (detail.transcript ? transcriptHtml(detail.transcript) : `<div class="inbox-message-body">${inboxEsc(detail.message || item.preview).replace(/\n/g, '<br>')}</div>`);
  const facts = [detail.project_type && ['Project', detail.project_type], detail.budget && ['Budget', detail.budget], detail.timeline && ['Timeline', detail.timeline], detail.features && ['Features', detail.features]].filter(Boolean);
  document.getElementById('inbox-reader').innerHTML = `<header class="inbox-reader-head source-${meta.tone}"><div class="inbox-reader-toolbar"><div class="inbox-reader-source"><i class="bi ${meta.icon}"></i>${meta.label}</div><div class="inbox-state-actions"><button type="button" data-inbox-state="${item.state === 'flagged' ? 'normal' : 'flagged'}" class="${item.state === 'flagged' ? 'active' : ''}" title="${item.state === 'flagged' ? 'Remove flag' : 'Flag conversation'}"><i class="bi bi-flag${item.state === 'flagged' ? '-fill' : ''}"></i></button><button type="button" data-inbox-state="${item.state === 'archived' ? 'normal' : 'archived'}" title="${item.state === 'archived' ? 'Move to inbox' : 'Archive conversation'}"><i class="bi bi-archive"></i></button><button type="button" data-inbox-state="deleted" class="danger" title="Delete from inbox"><i class="bi bi-trash3"></i></button></div></div><h3>${inboxEsc(item.name)}</h3><p>${inboxEsc(item.email || item.phone || 'No contact details')}</p><div class="inbox-reader-actions">${item.email ? `<a class="btn btn-sm btn-brand" href="mailto:${inboxEsc(item.email)}">Reply by email</a>` : ''}${item.phone ? `<a class="btn btn-sm btn-outline-secondary" href="tel:${inboxEsc(item.phone)}">Call</a>` : ''}<a class="btn btn-sm btn-outline-secondary" href="${inboxEsc(item.source_url)}">Open source <i class="bi bi-arrow-up-right"></i></a></div></header>${facts.length ? `<dl class="inbox-facts">${facts.map(fact => `<div><dt>${fact[0]}</dt><dd>${inboxEsc(fact[1])}</dd></div>`).join('')}</dl>` : ''}<div class="inbox-reader-body">${body}</div>${item.source === 'client' ? '<form id="inbox-client-reply" class="inbox-reply"><label for="inbox-reply-body">Reply in client portal</label><textarea id="inbox-reply-body" class="form-control" rows="3" required placeholder="Write a message"></textarea><div><button class="btn-brand border-0" type="submit">Send reply</button><span id="inbox-reply-status"></span></div></form>' : ''}`;
  document.querySelectorAll('[data-inbox-state]').forEach(button => button.addEventListener('click', async () => { button.disabled = true; try { const changed = await changeInboxState(item, button.dataset.inboxState); if (!changed) button.disabled = false; } catch (err) { alert(err.message || 'Could not update the conversation.'); button.disabled = false; } }));
  if (item.source === 'client') document.getElementById('inbox-client-reply').addEventListener('submit', async event => { event.preventDefault(); const button = event.currentTarget.querySelector('button'), status = document.getElementById('inbox-reply-status'), reply = document.getElementById('inbox-reply-body').value; button.disabled = true; status.textContent = 'Sending…'; try { await api.post(`/api/v1/admin/clients/${item.source_id}/messages`, { body: reply }); status.textContent = 'Sent'; setTimeout(() => location.reload(), 500); } catch (err) { status.textContent = err.message || 'Could not send.'; button.disabled = false; } });
  renderInbox();
}

(async function initInbox() {
  const user = await requireAdminAuth(); if (!user) return; wireLogout();
  try {
    const data = await api.get('/api/v1/admin/inbox'); inboxItems = data.items || [];
    document.getElementById('inbox-search').addEventListener('input', event => { inboxQuery = event.target.value.trim(); renderInbox(); });
    document.querySelectorAll('#inbox-filters button').forEach(button => button.addEventListener('click', () => { document.querySelector('#inbox-filters .active')?.classList.remove('active'); button.classList.add('active'); inboxSource = button.dataset.source; renderInbox(); }));
    renderInbox(); let requested = new URLSearchParams(location.search).get('open'); if (requested && !inboxItems.some(item => item.key === requested) && requested.startsWith('inquiry:')) requested = requested.replace('inquiry:', 'quote:'); if (requested) openInboxItem(requested);
  } catch (err) { document.getElementById('inbox-list').innerHTML = `<div class="alert alert-danger m-3">${inboxEsc(err.message || 'Could not load the inbox.')}</div>`; }
})();
