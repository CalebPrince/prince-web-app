// Business reports dashboard. One fetch of /api/v1/admin/reports/summary
// populates every card, chart and table. Money arrives in subunits, so
// formatMoney divides by 100 — same convention as the dashboard/contacts pages.

const PALETTE = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// Neutral axis/label colour that stays readable in both light and dark themes.
if (window.Chart) {
  Chart.defaults.color = '#8b93a7';
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatMoney(subunits, currency) {
  return `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short', year: '2-digit' });
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function trendHtml(pct, compareLabel) {
  if (pct === null || pct === undefined) return `<span class="text-muted-custom">no comparison data</span>`;
  const up = pct > 0;
  const flat = pct === 0;
  const color = flat ? 'var(--text-muted-custom, #8b93a7)' : (up ? '#10b981' : '#ef4444');
  const icon = flat ? 'bi-dash' : (up ? 'bi-arrow-up-short' : 'bi-arrow-down-short');
  return `<span style="color:${color};"><i class="bi ${icon}"></i> ${Math.abs(pct).toFixed(1)}%</span> ${compareLabel}`;
}

const charts = {};
function drawChart(id, config) {
  const el = document.getElementById(id);
  if (!el) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(el.getContext('2d'), config);
}

function renderRevenue(data, currency) {
  document.getElementById('stat-revenue-total').textContent = formatMoney(data.all_time, currency);
  document.getElementById('stat-revenue-30').textContent = formatMoney(data.last_30_days, currency);
  document.getElementById('stat-revenue-month-sub').textContent = formatMoney(data.this_month, currency) + ' this month';

  drawChart('revenue-chart', {
    type: 'bar',
    data: {
      labels: data.by_month.map(m => monthLabel(m.month)),
      datasets: [{
        label: 'Revenue (' + currency + ')',
        data: data.by_month.map(m => Number(m.amount) / 100),
        backgroundColor: 'rgba(79, 70, 229, 0.6)',
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });

  const total = data.by_source.reduce((sum, s) => sum + s.amount, 0);
  document.getElementById('revenue-by-source').innerHTML = data.by_source.map((s, i) => {
    const pct = total > 0 ? Math.round((s.amount / total) * 100) : 0;
    return `<div class="mb-3">
      <div class="d-flex justify-content-between small mb-1"><span>${esc(s.label)}</span><span class="fw-semibold">${formatMoney(s.amount, currency)}</span></div>
      <div class="progress" style="height: 6px;"><div class="progress-bar" role="progressbar" style="width: ${pct}%; background:${PALETTE[i % PALETTE.length]};"></div></div>
    </div>`;
  }).join('') || '<div class="text-muted-custom small">No revenue yet.</div>';

  if (Array.isArray(data.by_currency) && data.by_currency.length > 1) {
    document.getElementById('revenue-by-currency').innerHTML =
      'By currency: ' + data.by_currency.map(c => `<span class="me-2">${formatMoney(c.total, c.currency)}</span>`).join('');
  }
}

function renderPipeline(p, currency) {
  document.getElementById('stat-win-rate').textContent = p.win_rate === null ? '—' : Math.round(p.win_rate * 100) + '%';
  document.getElementById('stat-win-rate-sub').textContent = `${p.proposals_accepted} won · ${p.proposals_declined} lost`;
  document.getElementById('stat-paying').textContent = p.paying_customers;
  document.getElementById('stat-avg-deal').textContent = p.avg_deal_size > 0 ? 'avg deal ' + formatMoney(p.avg_deal_size, currency) : 'no closed deals yet';

  drawChart('funnel-chart', {
    type: 'bar',
    data: {
      labels: p.funnel.map(f => f.label),
      datasets: [{
        label: 'Count',
        data: p.funnel.map(f => f.count),
        backgroundColor: ['#4f46e5', '#0ea5e9', '#10b981'],
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  const stageLabels = { new: 'New', reviewing: 'Reviewing', proposal_sent: 'Proposal sent', won: 'Won', lost: 'Lost' };
  document.getElementById('pipeline-stages').innerHTML =
    '<div class="d-flex flex-wrap gap-2">' + p.stages.map(s =>
      `<span class="badge" style="background: var(--section-leads-soft); color: var(--section-leads); font-weight: 500;">${esc(stageLabels[s.stage] || s.stage)}: ${s.count}</span>`
    ).join('') + '</div>';
}

function renderLeadSources(sources) {
  const nonZero = sources.filter(s => s.count > 0);
  const src = nonZero.length ? nonZero : sources;
  drawChart('lead-sources-chart', {
    type: 'doughnut',
    data: {
      labels: src.map(s => s.label),
      datasets: [{ data: src.map(s => s.count), backgroundColor: PALETTE, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } } },
    },
  });
}

function renderAutomations(rows) {
  const tbody = document.getElementById('automations-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted-custom py-3">No automations yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(a => {
    const statusBadge = a.is_active
      ? '<span class="status-pill published">active</span>'
      : '<span class="status-pill archived">paused</span>';
    const aiTag = a.nurturer_enabled ? ' <span class="badge" style="background: var(--section-content-soft); color: var(--section-content); font-weight: 500;"><i class="bi bi-robot"></i> AI</span>' : '';
    return `<tr>
      <td class="ps-1">${esc(a.name)}${aiTag}</td>
      <td>${statusBadge}</td>
      <td class="text-end">${a.enrollments}</td>
      <td class="text-end">${a.active_enrollments}</td>
      <td class="text-end">${a.steps_sent}</td>
      <td class="text-end">${a.ai_sends}</td>
      <td class="text-end">${a.unsubscribed}</td>
    </tr>`;
  }).join('');
}

function renderBookings(b) {
  document.getElementById('bookings-summary').textContent =
    `${b.upcoming} upcoming · ${b.completed} completed · ${b.cancelled} cancelled`;
  drawChart('bookings-chart', {
    type: 'line',
    data: {
      labels: b.by_month.map(m => monthLabel(m.month)),
      datasets: [{
        label: 'Bookings',
        data: b.by_month.map(m => m.count),
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderPeriodKpis(period, estimates, currency) {
  document.getElementById('kpi-revenue').textContent = formatMoney(period.revenue, currency);
  document.getElementById('kpi-revenue-trend').innerHTML = trendHtml(period.revenue_change_pct, 'vs previous period');

  document.getElementById('kpi-margin').textContent = estimates.gross_margin_pct.toFixed(1) + '%';
  document.getElementById('kpi-utilization').textContent = estimates.utilization_pct.toFixed(1) + '%';

  document.getElementById('kpi-avg-project').textContent = period.avg_project === null ? '—' : formatMoney(period.avg_project, currency);
  document.getElementById('kpi-avg-project-trend').innerHTML = period.avg_project === null
    ? '<span class="text-muted-custom">no accepted deals in this period</span>'
    : trendHtml(period.avg_project_change_pct, 'vs previous period');

  const from = new Date(period.from + 'T00:00:00');
  const to = new Date(period.to + 'T00:00:00');
  const days = Math.round((new Date(period.to) - new Date(period.from)) / 86400000) + 1;
  document.getElementById('report-period-label').textContent =
    `Showing ${from.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – `
    + `${to.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}, `
    + `compared with the ${days}-day period right before it.`;
}

function renderRevenueMix(mix, currency) {
  const total = mix.reduce((sum, m) => sum + m.amount, 0);
  document.getElementById('revenue-mix-total').textContent = formatMoney(total, currency) + ' total';

  if (!mix.length || total === 0) {
    document.getElementById('revenue-mix-list').innerHTML = '<div class="text-muted-custom small">No revenue in this period.</div>';
    drawChart('revenue-mix-chart', { type: 'doughnut', data: { labels: ['No revenue'], datasets: [{ data: [1], backgroundColor: ['#e2e8f0'], borderWidth: 0 }] }, options: { plugins: { legend: { display: false } } } });
    return;
  }

  document.getElementById('revenue-mix-list').innerHTML = mix.map((m, i) => {
    const pct = total > 0 ? Math.round((m.amount / total) * 100) : 0;
    return `<div class="mb-3">
      <div class="d-flex justify-content-between small mb-1"><span>${esc(m.label)}</span><span class="fw-semibold">${pct}% · ${formatMoney(m.amount, currency)}</span></div>
      <div class="progress" style="height: 6px;"><div class="progress-bar" role="progressbar" style="width: ${pct}%; background:${PALETTE[i % PALETTE.length]};"></div></div>
    </div>`;
  }).join('');

  drawChart('revenue-mix-chart', {
    type: 'doughnut',
    data: {
      labels: mix.map(m => m.label),
      datasets: [{ data: mix.map(m => m.amount), backgroundColor: PALETTE, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } } },
    },
  });
}

function renderSixMonthView(rows, currency) {
  drawChart('six-month-chart', {
    type: 'line',
    data: {
      labels: rows.map(r => monthLabel(r.month)),
      datasets: [
        {
          label: 'Revenue',
          data: rows.map(r => Number(r.revenue) / 100),
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
        {
          label: 'Margin (est.)',
          data: rows.map(r => Number(r.margin_est) / 100),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderDash: [6, 4],
          fill: false,
          tension: 0.3,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => currency + ' ' + Number(v).toLocaleString() } } },
    },
  });
}

function csvRow(cells) {
  return cells.map(c => {
    const s = String(c == null ? '' : c);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',');
}

function exportReport(data) {
  const currency = data.currency;
  const money = subunits => (Number(subunits || 0) / 100).toFixed(2);
  const lines = [];

  lines.push(csvRow(['Prince Caleb — Business Report']));
  lines.push(csvRow(['Period', data.period.from, 'to', data.period.to]));
  lines.push('');

  lines.push(csvRow(['KPI', 'Value', 'Change vs previous period']));
  lines.push(csvRow(['Revenue', money(data.period.revenue), data.period.revenue_change_pct === null ? '' : data.period.revenue_change_pct + '%']));
  lines.push(csvRow(['Gross margin (estimated — no cost data tracked)', data.estimates.gross_margin_pct + '%', '']));
  lines.push(csvRow(['Average project', data.period.avg_project === null ? '' : money(data.period.avg_project), data.period.avg_project_change_pct === null ? '' : data.period.avg_project_change_pct + '%']));
  lines.push(csvRow(['Utilization (estimated — no hours data tracked)', data.estimates.utilization_pct + '%', '']));
  lines.push('');

  lines.push(csvRow(['Revenue mix by service', 'Amount (' + currency + ')']));
  data.period.revenue_mix.forEach(m => lines.push(csvRow([m.label, money(m.amount)])));
  lines.push('');

  lines.push(csvRow(['Revenue by month', 'Amount (' + currency + ')']));
  data.revenue.by_month.forEach(m => lines.push(csvRow([m.month, money(m.amount)])));
  lines.push('');

  lines.push(csvRow(['Pipeline funnel', 'Count']));
  data.pipeline.funnel.forEach(f => lines.push(csvRow([f.label, f.count])));
  lines.push(csvRow(['Win rate', data.pipeline.win_rate === null ? '' : Math.round(data.pipeline.win_rate * 100) + '%']));
  lines.push('');

  lines.push(csvRow(['Top clients', 'Payments', 'Revenue (' + currency + ')']));
  data.top_clients.forEach(c => lines.push(csvRow([c.name || c.email, c.payments_count, money(c.total)])));

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report_${data.period.from}_to_${data.period.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderTopClients(rows, currency) {
  const tbody = document.getElementById('top-clients-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted-custom py-3">No paying clients yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(c => `
    <tr>
      <td class="ps-1">${esc(c.name || '—')}<br><span class="small text-muted-custom">${esc(c.email)}</span></td>
      <td class="text-end">${c.payments_count}</td>
      <td class="text-end fw-semibold">${formatMoney(c.total, c.currency || currency)}</td>
    </tr>
  `).join('');
}

let lastReportData = null;

function showReportsError(err) {
  const box = document.getElementById('reports-error');
  box.textContent = 'Could not load reports: ' + err.message;
  box.classList.remove('d-none');
}

async function loadReport(range) {
  const qs = range ? ('?' + new URLSearchParams(range).toString()) : '';
  const data = await api.get('/api/v1/admin/reports/summary' + qs);
  lastReportData = data;
  const currency = data.currency;

  document.getElementById('reports-error').classList.add('d-none');
  renderRevenue(data.revenue, currency);
  renderPipeline(data.pipeline, currency);
  renderLeadSources(data.lead_sources);
  renderAutomations(data.automations);
  renderBookings(data.bookings);
  renderTopClients(data.top_clients, currency);
  renderPeriodKpis(data.period, data.estimates, currency);
  renderRevenueMix(data.period.revenue_mix, currency);
  renderSixMonthView(data.six_month_view, currency);
  document.getElementById('report-from').value = data.period.from;
  document.getElementById('report-to').value = data.period.to;
}

function presetRange(preset) {
  const now = new Date();
  let from, to;
  if (preset === 'this_month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = now;
  } else if (preset === 'last_month') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (preset === 'this_quarter') {
    from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    to = now;
  } else {
    from = new Date(now.getFullYear(), 0, 1);
    to = now;
  }
  return { from: isoDate(from), to: isoDate(to) };
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById('report-apply-btn').addEventListener('click', () => {
    const from = document.getElementById('report-from').value;
    const to = document.getElementById('report-to').value;
    if (!from || !to) return;
    loadReport({ from, to }).catch(showReportsError);
  });

  document.querySelectorAll('.report-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => loadReport(presetRange(btn.dataset.preset)).catch(showReportsError));
  });

  document.getElementById('export-report-btn').addEventListener('click', () => {
    if (lastReportData) exportReport(lastReportData);
  });

  try {
    await loadReport();
  } catch (err) {
    showReportsError(err);
  }
})();
