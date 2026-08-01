let allSageChats = [];

function sageChatCard(c) {
  const who = c.client_name || c.client_email
    ? `<strong>${escapeHtml(c.client_name || "Unnamed visitor")}</strong> <span class="text-muted-custom small ms-1">${escapeHtml(c.client_email || "")}</span>`
    : `<strong>Anonymous visitor</strong>`;

  const transcript = c.transcript.map(t => `
    <div class="ai-msg ${t.role === "user" ? "user" : "bot"} small mb-1">
      <span class="text-muted-custom">${t.role === "user" ? "Visitor" : "Sage"}:</span> ${escapeHtml(t.text)}
    </div>
  `).join("");

  return `
    <div class="admin-card p-3 mb-3 ${c.admin_seen ? "" : "chat-unseen"}" data-id="${c.id}">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>${who}${c.admin_seen ? "" : ' <span class="status-pill unread ms-1">new</span>'}</div>
        <small class="text-muted-custom">${c.transcript.length} messages</small>
      </div>
      <details class="mb-2">
        <summary class="small text-muted-custom" style="cursor:pointer;">Transcript</summary>
        <div class="border rounded p-2 mt-2" style="max-height:220px;overflow-y:auto;">${transcript}</div>
      </details>
      <div class="d-flex justify-content-between align-items-center">
        <small class="text-muted-custom">Last activity: ${new Date(c.updated_at + "Z").toLocaleString()}</small>
        <div class="d-flex gap-2">
          ${c.client_email ? `<a class="btn btn-sm btn-outline-secondary" href="mailto:${escapeHtml(c.client_email)}">Reply by email</a>` : ""}
          ${c.admin_seen ? "" : `<button class="btn btn-sm btn-brand seen-btn" data-id="${c.id}">Mark seen</button>`}
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${c.id}" title="Delete permanently">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function applySageFilter() {
  const filter = document.getElementById("status-filter").value;
  let chats = allSageChats;
  if (filter === "unread") {
    chats = chats.filter(c => !c.admin_seen);
  } else if (filter === "contact") {
    chats = chats.filter(c => c.client_name || c.client_email);
  }

  const list = document.getElementById("chats-list");
  document.getElementById("empty-state").classList.toggle("d-none", chats.length > 0);
  list.innerHTML = chats.map(sageChatCard).join("");

  list.querySelectorAll(".seen-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await api.patch(`/api/v1/admin/sage-chats/${btn.dataset.id}`, { admin_seen: true });
      await loadSageChats();
      window.dispatchEvent(new Event("admin:notifications-changed"));
    });
  });

  list.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this conversation permanently? This can't be undone.")) return;
      await api.delete(`/api/v1/admin/sage-chats/${btn.dataset.id}`);
      await loadSageChats();
      window.dispatchEvent(new Event("admin:notifications-changed"));
    });
  });
}

async function loadSageChats() {
  allSageChats = await api.get("/api/v1/admin/sage-chats");
  applySageFilter();
}

function sageStatTile(label, value) {
  return `
    <div class="col-6 col-md-3">
      <div class="admin-card p-3 h-100">
        <div class="h4 mb-0">${value}</div>
        <div class="small text-muted-custom">${label}</div>
      </div>
    </div>`;
}

function renderSageStats() {
  const total = allSageChats.length;
  const unread = allSageChats.filter(c => !c.admin_seen).length;
  const withContact = allSageChats.filter(c => c.client_name || c.client_email).length;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const last7Days = allSageChats.filter(c => new Date(c.created_at + "Z").getTime() >= weekAgo).length;

  document.getElementById("chat-stats").innerHTML =
    sageStatTile("Conversations", total) +
    sageStatTile("Unread", unread) +
    sageStatTile("Shared a name/email", withContact) +
    sageStatTile("This week", last7Days);
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById("status-filter").addEventListener("change", applySageFilter);

  document.getElementById("delete-all-btn").addEventListener("click", async () => {
    const count = allSageChats.length;
    if (!count) return;
    if (!confirm(`Delete all ${count} conversation${count === 1 ? "" : "s"} permanently? This can't be undone.`)) return;
    await api.delete("/api/v1/admin/sage-chats");
    await loadSageChats();
    renderSageStats();
  });

  await loadSageChats();
  renderSageStats();
})();
