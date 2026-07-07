(async function () {
  const grid = document.getElementById('testimonials-grid');
  const empty = document.getElementById('empty-state');

  let rows = [];
  try {
    rows = await api.get('/api/v1/testimonials');
  } catch (_) {
    rows = [];
  }

  if (!rows.length) {
    empty.classList.remove('d-none');
    return;
  }

  grid.innerHTML = rows.map((t, i) => `
    <div class="col-md-4">
      <div class="testimonial-list-card reveal${i ? ' reveal-delay-' + Math.min(i, 2) : ''}">
        <div class="stars mb-2">${'★'.repeat(t.rating || 0)}${'☆'.repeat(5 - (t.rating || 0))}</div>
        <p class="testimonial-quote">"${escapeHtmlLocal(t.quote)}"</p>
        <div class="fw-semibold mt-3" style="color: var(--ink);">${escapeHtmlLocal(t.client_name)}</div>
        ${t.project_reference ? `<div class="small text-muted-custom">${escapeHtmlLocal(t.project_reference)}</div>` : ''}
      </div>
    </div>
  `).join('');

  function escapeHtmlLocal(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  }
})();
