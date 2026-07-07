let viewsChart = null;

function humanizeEventPath(path) {
  const slug = String(path || '').replace('/__event/', '');
  return slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

async function loadAnalytics(days = 30) {
  const data = await api.get(`/api/v1/admin/analytics/summary?days=${days}`);

  document.getElementById('stat-total-views').textContent = data.total_views.toLocaleString();
  document.getElementById('funnel-calculator-runs').textContent = Number(data.funnel?.calculator_runs || 0).toLocaleString();
  document.getElementById('funnel-step3').textContent = Number(data.funnel?.request_step_3 || 0).toLocaleString();
  document.getElementById('funnel-success').textContent = Number(data.funnel?.request_submit_success || 0).toLocaleString();
  document.getElementById('funnel-checkout-fails').textContent = Number(data.funnel?.checkout_failed_open || 0).toLocaleString();

  const pagesTbody = document.getElementById('top-pages-tbody');
  pagesTbody.innerHTML = data.top_pages.length
    ? data.top_pages.map(p => `
        <tr>
          <td class="ps-3">${escapeHtml(p.path)}</td>
          <td class="text-end pe-3">${Number(p.views).toLocaleString()}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="2" class="text-center text-muted-custom py-3">No data yet.</td></tr>';

  const eventsTbody = document.getElementById('top-events-tbody');
  eventsTbody.innerHTML = (data.top_events || []).length
    ? data.top_events.map(e => `
        <tr>
          <td class="ps-3">${escapeHtml(humanizeEventPath(e.path))}</td>
          <td class="text-end pe-3">${Number(e.views).toLocaleString()}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="2" class="text-center text-muted-custom py-3">No event data yet.</td></tr>';

  const referrersTbody = document.getElementById('top-referrers-tbody');
  referrersTbody.innerHTML = data.top_referrers.length
    ? data.top_referrers.map(r => `
        <tr>
          <td class="ps-3">${escapeHtml(r.referrer)}</td>
          <td class="text-end pe-3">${Number(r.views).toLocaleString()}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="2" class="text-center text-muted-custom py-3">No data yet.</td></tr>';

  const labels = data.by_day.map(d => d.day);
  const counts = data.by_day.map(d => d.views);
  const ctx = document.getElementById('views-chart').getContext('2d');
  if (viewsChart) viewsChart.destroy();
  viewsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Page views',
        data: counts,
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById('days-filter').addEventListener('change', (e) => {
    loadAnalytics(Number(e.target.value));
  });

  await loadAnalytics(30);
})();
