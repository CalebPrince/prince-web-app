(async function () {
  const grid = document.getElementById('testimonials-grid');
  const empty = document.getElementById('empty-state');
  const caseStudySection = document.getElementById('case-studies-section');
  const caseStudyGrid = document.getElementById('case-study-grid');
  const moreReviewsHead = document.getElementById('more-reviews-head');

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

  // A review only counts as a case study once it's linked to a published
  // project that actually has a real, admin-entered outcome_metrics line, // otherwise it renders as a plain quote card like any other review.
  const caseStudies = [];
  const plain = [];
  rows.forEach((t) => {
    const signals = String(t.outcome_metrics || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (signals.length && t.project_slug) {
      caseStudies.push({ ...t, signals });
    } else {
      plain.push(t);
    }
  });

  if (caseStudies.length) {
    caseStudySection.classList.remove('d-none');
    document.getElementById('case-study-pointer')?.classList.remove('d-none');
    caseStudyGrid.innerHTML = caseStudies.map((t, i) => `
      <div class="col-lg-6">
        <a href="/project.html?slug=${encodeURIComponent(t.project_slug)}" class="case-study-card reveal${i ? ' reveal-delay-' + Math.min(i, 2) : ''}">
          <span class="case-study-eyebrow">Measured result</span>
          <p class="case-study-metric">${escapeHtmlLocal(t.signals[0])}</p>
          ${t.signals.length > 1 ? `<ul class="case-study-signals">${t.signals.slice(1, 3).map((s) => `<li>${escapeHtmlLocal(s)}</li>`).join('')}</ul>` : ''}
          <p class="testimonial-quote case-study-quote">"${escapeHtmlLocal(t.quote)}"</p>
          <div class="case-study-footer">
            <span>${escapeHtmlLocal(t.client_name)}${t.project_title ? ` · ${escapeHtmlLocal(t.project_title)}` : ''}</span>
            <span class="cta-arrow">View project →</span>
          </div>
        </a>
      </div>
    `).join('');
  }

  if (!plain.length) {
    grid.innerHTML = '';
    return;
  }

  if (caseStudies.length) {
    moreReviewsHead.classList.remove('d-none');
  }

  grid.innerHTML = plain.map((t, i) => `
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
