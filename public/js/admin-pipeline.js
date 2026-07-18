const PIPELINE_STAGE_META = {
  new: { label: 'New', icon: 'bi-inbox' }, researching: { label: 'Researching', icon: 'bi-search' },
  contacted: { label: 'Contacted', icon: 'bi-send' }, discovery: { label: 'Discovery', icon: 'bi-calendar2-check' },
  proposal: { label: 'Proposal', icon: 'bi-file-earmark-text' }, won: { label: 'Won', icon: 'bi-trophy' }, lost: { label: 'Lost', icon: 'bi-x-circle' },
};
const PIPELINE_SOURCE_LABEL = { inquiry: 'Inquiry', marketing: 'Marketing', social: 'Social', booking: 'Booking', proposal: 'Proposal', client: 'Client', chat: 'Chat' };
let pipelineLeads = [];
let pipelineStages = Object.keys(PIPELINE_STAGE_META);
let pipelineQuery = '';
let pipelineSource = '';

function pipelineEsc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function pipelineInitials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase(); }
function pipelineMoney(lead) { return lead.value ? `${pipelineEsc(lead.currency)} ${(Number(lead.value) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ''; }
function pipelineAttribution(lead) {
  const a = lead.attribution || {}; let label = '';
  if (a.utm_source) label = [a.utm_source, a.utm_campaign].filter(Boolean).join(' · ');
  else if (a.referrer) { try { label = `From ${new URL(a.referrer).hostname.replace(/^www\./, '')}`; } catch (_) { label = 'Referred visit'; } }
  else if (a.landing_path) label = `Landed on ${a.landing_path.split('?')[0]}`;
  return label ? `<div class="pipeline-attribution"><i class="bi bi-signpost-split"></i>${pipelineEsc(label)}</div>` : '';
}
function pipelineDrawer(lead) {
  const a=lead.attribution||{}; const sources=[...new Map(lead.sources.map(s=>[`${s.type}:${s.id}`,s])).values()];
  return `<header class="pipeline-drawer-header"><div><p class="pipeline-eyebrow mb-1">Lead record</p><h3 id="pipeline-drawer-title">${pipelineEsc(lead.name)}</h3><p>${pipelineEsc(lead.email||lead.phone||'No contact detail')}</p></div><button type="button" class="pipeline-drawer-close" aria-label="Close"><i class="bi bi-x-lg"></i></button></header>
  <div class="pipeline-drawer-body"><section class="pipeline-detail-grid"><div><span>Stage</span><strong>${pipelineEsc(PIPELINE_STAGE_META[lead.stage]?.label||lead.stage)}</strong></div><div><span>Value</span><strong>${pipelineMoney(lead)||'—'}</strong></div><div><span>First seen</span><strong>${new Date(lead.created_at).toLocaleDateString()}</strong></div><div><span>Last activity</span><strong>${new Date(lead.latest_at).toLocaleDateString()}</strong></div></section>
  <section class="pipeline-detail-section"><h5>Latest context</h5><p>${pipelineEsc(lead.summary||'No activity summary')}</p></section>
  <section class="pipeline-detail-section"><h5>Source history</h5><div class="pipeline-source-timeline">${sources.map(s=>`<a href="${pipelineEsc(s.url)}"><i class="bi bi-arrow-up-right"></i><span><strong>${pipelineEsc(PIPELINE_SOURCE_LABEL[s.type]||s.type)}</strong><small>Record #${s.id}</small></span></a>`).join('')}</div></section>
  ${(a.landing_path||a.referrer||a.utm_source)?`<section class="pipeline-detail-section"><h5>First-touch attribution</h5><dl class="pipeline-attribution-list">${a.landing_path?`<div><dt>Landing page</dt><dd>${pipelineEsc(a.landing_path)}</dd></div>`:''}${a.referrer?`<div><dt>Referrer</dt><dd>${pipelineEsc(a.referrer)}</dd></div>`:''}${a.utm_source?`<div><dt>Campaign</dt><dd>${pipelineEsc([a.utm_source,a.utm_medium,a.utm_campaign].filter(Boolean).join(' · '))}</dd></div>`:''}</dl></section>`:''}
  <form id="pipeline-detail-form" class="pipeline-detail-section"><h5>Next move</h5><label>Next action<input class="form-control" id="pipeline-next-action" maxlength="500" value="${pipelineEsc(lead.next_action||'')}" placeholder="Example: Send revised scope"></label><label>Follow up<input class="form-control" id="pipeline-follow-up" type="datetime-local" value="${pipelineEsc(lead.follow_up_at||'')}"></label><label>Internal notes<textarea class="form-control" id="pipeline-notes" rows="5" maxlength="5000" placeholder="Private context, objections, or decisions">${pipelineEsc(lead.notes||'')}</textarea></label><div class="d-flex align-items-center gap-2"><button class="btn-brand border-0" type="submit">Save lead</button><span id="pipeline-detail-status" class="small text-muted-custom"></span></div></form></div>`;
}
function closePipelineDrawer(){document.getElementById('pipeline-drawer').classList.remove('open');document.getElementById('pipeline-drawer-backdrop').classList.remove('open');document.getElementById('pipeline-drawer').setAttribute('aria-hidden','true');}
function openPipelineDrawer(id){const lead=pipelineLeads.find(l=>Number(l.id)===Number(id));if(!lead)return;const drawer=document.getElementById('pipeline-drawer');document.getElementById('pipeline-drawer-content').innerHTML=pipelineDrawer(lead);drawer.classList.add('open');document.getElementById('pipeline-drawer-backdrop').classList.add('open');drawer.setAttribute('aria-hidden','false');drawer.querySelector('.pipeline-drawer-close').addEventListener('click',closePipelineDrawer);drawer.querySelector('#pipeline-detail-form').addEventListener('submit',async e=>{e.preventDefault();const status=document.getElementById('pipeline-detail-status');status.textContent='Saving…';const payload={next_action:document.getElementById('pipeline-next-action').value,follow_up_at:document.getElementById('pipeline-follow-up').value,notes:document.getElementById('pipeline-notes').value};try{await api.patch(`/api/v1/admin/pipeline/${lead.id}`,payload);Object.assign(lead,payload);status.textContent='Saved';renderPipeline();}catch(err){status.textContent=err.message||'Could not save.';}});}
function pipelineVisible() {
  const q = pipelineQuery.toLowerCase();
  return pipelineLeads.filter(lead => (!pipelineSource || lead.sources.some(s => s.type === pipelineSource)) && (!q || [lead.name, lead.email, lead.phone, lead.summary].some(v => String(v || '').toLowerCase().includes(q))));
}
function pipelineCard(lead) {
  const sources = [...new Map(lead.sources.map(s => [s.type, s])).values()];
  const followUpDue = lead.follow_up_at && new Date(lead.follow_up_at).getTime() <= Date.now() && !['won','lost'].includes(lead.stage);
  return `<article class="pipeline-card ${followUpDue?'pipeline-card-follow-up':''}" draggable="true" data-id="${lead.id}" tabindex="0">
    <div class="pipeline-card-top"><span class="pipeline-card-avatar" style="--pipeline-hue:${(lead.id * 43) % 360}deg">${pipelineEsc(pipelineInitials(lead.name))}</span><div><h5>${pipelineEsc(lead.name)}</h5><div class="pipeline-card-contact">${pipelineEsc(lead.email || lead.phone || 'No contact detail')}</div></div>${lead.manual_stage ? '<i class="bi bi-hand-index-thumb pipeline-manual" title="Stage set manually"></i>' : ''}</div>
    <p>${pipelineEsc(lead.summary || 'No activity summary')}</p>
    ${pipelineAttribution(lead)}
    <div class="pipeline-card-sources">${sources.map(s => `<a href="${pipelineEsc(s.url)}" title="Open ${pipelineEsc(PIPELINE_SOURCE_LABEL[s.type] || s.type)}">${pipelineEsc(PIPELINE_SOURCE_LABEL[s.type] || s.type)}</a>`).join('')}</div>
    <label class="pipeline-stage-picker"><span>Stage</span><select data-stage-picker="${lead.id}">${pipelineStages.map(stage => `<option value="${stage}" ${lead.stage === stage ? 'selected' : ''}>${PIPELINE_STAGE_META[stage].label}</option>`).join('')}</select></label>
    ${followUpDue?'<div class="pipeline-follow-up-due"><i class="bi bi-alarm"></i>Follow-up due</div>':''}<footer><time>${new Date(lead.latest_at).toLocaleDateString(undefined, { month:'short', day:'numeric' })}</time>${pipelineMoney(lead) ? `<strong>${pipelineMoney(lead)}</strong>` : ''}</footer>
  </article>`;
}
function renderPipeline() {
  const leads = pipelineVisible();
  document.getElementById('pipeline-board').innerHTML = pipelineStages.map(stage => {
    const meta = PIPELINE_STAGE_META[stage]; const rows = leads.filter(l => l.stage === stage);
    return `<section class="pipeline-column" data-stage="${stage}"><header><span><i class="bi ${meta.icon}"></i>${meta.label}</span><b>${rows.length}</b></header><div class="pipeline-dropzone">${rows.map(pipelineCard).join('') || '<div class="pipeline-empty">Drop leads here</div>'}</div></section>`;
  }).join('');
  const valued = leads.filter(l => l.stage !== 'lost' && Number(l.value));
  const totalValue = valued.reduce((sum, l) => sum + Number(l.value || 0), 0);
  const valueCurrency = valued[0]?.currency || '';
  document.getElementById('pipeline-summary').innerHTML = `<div><span>Active leads</span><strong>${leads.filter(l => !['won','lost'].includes(l.stage)).length}</strong></div><div><span>In discovery</span><strong>${leads.filter(l => l.stage === 'discovery').length}</strong></div><div><span>Open proposals</span><strong>${leads.filter(l => l.stage === 'proposal').length}</strong></div><div><span>Pipeline value</span><strong>${totalValue ? `${pipelineEsc(valueCurrency)} ${(totalValue / 100).toLocaleString(undefined, {maximumFractionDigits:0})}` : '—'}</strong></div>`;
  wirePipelineDrag();
}
function wirePipelineDrag() {
  document.querySelectorAll('.pipeline-card').forEach(card => card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', card.dataset.id); card.classList.add('dragging'); }));
  document.querySelectorAll('.pipeline-card').forEach(card => card.addEventListener('click', e => { if(!e.target.closest('a,select,label,button')) openPipelineDrawer(card.dataset.id); }));
  document.querySelectorAll('.pipeline-card').forEach(card => card.addEventListener('keydown', e => { if((e.key==='Enter'||e.key===' ')&&!e.target.closest('select')){e.preventDefault();openPipelineDrawer(card.dataset.id);} }));
  document.querySelectorAll('.pipeline-column').forEach(column => {
    column.addEventListener('dragover', e => { e.preventDefault(); column.classList.add('drag-over'); });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', async e => { e.preventDefault(); column.classList.remove('drag-over'); await movePipelineLead(Number(e.dataTransfer.getData('text/plain')), column.dataset.stage); });
  });
  document.querySelectorAll('[data-stage-picker]').forEach(select => select.addEventListener('change', () => movePipelineLead(Number(select.dataset.stagePicker), select.value)));
}
async function movePipelineLead(id, stage) {
  const lead = pipelineLeads.find(l => Number(l.id) === id); if (!lead || lead.stage === stage) return;
  const old = lead.stage; lead.stage = stage; lead.manual_stage = true; renderPipeline();
  try { await api.patch(`/api/v1/admin/pipeline/${id}`, { stage }); } catch (err) { lead.stage = old; renderPipeline(); alert(err.message || 'Could not update the lead stage.'); }
}
(async function initPipeline(){
  const user = await requireAdminAuth(); if (!user) return; wireLogout();
  try {
    const data = await api.get('/api/v1/admin/pipeline'); pipelineLeads = data.leads || []; pipelineStages = data.stages || pipelineStages;
    const sourceTypes = [...new Set(pipelineLeads.flatMap(l => l.sources.map(s => s.type)))].sort();
    document.getElementById('pipeline-source-filter').insertAdjacentHTML('beforeend', sourceTypes.map(s => `<option value="${pipelineEsc(s)}">${pipelineEsc(PIPELINE_SOURCE_LABEL[s] || s)}</option>`).join(''));
    document.getElementById('pipeline-search').addEventListener('input', e => { pipelineQuery = e.target.value.trim(); renderPipeline(); });
    document.getElementById('pipeline-source-filter').addEventListener('change', e => { pipelineSource = e.target.value; renderPipeline(); });
    document.getElementById('pipeline-drawer-backdrop').addEventListener('click',closePipelineDrawer);document.addEventListener('keydown',e=>{if(e.key==='Escape')closePipelineDrawer();});renderPipeline();const requestedId=Number(new URLSearchParams(location.search).get('open'));if(requestedId)openPipelineDrawer(requestedId);
  } catch(err) { const box=document.getElementById('pipeline-error'); box.textContent=err.message || 'Could not load the pipeline.'; box.classList.remove('d-none'); }
})();
