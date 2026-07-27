"use strict";

const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));
const VIEW_KEY = 'chief-reporting-view-v1';
let dashboardData = null;

function briefDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function showError(message) {
  const box = document.getElementById('chief-error');
  box.textContent = message;
  box.classList.remove('d-none');
}

function renderDailyBrief(brief) {
  const card = document.getElementById('daily-brief-card');
  const head = `<div class="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-2">
    <div><span class="brief-kicker text-muted-custom">DAILY BRIEF${brief ? ` — ${esc(briefDate(brief.brief_date))}` : ''}</span>
    <h4 class="mb-0 mt-1">${brief ? esc(brief.headline) : 'No brief yet'}</h4></div>
    <button type="button" class="btn btn-sm btn-outline-secondary" id="brief-run-btn">Write today's brief</button></div>`;
  card.innerHTML = brief
    ? `${head}<p class="brief-body">${esc(brief.body)}</p><div class="small text-muted-custom mt-3">${brief.provider ? 'Written by Chief' : 'Written from verified counts — no AI provider answered'}${brief.emailed_at ? ' · emailed to you' : ' · not emailed'}</div>`
    : `${head}<p class="small text-muted-custom mb-0">Chief reports what every agent actually did, what is waiting, and what needs your decision. Schedule <code>database/send_daily_brief.php</code> daily, or write one now.</p>`;
  document.getElementById('brief-run-btn').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Writing…';
    try {
      const result = await api.post('/api/v1/admin/chief/brief', { hours: 24 });
      renderDailyBrief(result.brief);
      loadDashboard();
    } catch (error) {
      button.disabled = false;
      button.textContent = "Write today's brief";
      showError(`Could not write the brief: ${error.message}`);
    }
  });
}

function preferences() {
  try { return { window: '24', focus: 'all', ...JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') }; }
  catch (_) { return { window: '24', focus: 'all' }; }
}

function savePreferences() {
  localStorage.setItem(VIEW_KEY, JSON.stringify({
    window: document.getElementById('chief-window').value,
    focus: document.getElementById('chief-focus').value,
  }));
}

function selectedAgents(snapshot) {
  const focus = document.getElementById('chief-focus').value;
  return (snapshot.agents || []).filter(agent => {
    if (focus === 'active') return Number(agent.actions || 0) > 0;
    if (focus === 'always_on') return agent.runs === 'always_on';
    if (focus === 'on_demand') return agent.runs === 'on_demand';
    return true;
  });
}

function renderDashboard(data) {
  dashboardData = data;
  const snapshot = data.snapshot || {};
  const agents = selectedAgents(snapshot);
  const actions = agents.reduce((sum, agent) => sum + Number(agent.actions || 0), 0);
  const worked = agents.filter(agent => Number(agent.actions || 0) > 0).length;
  const commandCenter = snapshot.command_center || {};
  const waiting = snapshot.waiting_on_you || [];
  const waitingTotal = waiting.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const maxActions = Math.max(1, ...agents.map(agent => Number(agent.actions || 0)));
  const period = document.getElementById('chief-window').selectedOptions[0].textContent;

  const rows = agents.length ? agents.map(agent => {
    const meaningful = (agent.did || []).filter(item => !item.context && Number(item.count) > 0);
    const detail = meaningful.length
      ? meaningful.map(item => `${Number(item.count)} ${esc(item.label)}`).join(' · ')
      : esc(agent.config_note || `No recorded output in ${period.toLowerCase()}.`);
    const width = Math.max(2, Math.round((Number(agent.actions || 0) / maxActions) * 100));
    return `<div class="chief-agent-row"><div><b>${esc(agent.name)}</b><small>${esc(agent.role)} · ${esc(agent.state)}</small></div>
      <div class="chief-bar-wrap"><div class="chief-bar"><i style="width:${width}%"></i></div><span>${detail}</span></div><strong>${Number(agent.actions || 0)}</strong></div>`;
  }).join('') : '<p class="small text-muted-custom mb-0">No agents match this focus.</p>';

  const queues = waiting.length ? waiting.map(item =>
    `<a href="${esc(item.url)}"><span>${esc(item.label)}</span><strong>${Number(item.count)}</strong></a>`
  ).join('') : '<p class="small text-muted-custom mb-0">Nothing is waiting for your review.</p>';
  const command = (commandCenter.did || []).length ? `<div class="mt-4"><span class="brief-kicker text-muted-custom">COMMAND CENTER</span><div class="chief-queue mt-2">${commandCenter.did.map(item =>
    `<div class="d-flex justify-content-between small"><span>${esc(item.label)}</span><strong>${Number(item.count)}</strong></div>`
  ).join('')}</div></div>` : '';
  const history = (data.briefs || []).length ? `<div class="chief-brief-history"><span class="brief-kicker text-muted-custom align-self-center me-1">RECENT BRIEFS</span>${data.briefs.map(brief =>
    `<a href="#daily-brief-card" data-brief-date="${esc(brief.brief_date)}"><strong>${esc(brief.brief_date)}</strong><br>${esc(brief.headline)}</a>`
  ).join('')}</div>` : '';

  document.getElementById('chief-dashboard-body').innerHTML = `<div class="chief-metrics">
    <div class="chief-metric"><strong>${actions}</strong><span>Agent actions in view</span></div><div class="chief-metric"><strong>${worked}/${agents.length}</strong><span>Selected agents active</span></div>
    <div class="chief-metric"><strong>${Number(commandCenter.actions || 0)}</strong><span>Your command-center actions</span></div><div class="chief-metric"><strong>${waitingTotal}</strong><span>Items waiting on you</span></div></div>
    <div class="chief-readout"><div class="chief-panel"><div class="d-flex justify-content-between align-items-center mb-2"><span class="brief-kicker text-muted-custom">VERIFIED TEAM OUTPUT · ${esc(period.toUpperCase())}</span><small class="text-muted-custom">${esc(snapshot.since || '')}</small></div>${rows}</div>
    <aside class="chief-panel"><span class="brief-kicker text-muted-custom">WAITING ON YOU</span><div class="chief-queue mt-2">${queues}</div>${command}</aside></div>${history}`;

  document.querySelectorAll('[data-brief-date]').forEach(link => link.addEventListener('click', async () => {
    try {
      const result = await api.get(`/api/v1/admin/chief/brief?date=${encodeURIComponent(link.dataset.briefDate)}`);
      renderDailyBrief(result.brief || null);
    } catch (error) { showError(`Could not open that brief: ${error.message}`); }
  }));
}

async function loadDashboard() {
  const body = document.getElementById('chief-dashboard-body');
  body.setAttribute('aria-busy', 'true');
  try {
    renderDashboard(await api.get(`/api/v1/admin/chief/dashboard?hours=${encodeURIComponent(document.getElementById('chief-window').value)}`));
  } catch (error) {
    body.innerHTML = `<div class="p-4 text-danger">Could not load Chief's report: ${esc(error.message)}</div>`;
  } finally { body.removeAttribute('aria-busy'); }
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();
  const view = preferences();
  document.getElementById('chief-window').value = view.window;
  document.getElementById('chief-focus').value = view.focus;
  document.getElementById('chief-window').addEventListener('change', () => { savePreferences(); loadDashboard(); });
  document.getElementById('chief-focus').addEventListener('change', () => { savePreferences(); if (dashboardData) renderDashboard(dashboardData); });
  try {
    const latest = await api.get('/api/v1/admin/chief/brief');
    renderDailyBrief(latest.brief || null);
  } catch (error) { showError(`Could not load Chief's latest brief: ${error.message}`); }
  loadDashboard();
})();
