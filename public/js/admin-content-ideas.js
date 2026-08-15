let ideas = [];
const ideaEsc = value => escapeHtml(value);

function weekLabel(startDay) {
  const endDay = Math.min(startDay + 6, 30);
  return `Week ${Math.ceil(startDay / 7)} — Days ${startDay}-${endDay}`;
}

// source_posted_at is whatever raw date/timestamp string Radar's cached post
// actually had (field names vary by Apify actor) — most are ISO-parseable,
// but fall back to showing it verbatim rather than hiding a real value just
// because it didn't parse cleanly.
function formatPostedAt(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return ideaEsc(value);
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderIdeas() {
  const list = document.getElementById('ideas-list');
  const empty = document.getElementById('ideas-empty');
  empty.classList.toggle('d-none', ideas.length > 0);
  list.classList.toggle('d-none', ideas.length === 0);
  if (!ideas.length) {
    list.innerHTML = '';
    return;
  }

  let html = '';
  let lastWeekStart = null;
  for (const idea of ideas) {
    const weekStart = Math.floor((idea.day_number - 1) / 7) * 7 + 1;
    if (weekStart !== lastWeekStart) {
      html += `<div class="idea-week-label">${weekLabel(weekStart)}</div>`;
      lastWeekStart = weekStart;
    }
    const platform = idea.platform === 'youtube' ? 'youtube' : 'linkedin';
    const platformIcon = platform === 'youtube' ? 'bi-youtube' : 'bi-linkedin';
    const postedAt = formatPostedAt(idea.source_posted_at);
    const grounded = Number(idea.grounded) === 1
      ? `<span class="idea-grounded"><i class="bi bi-check-circle-fill"></i>grounded in real posts${postedAt ? ` &middot; posted ${postedAt}` : ''}</span>`
      : '';
    html += `<article class="idea-card mb-2 ${idea.status === 'used' ? 'is-used' : ''} ${idea.status === 'dismissed' ? 'is-dismissed' : ''}" data-idea-id="${idea.id}">
      <div class="idea-day">${idea.day_number}<small>Day</small></div>
      <div class="flex-grow-1">
        <span class="idea-platform ${platform}"><i class="bi ${platformIcon}"></i>${platform}</span>${grounded}
        <div class="idea-title">${ideaEsc(idea.title)}</div>
        <p class="idea-description">${ideaEsc(idea.description)}</p>
      </div>
      <div class="d-flex flex-column gap-1">
        ${platform === 'linkedin' ? `<button class="btn btn-sm btn-outline-primary" data-draft="${idea.id}" ${idea.status !== 'idea' ? 'disabled' : ''}>Turn into draft</button>` : ''}
        <button class="btn btn-sm btn-outline-secondary" data-mark-used="${idea.id}" ${idea.status === 'used' ? 'disabled' : ''}>Mark used</button>
        <button class="btn btn-sm btn-outline-danger" data-dismiss="${idea.id}" ${idea.status === 'dismissed' ? 'disabled' : ''}>Dismiss</button>
      </div>
    </article>`;
  }
  list.innerHTML = html;

  list.querySelectorAll('[data-mark-used]').forEach(el =>
    el.addEventListener('click', () => setIdeaStatus(Number(el.dataset.markUsed), 'used')));
  list.querySelectorAll('[data-dismiss]').forEach(el =>
    el.addEventListener('click', () => setIdeaStatus(Number(el.dataset.dismiss), 'dismissed')));
  list.querySelectorAll('[data-draft]').forEach(el =>
    el.addEventListener('click', () => createDraftFromIdea(Number(el.dataset.draft), el)));
}

async function createDraftFromIdea(id, btn) {
  const idea = ideas.find(i => Number(i.id) === id);
  if (!idea) return;
  const errorBox = document.getElementById('ideas-error');
  errorBox.classList.add('d-none');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Drafting…';
  try {
    await api.post(`/api/v1/admin/content-ideas/${id}/draft`, {});
    idea.status = 'used';
    renderIdeas();
    errorBox.className = 'alert alert-success';
    errorBox.innerHTML = `Draft created — <a href="/admin/social-drafts.html">review it in Social Drafts</a>.`;
    errorBox.classList.remove('d-none');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = originalText;
    errorBox.className = 'alert alert-danger';
    errorBox.textContent = err.message;
    errorBox.classList.remove('d-none');
  }
}

async function setIdeaStatus(id, status) {
  const idea = ideas.find(i => Number(i.id) === id);
  if (!idea) return;
  const old = idea.status;
  idea.status = status;
  renderIdeas();
  try {
    await api.patch(`/api/v1/admin/content-ideas/${id}`, { status });
  } catch (err) {
    idea.status = old;
    renderIdeas();
    alert(err.message);
  }
}

async function loadIdeas() {
  const res = await api.get('/api/v1/admin/content-ideas');
  ideas = res.ideas || [];
  renderIdeas();
}

async function generatePlan() {
  const btn = document.getElementById('generate-btn');
  const errorBox = document.getElementById('ideas-error');
  const generating = document.getElementById('ideas-generating');
  errorBox.classList.add('d-none');
  generating.classList.remove('d-none');
  btn.disabled = true;
  try {
    const res = await api.post('/api/v1/admin/content-ideas/generate', {});
    ideas = res.ideas || [];
    renderIdeas();
  } catch (err) {
    errorBox.className = 'alert alert-danger';
    errorBox.textContent = err.message;
    errorBox.classList.remove('d-none');
  } finally {
    generating.classList.add('d-none');
    btn.disabled = false;
  }
}

(async function () {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();
  document.getElementById('generate-btn').addEventListener('click', generatePlan);
  try {
    await loadIdeas();
  } catch (err) {
    const box = document.getElementById('ideas-error');
    box.textContent = err.message;
    box.classList.remove('d-none');
  }
})();
