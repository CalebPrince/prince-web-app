// Contacts: a read-only, merged view over every pipeline that captures a
// name/email (inquiries, marketing leads, clients, proposals, payments,
// appointments, drip enrollments, live chat). All aggregation happens
// server-side (src/Controllers/ContactsController.php) — this file just
// renders the list and, per contact, fetches and displays the full timeline.

let ALL_CONTACTS = [];

const TYPE_LABEL = {
  inquiry: "Inquiry",
  marketing_lead: "Marketing outreach",
  client: "Client account",
  proposal: "Proposal",
  payment: "Payment",
  appointment: "Booking",
  drip: "Drip email",
  chat: "Live chat",
};

const SOURCE_BADGE_LABEL = {
  inquiry: "Inquiry",
  marketing_lead: "Marketing",
  client: "Client",
  proposal: "Proposal",
  payment: "Payment",
  appointment: "Booking",
  drip: "Drip",
  chat: "Chat",
};

function formatMoney(subunits, currency) {
  return (Number(subunits) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (currency || "");
}

function formatWhen(at) {
  if (!at || at.startsWith("1970-01-01")) return "—";
  return new Date(at.replace(" ", "T") + "Z").toLocaleString();
}

let revenueChart = null;

function monthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

async function loadPipelineSummary() {
  let data;
  try {
    data = await api.get("/api/v1/admin/contacts/pipeline-summary");
  } catch (err) {
    // A failure here shouldn't block the rest of the page (the contact list
    // still works fine without it) — but it also shouldn't be invisible.
    // Silently leaving every stat card blank with no clue why cost real
    // debugging time once already; a quiet console.error is enough for that
    // without needing a whole alert box for what's a secondary feature.
    console.error("Pipeline summary failed to load:", err.message);
    document.getElementById("stat-pipeline-value").textContent = "—";
    document.getElementById("stat-win-rate").textContent = "—";
    document.getElementById("stat-win-rate-detail").textContent = "Could not load: " + err.message;
    document.getElementById("stat-revenue-month").textContent = "—";
    document.getElementById("stat-revenue-total").textContent = "—";
    return;
  }

  document.getElementById("stat-pipeline-value").textContent = formatMoney(data.open_pipeline_value, data.currency);
  document.getElementById("stat-revenue-month").textContent = formatMoney(data.revenue_this_month, data.currency);
  document.getElementById("stat-revenue-total").textContent = formatMoney(data.revenue_all_time, data.currency);

  if (data.win_rate === null) {
    document.getElementById("stat-win-rate").textContent = "—";
    document.getElementById("stat-win-rate-detail").textContent = "No decided proposals yet";
  } else {
    document.getElementById("stat-win-rate").textContent = Math.round(data.win_rate * 100) + "%";
    document.getElementById("stat-win-rate-detail").textContent =
      data.proposals_accepted + " accepted · " + data.proposals_declined + " declined";
  }

  const labels = data.revenue_by_month.map((m) => monthLabel(m.month));
  const amounts = data.revenue_by_month.map((m) => Number(m.amount) / 100);
  const ctx = document.getElementById("revenue-chart").getContext("2d");
  if (revenueChart) revenueChart.destroy();
  revenueChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Revenue (" + data.currency + ")", data: amounts, backgroundColor: "rgba(79, 70, 229, 0.6)" }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });

  const total = data.revenue_by_source.reduce((sum, s) => sum + s.amount, 0);
  const bySourceEl = document.getElementById("revenue-by-source");
  bySourceEl.innerHTML = data.revenue_by_source.map((s) => {
    const pct = total > 0 ? Math.round((s.amount / total) * 100) : 0;
    return `<div class="mb-2">` +
      `<div class="d-flex justify-content-between small mb-1"><span>${escapeHtml(s.label)}</span><span>${formatMoney(s.amount, data.currency)}</span></div>` +
      `<div class="progress" style="height: 6px;"><div class="progress-bar" role="progressbar" style="width: ${pct}%"></div></div>` +
      `</div>`;
  }).join("") || '<div class="text-muted-custom small">No revenue yet.</div>';
}

function renderList(contacts) {
  const tbody = document.getElementById("contacts-list");
  const empty = document.getElementById("contacts-empty");
  tbody.innerHTML = "";
  empty.classList.toggle("d-none", contacts.length > 0);

  contacts.forEach((c) => {
    const tr = document.createElement("tr");
    tr.className = "contact-row";
    const badges = c.sources.map((s) => `<span class="contact-source-badge me-1">${escapeHtml(SOURCE_BADGE_LABEL[s] || s)}</span>`).join("");
    tr.innerHTML =
      `<td class="ps-3">${escapeHtml(c.name || "(no name on file)")}<br><span class="small text-muted-custom">${escapeHtml(c.email)}${c.phone ? " · " + escapeHtml(c.phone) : ""}</span></td>` +
      `<td>${badges}</td>` +
      `<td>${c.lifetime_value > 0 ? formatMoney(c.lifetime_value, c.lifetime_value_currency) : "<span class=\"text-muted-custom\">—</span>"}</td>` +
      `<td class="pe-3 small text-muted-custom">${escapeHtml(formatWhen(c.last_activity_at))}</td>`;
    tr.addEventListener("click", () => openContact(c));
    tbody.appendChild(tr);
  });
}

function applyFilter() {
  const q = document.getElementById("contacts-search").value.trim().toLowerCase();
  if (!q) {
    renderList(ALL_CONTACTS);
    return;
  }
  renderList(ALL_CONTACTS.filter((c) => (c.name || "").toLowerCase().includes(q) || c.email.toLowerCase().includes(q)));
}

let contactModal = null;

async function openContact(c) {
  document.getElementById("contact-modal-name").textContent = c.name || "(no name on file)";
  document.getElementById("contact-modal-meta").textContent = c.email + (c.phone ? " · " + c.phone : "");
  const loading = document.getElementById("contact-modal-loading");
  const wrap = document.getElementById("contact-modal-timeline");
  const actions = document.getElementById("contact-modal-actions");
  const actionMsg = document.getElementById("contact-modal-action-msg");
  loading.classList.remove("d-none");
  wrap.classList.add("d-none");
  wrap.innerHTML = "";
  actions.classList.add("d-none");
  actionMsg.classList.add("d-none");

  if (!contactModal) contactModal = new bootstrap.Modal(document.getElementById("contact-modal"));
  contactModal.show();

  try {
    const res = await api.get("/api/v1/admin/contacts/" + encodeURIComponent(c.email));
    renderTimeline(res.timeline);
    wireQuickActions(c, res.timeline);
    loading.classList.add("d-none");
    wrap.classList.remove("d-none");
    actions.classList.remove("d-none");
  } catch (err) {
    loading.textContent = err.message;
  }
}

// Quick actions: the point is to act on a contact without leaving this
// modal to hunt down the right page first. Starting a proposal is the one
// exception — proposals need real scope/milestone input a click can't
// supply, so this just deep-links into the Proposals page with as much
// prefilled as possible (a linked inquiry if one exists, otherwise just
// name/email) rather than trying to replicate that form here.
function wireQuickActions(c, timeline) {
  const msgEl = document.getElementById("contact-modal-action-msg");
  const showActionMsg = (text, ok) => {
    msgEl.className = "alert py-2 small " + (ok ? "alert-success" : "alert-danger");
    msgEl.textContent = text;
    msgEl.classList.remove("d-none");
  };

  document.getElementById("qa-proposal-btn").onclick = () => {
    const inquiry = timeline.find((item) => item.type === "inquiry");
    const params = new URLSearchParams();
    if (inquiry && inquiry.data && inquiry.data.id) {
      params.set("inquiry_id", inquiry.data.id);
    } else {
      params.set("client_name", c.name || "");
      params.set("client_email", c.email);
    }
    window.open("/admin/proposals.html?" + params.toString(), "_blank");
  };

  document.getElementById("qa-invite-btn").onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await api.post("/api/v1/admin/clients/invite", { name: c.name || c.email, email: c.email });
      showActionMsg(
        res.email_sent ? "Portal invite sent to " + c.email + "." : "Portal invite created, but the email could not be confirmed as delivered.",
        true
      );
    } catch (err) {
      showActionMsg(err.message, false);
    }
    btn.disabled = false;
  };

  document.getElementById("qa-drip-btn").onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await api.post("/api/v1/admin/drip/enrollments", { email: c.email, name: c.name || "" });
      showActionMsg("Enrolled " + c.email + " in the drip sequence.", true);
    } catch (err) {
      showActionMsg(err.message, false);
    }
    btn.disabled = false;
  };
}

function renderTimeline(items) {
  const wrap = document.getElementById("contact-modal-timeline");
  if (!items.length) {
    wrap.innerHTML = '<div class="text-muted-custom small">Nothing on file for this contact yet.</div>';
    return;
  }
  items.forEach((item) => {
    const el = document.createElement("div");
    el.className = "timeline-item";
    el.innerHTML =
      `<div class="d-flex justify-content-between align-items-start gap-2 mb-1">` +
      `<span class="timeline-type-badge">${escapeHtml(TYPE_LABEL[item.type] || item.type)}</span>` +
      `<span class="small text-muted-custom">${escapeHtml(formatWhen(item.at))}</span>` +
      `</div>` +
      `<div class="fw-semibold small">${escapeHtml(item.label)}</div>` +
      (item.detail ? `<div class="small text-muted-custom">${escapeHtml(item.detail)}</div>` : "");
    wrap.appendChild(el);
  });
}

async function loadContacts() {
  try {
    ALL_CONTACTS = await api.get("/api/v1/admin/contacts");
    renderList(ALL_CONTACTS);
  } catch (err) {
    const msg = document.getElementById("contacts-msg");
    msg.textContent = err.message;
    msg.classList.remove("d-none");
  }
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();
  document.getElementById("contacts-search").addEventListener("input", applyFilter);
  await loadContacts();
  await loadPipelineSummary();
})();
