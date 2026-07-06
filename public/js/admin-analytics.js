let viewsChart = null;

async function loadAnalytics(days = 30) {
  const data = await api.get(`/api/v1/admin/analytics/summary?days=${days}`);

  document.getElementById('stat-total-views').textContent = data.total_views.toLocaleString();

  const pagesTbody = document.getElementById('top-pages-tbody');
  pagesTbody.innerHTML = data.top_pages.length
    ? data.top_pages.map(p => `
        <tr>
          <td class="ps-3">${escapeHtml(p.path)}</td>
          <td class="text-end pe-3">${Number(p.views).toLocaleString()}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="2" class="text-center text-muted-custom py-3">No data yet.</td></tr>';

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
