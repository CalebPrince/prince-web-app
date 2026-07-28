(function () {
  const rowsEl = document.getElementById("expense-rows");
  const form = document.getElementById("expense-form");
  const currencyEl = document.getElementById("expense-currency");
  const budgetEl = document.getElementById("expense-budget");
  let items = [];
  let monthlyRevenue = [];
  let monthlyRevenueBySource = [];

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const amount = (subunits, currency) => `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
    const matchingRevenue = monthlyRevenue.find(row => String(row.currency).toUpperCase() === currency);
    const revenue = Number(matchingRevenue?.total || 0);
    const net = revenue - total;
    const margin = revenue > 0 ? Math.round((net / revenue) * 100) : null;
    const coverage = matchingRevenue && total > 0 ? revenue / total : null;

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

    document.getElementById("finance-revenue").textContent = monthlyRevenue.length
      ? monthlyRevenue.map(row => amount(row.total, row.currency)).join(" + ")
      : amount(0, currency);
    document.getElementById("finance-expenses").textContent = amount(total, currency);
    const netEl = document.getElementById("finance-net");
    netEl.textContent = matchingRevenue ? `${net < 0 ? "−" : ""}${amount(Math.abs(net), currency)}` : "Not comparable";
    netEl.classList.toggle("is-negative", matchingRevenue && net < 0);
    netEl.classList.toggle("is-positive", matchingRevenue && net >= 0);
    document.getElementById("finance-margin").textContent = margin === null ? "—" : `${margin}%`;
    document.getElementById("finance-net-note").textContent = matchingRevenue
      ? (net >= 0 ? "Operating surplus this month" : "Operating shortfall this month")
      : "Revenue and expenses use different currencies";
    document.getElementById("finance-coverage").textContent = !matchingRevenue
      ? "Use a matching reporting currency"
      : coverage === null
        ? "Add expenses to calculate coverage"
        : `${coverage.toFixed(1)}× expense coverage`;
    const sources = monthlyRevenueBySource;
    document.getElementById("finance-revenue-source").textContent = sources.length
      ? `${sources.length} recorded payment source${sources.length === 1 ? "" : "s"}`
      : "No confirmed payments this month";
    document.getElementById("finance-sources").innerHTML = sources.length
      ? sources.map(source => `<div><span>${esc(source.source)}</span><strong>${amount(source.total, source.currency)}</strong></div>`).join("")
      : '<p class="text-muted-custom small mb-0">No successful Paystack or manually recorded payments this month.</p>';

    const unmatched = monthlyRevenue.filter(row => String(row.currency).toUpperCase() !== currency);
    const currencyNote = document.getElementById("finance-currency-note");
    currencyNote.classList.toggle("d-none", monthlyRevenue.length === 0 || unmatched.length === 0);
    currencyNote.innerHTML = unmatched.length
      ? `<i class="bi bi-currency-exchange"></i><span><strong>Currency note:</strong> Net profit compares only ${esc(currency)} revenue with ${esc(currency)} expenses. Revenue in ${unmatched.map(row => esc(row.currency)).join(", ")} is shown but not converted automatically.</span>`
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
  currencyEl.addEventListener("input", renderMetrics);
  budgetEl.addEventListener("input", renderMetrics);

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
      const data = await api.get("/api/v1/admin/dashboard");
      const expenses = data.external_expenses || {};
      currencyEl.value = expenses.currency || "USD";
      budgetEl.value = expenses.monthly_budget ? (expenses.monthly_budget / 100).toFixed(2) : "";
      items = (expenses.items || []).map(item => ({ name: item.name, type: item.type, amount: item.amount }));
      monthlyRevenue = expenses.monthly_revenue || [];
      monthlyRevenueBySource = expenses.monthly_revenue_by_source || [];
      renderRows();
      renderMetrics();
    } catch (error) {
      showMessage(error.message, false);
    }
  })();
})();
