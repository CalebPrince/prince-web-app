(async function () {
  const realGrid = document.getElementById('home-testimonials-real');
  const fallback = document.getElementById('home-testimonials-fallback');
  if (!realGrid || !fallback) return;

  let rows = [];
  try {
    rows = await api.get('/api/v1/testimonials');
  } catch (_) {
    return; // keep the fallback showing
  }
  if (!rows.length) return; // keep the fallback showing

  // Same split as testimonials.html: a review only gets the metric-led
  // case-study treatment once it's linked to a published project that has a
  // real, admin-entered outcome_metrics line.
  const featured = rows.slice(0, 3).map((t) => {
    const signals = String(t.outcome_metrics || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return { ...t, signals };
  });

  realGrid.innerHTML = featured.map((t, i) => {
    const delay = i ? ` reveal-delay-${Math.min(i, 2)}` : '';
    if (t.signals.length && t.project_slug) {
      return `
        <div class="col-md-6">
          <a href="/project.html?slug=${encodeURIComponent(t.project_slug)}" class="case-study-card reveal reveal-card${delay}">
            <span class="case-study-eyebrow">Measured result</span>
            <p class="case-study-metric">${escapeHtmlLocal(t.signals[0])}</p>
            <p class="testimonial-quote case-study-quote">"${escapeHtmlLocal(t.quote)}"</p>
            <div class="case-study-footer">
              <span>${escapeHtmlLocal(t.client_name)}${t.project_title ? ` · ${escapeHtmlLocal(t.project_title)}` : ''}</span>
              <span class="cta-arrow">View project →</span>
            </div>
          </a>
        </div>
      `;
    }
    return `
      <div class="col-md-4">
        <div class="testimonial-list-card reveal reveal-card${delay}">
          <div class="stars mb-2">${'★'.repeat(t.rating || 0)}${'☆'.repeat(5 - (t.rating || 0))}</div>
          <p class="testimonial-quote">"${escapeHtmlLocal(t.quote)}"</p>
          <div class="fw-semibold mt-3" style="color: var(--ink);">${escapeHtmlLocal(t.client_name)}</div>
          ${t.project_reference ? `<div class="small text-muted-custom">${escapeHtmlLocal(t.project_reference)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  fallback.classList.add('d-none');
  realGrid.classList.remove('d-none');

  function escapeHtmlLocal(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  }
})();
