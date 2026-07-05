let allChats = [];

const STATUS_LABELS = {
  none: "chatting",
  generated: "prototype built",
  approved: "approved",
  changes_requested: "changes requested",
};

function chatCard(c) {
  const who = c.client_name
    ? `<strong>${escapeHtml(c.client_name)}</strong> <span class="text-muted-custom small ms-1">${escapeHtml(c.client_email || "")}</span>`
    : `<strong>Anonymous visitor</strong>`;

  const transcript = c.transcript.map(t => `
    <div class="ai-msg ${t.role === "user" ? "user" : "bot"} small mb-1">
      <span class="text-muted-custom">${t.role === "user" ? "Visitor" : "AI"}:</span> ${escapeHtml(t.text)}
    </div>
  `).join("");

  return `
    <div class="admin-card p-3 mb-3 ${c.admin_seen ? "" : "chat-unseen"}" data-id="${c.id}">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>${who}${c.admin_seen ? "" : ' <span class="status-pill unread ms-1">new</span>'}</div>
        <span class="status-pill chat-${c.prototype_status}">${STATUS_LABELS[c.prototype_status]}</span>
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
          ${c.admin_seen ? "" : `<button class="btn btn-sm btn-brand seen-btn" data-id="${c.id}">Mark seen</button>`}
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
    });
  });
}

async function loadChats() {
  allChats = await api.get("/api/v1/admin/chats");
  applyFilter();
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById("status-filter").addEventListener("change", applyFilter);
  await loadChats();
})();
