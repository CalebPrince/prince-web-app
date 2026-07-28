(function () {
  const rowsEl = document.getElementById("expense-rows");
  const form = document.getElementById("expense-form");
  const currencyEl = document.getElementById("expense-currency");
  const budgetEl = document.getElementById("expense-budget");
  let items = [];
  let monthlyRevenue = [];
  let monthlyRevenueBySource = [];
  let expenseHistory = [];
  let trendPeriod = "month";
  let usdGhsRate = null;
  let activeCurrency = "USD";

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const amount = (subunits, currency) => `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  function convert(subunits, from, to) {
    from = String(from).toUpperCase();
    to = String(to).toUpperCase();
    if (from === to) return Number(subunits || 0);
    if (!usdGhsRate) return null;
    if (from === "USD" && to === "GHS") return Math.round(Number(subunits || 0) * usdGhsRate);
    if (from === "GHS" && to === "USD") return Math.round(Number(subunits || 0) / usdGhsRate);
    return null;
  }

  const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const shiftedMonth = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, 1);
  const monthName = key => {
    const [year, month] = key.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(new Date(year, month - 1, 1));
  };

  function trendMonths(period, previous = false) {
    const now = new Date();
    if (period === "month") return [monthKey(shiftedMonth(now, previous ? -1 : 0))];
    if (period === "quarter") {
      const elapsed = (now.getMonth() % 3) + 1;
      const start = new Date(now.getFullYear(), now.getMonth() - (now.getMonth() % 3) + (previous ? -3 : 0), 1);
      return Array.from({ length: elapsed }, (_, index) => monthKey(shiftedMonth(start, index)));
    }
    const year = now.getFullYear() - (previous ? 1 : 0);
    return Array.from({ length: now.getMonth() + 1 }, (_, index) => monthKey(new Date(year, index, 1)));
  }

  function trendLabel(period, previous = false) {
    const now = new Date();
    if (period === "month") return monthName(monthKey(shiftedMonth(now, previous ? -1 : 0)));
    if (period === "quarter") {
      const date = shiftedMonth(now, previous ? -3 : 0);
      return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}${date.getMonth() % 3 < 2 ? " to date" : ""}`;
    }
    return `${now.getFullYear() - (previous ? 1 : 0)} to ${new Intl.DateTimeFormat(undefined, { month: "short" }).format(now)}`;
  }

  function renderExpenseTrends(liveTotal, currency) {
    const currentKey = monthKey(new Date());
    const values = new Map();
    expenseHistory.forEach(row => {
      const converted = convert(row.total, row.currency, currency);
      if (converted !== null) values.set(row.period_month, converted);
    });
    values.set(currentKey, liveTotal);

    const currentMonths = trendMonths(trendPeriod);
    const previousMonths = trendMonths(trendPeriod, true);
    const currentRecorded = currentMonths.filter(key => values.has(key));
    const previousRecorded = previousMonths.filter(key => values.has(key));
    const currentTotal = currentRecorded.reduce((sum, key) => sum + values.get(key), 0);
    const previousTotal = previousRecorded.reduce((sum, key) => sum + values.get(key), 0);
    const complete = currentRecorded.length === currentMonths.length && previousRecorded.length === previousMonths.length;
    const difference = currentTotal - previousTotal;
    const percentage = previousTotal > 0 ? Math.abs(difference / previousTotal * 100) : null;

    document.getElementById("expense-current-label").textContent = trendLabel(trendPeriod);
    document.getElementById("expense-previous-label").textContent = trendLabel(trendPeriod, true);
    document.getElementById("expense-current-period").textContent = amount(currentTotal, currency);
    document.getElementById("expense-previous-period").textContent = previousRecorded.length ? amount(previousTotal, currency) : "—";
    document.getElementById("expense-current-coverage").textContent = `${currentRecorded.length} of ${currentMonths.length} month${currentMonths.length === 1 ? "" : "s"} recorded`;
    document.getElementById("expense-previous-coverage").textContent = `${previousRecorded.length} of ${previousMonths.length} month${previousMonths.length === 1 ? "" : "s"} recorded`;

    const direction = document.getElementById("expense-trend-direction");
    direction.className = "expense-trend-direction";
    if (!complete) {
      direction.innerHTML = '<i class="bi bi-dash-lg"></i><strong>Not enough history yet</strong><small>Both equivalent periods must be fully recorded before the difference is calculated.</small>';
    } else if (difference === 0) {
      direction.innerHTML = '<i class="bi bi-arrow-left-right"></i><strong>No spending change</strong><small>The two periods have the same recorded expense.</small>';
    } else {
      const more = difference > 0;
      direction.classList.add(more ? "is-more" : "is-less");
      direction.innerHTML = `<i class="bi bi-arrow-${more ? "up" : "down"}-right"></i><strong>${amount(Math.abs(difference), currency)} ${more ? "more" : "less"}</strong><small>${percentage === null ? "Previous period was zero." : `${percentage.toFixed(1)}% ${more ? "increase" : "decrease"} from the previous period.`}</small>`;
    }

    const months = Array.from({ length: 12 }, (_, index) => monthKey(shiftedMonth(new Date(), index - 11)));
    const maximum = Math.max(...months.map(key => values.get(key) || 0), 1);
    document.getElementById("expense-history-bars").innerHTML = months.some(key => values.has(key))
      ? months.map(key => {
          const value = values.get(key);
          const height = value === undefined ? 0 : Math.max(3, value / maximum * 100);
          return `<div class="expense-history-bar${key === currentKey ? " is-current" : ""}" title="${esc(monthName(key))}: ${value === undefined ? "not recorded" : amount(value, currency)}"><i style="height:${height}%"></i><span>${esc(monthName(key).split(" ")[0])}</span></div>`;
        }).join("")
      : '<div class="expense-history-empty">Save this month’s expense plan to begin the comparison history.</div>';
  }

  function rowTemplate(item, index) {
    return `<div class="expense-ledger-row" data-index="${index}">
      <label><span class="visually-hidden">Service name</span><input class="form-control expense-name" maxlength="80" value="${esc(item.name)}" placeholder="Service name"></label>
      <label><span class="visually-hidden">Cost type</span><select class="form-select expense-type"><option value="fixed"${item.type === "fixed" ? " selected" : ""}>Fixed</option><option value="usage"${item.type === "usage" ? " selected" : ""}>Usage estimate</option></select></label>
      <label><span class="visually-hidden">Monthly amount</span><div class="input-group"><span class="input-group-text expense-row-currency">${esc(currencyEl.value || "USD")}</span><input class="form-control expense-amount" type="number" min="0" step="0.01" value="${item.amount === null ? "" : (item.amount / 100).toFixed(2)}" placeholder="0.00"></div></label>
      <button type="button" class="expense-remove" aria-label="Remove ${esc(item.name || "service")}"><i class="bi bi-trash3"></i></button>
    </div>`;
  }

  function syncFromRows() {
    items = [...rowsEl.querySelectorAll(".expense-ledger-row")].map(row => {
      const raw = row.querySelector(".expense-amount").value;
      return {
        name: row.querySelector(".expense-name").value.trim(),
        type: row.querySelector(".expense-type").value,
        amount: raw === "" ? null : Math.round(Math.max(0, Number(raw)) * 100),
      };
    });
  }

  function renderRows() {
    rowsEl.innerHTML = items.map(rowTemplate).join("");
    document.getElementById("expense-empty").classList.toggle("d-none", items.length > 0);
    rowsEl.querySelectorAll(".expense-remove").forEach(button => button.addEventListener("click", () => {
      syncFromRows();
      items.splice(Number(button.closest(".expense-ledger-row").dataset.index), 1);
      renderRows();
      renderMetrics();
    }));
    rowsEl.querySelectorAll("input,select").forEach(control => control.addEventListener("input", () => {
      syncFromRows();
      renderMetrics();
    }));
  }

  function renderMetrics() {
    const currency = (currencyEl.value || "USD").toUpperCase();
    document.querySelectorAll(".expense-row-currency").forEach(el => { el.textContent = currency; });
    document.getElementById("expense-budget-prefix").textContent = currency;
    const namedItems = items.filter(i => i.name);
    const fixed = namedItems.filter(i => i.type === "fixed").reduce((sum, i) => sum + (i.amount || 0), 0);
    const usage = namedItems.filter(i => i.type === "usage").reduce((sum, i) => sum + (i.amount || 0), 0);
    const total = fixed + usage;
    const budget = Math.round(Math.max(0, Number(budgetEl.value || 0)) * 100);
    const largest = [...namedItems].filter(i => i.amount !== null).sort((a, b) => b.amount - a.amount)[0];
    const fixedShare = total ? Math.round((fixed / total) * 100) : 0;
    const convertedRevenue = monthlyRevenue.map(row => convert(row.total, row.currency, currency)).filter(value => value !== null);
    const hasComparableRevenue = convertedRevenue.length > 0;
    const revenue = convertedRevenue.reduce((sum, value) => sum + value, 0);
    const net = revenue - total;
    const margin = revenue > 0 ? Math.round((net / revenue) * 100) : null;
    const coverage = hasComparableRevenue && total > 0 ? revenue / total : null;

    document.getElementById("expense-monthly-total").textContent = amount(total, currency);
    document.getElementById("expense-fixed-total").textContent = amount(fixed, currency);
    document.getElementById("expense-usage-total").textContent = amount(usage, currency);
    document.getElementById("expense-budget-total").textContent = budget ? amount(budget, currency) : "Not set";
    document.getElementById("expense-annual").textContent = amount(total * 12, currency);
    document.getElementById("expense-daily").textContent = amount(Math.round(total / 30.4), currency);
    document.getElementById("expense-largest").textContent = largest ? amount(largest.amount, currency) : "—";
    document.getElementById("expense-largest-name").textContent = largest ? largest.name : "No costs entered";
    document.getElementById("expense-fixed-share").textContent = `${fixedShare}%`;
    document.getElementById("expense-donut").style.setProperty("--fixed-share", `${fixedShare * 3.6}deg`);

    document.getElementById("finance-revenue").textContent = hasComparableRevenue
      ? amount(revenue, currency)
      : amount(0, currency);
    document.getElementById("finance-expenses").textContent = amount(total, currency);
    const netEl = document.getElementById("finance-net");
    netEl.textContent = hasComparableRevenue ? `${net < 0 ? "−" : ""}${amount(Math.abs(net), currency)}` : "—";
    netEl.classList.toggle("is-negative", hasComparableRevenue && net < 0);
    netEl.classList.toggle("is-positive", hasComparableRevenue && net >= 0);
    document.getElementById("finance-margin").textContent = margin === null ? "—" : `${margin}%`;
    document.getElementById("finance-net-note").textContent = hasComparableRevenue
      ? (net >= 0 ? "Operating surplus this month" : "Operating shortfall this month")
      : "No confirmed revenue this month";
    document.getElementById("finance-coverage").textContent = !hasComparableRevenue
      ? "Waiting for confirmed revenue"
      : coverage === null
        ? "Add expenses to calculate coverage"
        : `${coverage.toFixed(1)}× expense coverage`;
    const sources = monthlyRevenueBySource;
    document.getElementById("finance-revenue-source").textContent = sources.length
      ? `${sources.length} recorded payment source${sources.length === 1 ? "" : "s"}`
      : "No confirmed payments this month";
    document.getElementById("finance-sources").innerHTML = sources.length
      ? sources.map(source => {
          const converted = convert(source.total, source.currency, currency);
          const value = converted === null ? amount(source.total, source.currency) : amount(converted, currency);
          return `<div><span>${esc(source.source)}</span><strong>${value}</strong></div>`;
        }).join("")
      : '<p class="text-muted-custom small mb-0">No successful Paystack or manually recorded payments this month.</p>';

    const convertedCurrencies = monthlyRevenue.filter(row => String(row.currency).toUpperCase() !== currency && convert(row.total, row.currency, currency) !== null);
    const unmatched = monthlyRevenue.filter(row => convert(row.total, row.currency, currency) === null);
    const currencyNote = document.getElementById("finance-currency-note");
    currencyNote.classList.toggle("d-none", convertedCurrencies.length === 0 && unmatched.length === 0);
    currencyNote.innerHTML = convertedCurrencies.length
      ? `<i class="bi bi-currency-exchange"></i><span><strong>Automatic conversion:</strong> Revenue and expenses are displayed in ${esc(currency)} using 1 USD = ${usdGhsRate.toFixed(4)} GHS.${unmatched.length ? ` ${unmatched.map(row => esc(row.currency)).join(", ")} could not be converted.` : ""}</span>`
      : unmatched.length
        ? `<i class="bi bi-exclamation-circle"></i><span>Revenue in ${unmatched.map(row => esc(row.currency)).join(", ")} could not be converted to ${esc(currency)}.</span>`
        : "";

    const ceiling = Math.max(total, budget, 1);
    document.getElementById("expense-budget-bar").style.width = `${Math.min(100, total / ceiling * 100)}%`;
    document.getElementById("expense-fixed-marker").style.left = `${Math.min(100, fixed / ceiling * 100)}%`;
    const variance = budget - total;
    const varianceEl = document.getElementById("expense-variance");
    varianceEl.textContent = budget ? amount(Math.abs(variance), currency) : "—";
    varianceEl.classList.toggle("text-danger", budget > 0 && variance < 0);
    document.getElementById("expense-variance-note").textContent = !budget ? "Add a monthly ceiling" : variance >= 0 ? "remaining in budget" : "over monthly budget";
    document.getElementById("expense-budget-note").textContent = !budget ? "Set a budget to measure headroom." : variance >= 0 ? `${amount(variance, currency)} headroom remains.` : `${amount(Math.abs(variance), currency)} above budget.`;
    renderExpenseTrends(total, currency);

    const missing = namedItems.filter(i => i.amount === null);
    const missingEl = document.getElementById("expense-missing");
    missingEl.classList.toggle("d-none", missing.length === 0);
    missingEl.innerHTML = missing.length ? `<i class="bi bi-exclamation-circle"></i><span><strong>${missing.length} amount${missing.length === 1 ? "" : "s"} needed</strong>${missing.map(i => esc(i.name)).join(", ")}</span>` : "";
  }

  function showMessage(text, ok) {
    const el = document.getElementById("expense-msg");
    el.textContent = text;
    el.className = `alert py-2 small ${ok ? "alert-success" : "alert-danger"}`;
  }

  document.getElementById("expense-add").addEventListener("click", () => {
    syncFromRows();
    items.push({ name: "", type: "fixed", amount: 0 });
    renderRows();
    rowsEl.querySelector(".expense-ledger-row:last-child .expense-name")?.focus();
  });
  currencyEl.addEventListener("change", () => {
    syncFromRows();
    const nextCurrency = currencyEl.value;
    if (nextCurrency === activeCurrency) return renderMetrics();
    const factorAvailable = convert(100, activeCurrency, nextCurrency) !== null;
    if (!factorAvailable) {
      currencyEl.value = activeCurrency;
      return showMessage("The live exchange rate is unavailable, so amounts were not changed.", false);
    }
    items = items.map(item => ({ ...item, amount: item.amount === null ? null : convert(item.amount, activeCurrency, nextCurrency) }));
    const budget = Math.round(Math.max(0, Number(budgetEl.value || 0)) * 100);
    budgetEl.value = budget ? (convert(budget, activeCurrency, nextCurrency) / 100).toFixed(2) : "";
    activeCurrency = nextCurrency;
    renderRows();
    renderMetrics();
  });
  budgetEl.addEventListener("input", renderMetrics);
  document.querySelectorAll(".expense-trend-tabs button").forEach(button => button.addEventListener("click", () => {
    trendPeriod = button.dataset.period;
    document.querySelectorAll(".expense-trend-tabs button").forEach(item => item.classList.toggle("active", item === button));
    renderMetrics();
  }));

  form.addEventListener("submit", async event => {
    event.preventDefault();
    syncFromRows();
    items = items.filter(item => item.name);
    const currency = currencyEl.value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return showMessage("Use a three-letter currency such as USD or GHS.", false);
    const lines = items.map(item => `${item.name} | ${item.amount === null ? "" : (item.amount / 100).toFixed(2)} | ${item.type}`).join("\n");
    const button = document.getElementById("expense-save");
    button.disabled = true;
    try {
      await api.put("/api/v1/admin/settings", {
        external_expense_currency: currency,
        external_expense_monthly_budget: budgetEl.value.trim(),
        external_service_expenses: lines,
      });
      showMessage("Expense plan saved. Dashboard totals are updated.", true);
    } catch (error) {
      showMessage(error.message, false);
    } finally {
      button.disabled = false;
    }
  });

  (async function init() {
    const user = await requireAdminAuth();
    if (!user) return;
    wireLogout();
    document.getElementById("expense-period-label").textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date());
    try {
      const [data, fx] = await Promise.all([
        api.get("/api/v1/admin/dashboard"),
        api.get("/api/v1/admin/exchange-rate").catch(() => null),
      ]);
      const expenses = data.external_expenses || {};
      if (![...currencyEl.options].some(option => option.value === expenses.currency)) {
        currencyEl.add(new Option(expenses.currency, expenses.currency));
      }
      currencyEl.value = expenses.currency || "USD";
      activeCurrency = currencyEl.value;
      usdGhsRate = Number(fx?.rate || 0) || null;
      const rateStatus = document.getElementById("expense-rate-status");
      const rateUpdated = fx?.updated_at ? new Date(fx.updated_at) : null;
      const rateUpdatedLabel = rateUpdated && !Number.isNaN(rateUpdated.getTime())
        ? rateUpdated.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
        : "recently";
      rateStatus.innerHTML = usdGhsRate
        ? `<i class="bi bi-check2-circle"></i><span>1 USD = ${usdGhsRate.toFixed(4)} GHS · ${esc(fx.provider || "cached rate")} · updated ${esc(rateUpdatedLabel)}</span>`
        : '<i class="bi bi-exclamation-circle"></i><span>Live conversion is temporarily unavailable.</span>';
      rateStatus.classList.toggle("is-unavailable", !usdGhsRate);
      budgetEl.value = expenses.monthly_budget ? (expenses.monthly_budget / 100).toFixed(2) : "";
      items = (expenses.items || []).map(item => ({ name: item.name, type: item.type, amount: item.amount }));
      monthlyRevenue = expenses.monthly_revenue || [];
      monthlyRevenueBySource = expenses.monthly_revenue_by_source || [];
      expenseHistory = expenses.history || [];
      renderRows();
      renderMetrics();
    } catch (error) {
      showMessage(error.message, false);
    }
  })();
})();
