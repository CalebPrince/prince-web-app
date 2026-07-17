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
  loading.classList.remove("d-none");
  wrap.classList.add("d-none");
  wrap.innerHTML = "";

  if (!contactModal) contactModal = new bootstrap.Modal(document.getElementById("contact-modal"));
  contactModal.show();

  try {
    const res = await api.get("/api/v1/admin/contacts/" + encodeURIComponent(c.email));
    renderTimeline(res.timeline);
    loading.classList.add("d-none");
    wrap.classList.remove("d-none");
  } catch (err) {
    loading.textContent = err.message;
  }
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
})();
