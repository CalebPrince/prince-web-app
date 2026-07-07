(function () {
  const input = document.getElementById('search-input');
  const status = document.getElementById('search-status');
  const grid = document.getElementById('search-results');
  const empty = document.getElementById('empty-state');

  function escapeHtmlLocal(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  }

  async function runSearch(q) {
    grid.innerHTML = '';
    empty.classList.add('d-none');

    if (!q) {
      status.textContent = '';
      return;
    }
    status.textContent = 'Searching…';

    let results = [];
    try {
      const res = await api.get(`/api/v1/search?q=${encodeURIComponent(q)}`);
      results = res.results || [];
    } catch (_) {
      results = [];
    }

    if (!results.length) {
      status.textContent = '';
      empty.classList.remove('d-none');
      return;
    }

    status.textContent = `${results.length} result${results.length === 1 ? '' : 's'} for "${q}"`;
    grid.innerHTML = results.map(r => `
      <div class="col-md-6 col-lg-4">
        <a href="${r.url}" class="text-decoration-none">
          <div class="project-card">
            <img src="${r.image}" alt="${escapeHtmlLocal(r.title)}">
            <div class="card-body">
              <span class="tag-chip mb-2 d-inline-block">${r.type === 'project' ? 'Project' : 'Blog Post'}</span>
              <h5 class="mb-2">${escapeHtmlLocal(r.title)}</h5>
              <p class="small text-muted-custom mb-0">${escapeHtmlLocal(r.snippet)}</p>
            </div>
          </div>
        </a>
      </div>
    `).join('');
  }

  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    const url = new URL(window.location.href);
    if (q) {
      url.searchParams.set('q', q);
    } else {
      url.searchParams.delete('q');
    }
    window.history.replaceState({}, '', url);
    runSearch(q);
  });

  const initialQ = new URLSearchParams(window.location.search).get('q') || '';
  if (initialQ) {
    input.value = initialQ;
    runSearch(initialQ);
  }
})();
