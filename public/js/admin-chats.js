let allChats = [];

const STATUS_LABELS = {
  none: "chatting",
  message: "left message",
  generated: "prototype built",
  approved: "approved",
  changes_requested: "changes requested",
};

// A session with contact details but no prototype is a direct "leave a message" lead.
function statusKey(c) {
  return c.prototype_status === "none" && c.client_name ? "message" : c.prototype_status;
}

function chatCard(c) {
  const isWhatsapp = c.token.startsWith("whatsapp:");
  const who = c.client_name
    ? `<strong>${escapeHtml(c.client_name)}</strong> <span class="text-muted-custom small ms-1">${escapeHtml(c.client_email || "")}${c.client_phone ? " · " + escapeHtml(c.client_phone) : ""}</span>`
    : `<strong>Anonymous visitor</strong>`;
  const channelBadge = isWhatsapp ? ' <span class="status-pill" style="background:#dcfce7;color:#166534;">WhatsApp</span>' : "";

  const transcript = c.transcript.map(t => `
    <div class="ai-msg ${t.role === "user" ? "user" : "bot"} small mb-1">
      <span class="text-muted-custom">${t.role === "user" ? "Visitor" : "AI"}:</span> ${escapeHtml(t.text)}
    </div>
  `).join("");

  return `
    <div class="admin-card p-3 mb-3 ${c.admin_seen ? "" : "chat-unseen"}" data-id="${c.id}">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>${who}${channelBadge}${c.admin_seen ? "" : ' <span class="status-pill unread ms-1">new</span>'}</div>
        <span class="status-pill chat-${statusKey(c)}">${STATUS_LABELS[statusKey(c)]}</span>
      </div>
      ${c.client_comment ? `<div class="alert alert-light border py-2 small mb-2"><strong>Comment:</strong> ${escapeHtml(c.client_comment)}</div>` : ""}
      <details class="mb-2">
        <summary class="small text-muted-custom" style="cursor:pointer;">Transcript (${c.transcript.length} messages)</summary>
        <div class="border rounded p-2 mt-2" style="max-height:220px;overflow-y:auto;">${transcript}</div>
      </details>
      <div class="d-flex justify-content-between align-items-center">
        <small class="text-muted-custom">Last activity: ${new Date(c.updated_at + "Z").toLocaleString()}</small>
        <div class="d-flex gap-2">
          ${c.has_prototype ? `<a class="btn btn-sm btn-outline-secondary" href="/api/v1/chat/prototype/${c.token}" target="_blank" rel="noopener">View prototype ↗</a>` : ""}
          ${c.client_email ? `<a class="btn btn-sm btn-outline-secondary" href="mailto:${escapeHtml(c.client_email)}">Reply by email</a>` : ""}
          ${c.client_phone ? `<a class="btn btn-sm btn-outline-secondary" href="tel:${escapeHtml(c.client_phone)}">Call</a>` : ""}
          ${c.admin_seen ? "" : `<button class="btn btn-sm btn-brand seen-btn" data-id="${c.id}">Mark seen</button>`}
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${c.id}" title="Delete permanently">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function applyFilter() {
  const filter = document.getElementById("status-filter").value;
  let chats = allChats;
  if (filter === "feedback") {
    chats = chats.filter(c => c.prototype_status === "approved" || c.prototype_status === "changes_requested");
  } else if (filter) {
    chats = chats.filter(c => c.prototype_status === filter);
  }

  const list = document.getElementById("chats-list");
  document.getElementById("empty-state").classList.toggle("d-none", chats.length > 0);
  list.innerHTML = chats.map(chatCard).join("");

  list.querySelectorAll(".seen-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await api.patch(`/api/v1/admin/chats/${btn.dataset.id}`, { admin_seen: true });
      await loadChats();
      window.dispatchEvent(new Event("admin:notifications-changed"));
    });
  });

  list.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this conversation permanently? This can't be undone.")) return;
      await api.delete(`/api/v1/admin/chats/${btn.dataset.id}`);
      await loadChats();
      window.dispatchEvent(new Event("admin:notifications-changed"));
    });
  });
}

async function loadChats() {
  allChats = await api.get("/api/v1/admin/chats");
  applyFilter();
}

// Lead-gen funnel over the transcripts already stored — supplementary, so a
// failure here never blocks the conversation list.
function statTile(label, value, sub) {
  return `
    <div class="col-6 col-md-3">
      <div class="admin-card p-3 h-100">
        <div class="h4 mb-0">${value}</div>
        <div class="small text-muted-custom">${label}</div>
        ${sub ? `<div class="small text-muted-custom">${sub}</div>` : ""}
      </div>
    </div>`;
}

async function loadStats() {
  try {
    const s = await api.get("/api/v1/admin/chats/stats");
    document.getElementById("chat-stats").innerHTML =
      statTile("Conversations", s.engaged, `${s.total_sessions} sessions · ${s.last_7_days} this week`) +
      statTile("Leads captured", s.leads, `${s.lead_conversion_pct}% of conversations`) +
      statTile("Prototype-ready", s.reached_prototype_ready, `${s.prototypes_built} built`) +
      statTile("Prototype feedback", `${s.prototypes_approved} ✓ / ${s.prototypes_changes} ✎`, "approved / changes");
  } catch (_) { /* stats are supplementary — ignore */ }
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById("status-filter").addEventListener("change", applyFilter);

  document.getElementById("delete-all-btn").addEventListener("click", async () => {
    const count = allChats.length;
    if (!count) return;
    if (!confirm(`Delete all ${count} conversation${count === 1 ? "" : "s"} permanently? This can't be undone.`)) return;
    await api.delete("/api/v1/admin/chats");
    await loadChats();
    await loadStats();
  });

  await loadChats();
  const requestedId = Number(new URLSearchParams(location.search).get("open"));
  const requestedChat = allChats.find(chat => Number(chat.id) === requestedId);
  if (requestedChat) {
    if (!requestedChat.admin_seen) {
      await api.patch(`/api/v1/admin/chats/${requestedId}`, { admin_seen: true });
      requestedChat.admin_seen = true;
      applyFilter();
      window.dispatchEvent(new Event("admin:notifications-changed"));
    }
    const card = document.querySelector(`.admin-card[data-id="${requestedId}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
    card?.querySelector("details")?.setAttribute("open", "");
    card?.classList.add("notification-focus");
  }
  await loadStats();
})();
