async function loadInquiries(status = "") {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const inquiries = await api.get(`/api/v1/admin/inquiries${query}`);
  const list = document.getElementById("inquiries-list");
  const empty = document.getElementById("empty-state");

  if (inquiries.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("d-none");
    return;
  }
  empty.classList.add("d-none");

  list.innerHTML = inquiries.map(i => `
    <div class="admin-card p-3 mb-3" data-id="${i.id}">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <div>
          <strong>${i.name}</strong>
          <span class="text-muted-custom small ms-2">${i.email}</span>
        </div>
        <span class="status-pill ${i.status}">${i.status}</span>
      </div>
      <p class="mb-2">${i.message}</p>
      <div class="d-flex justify-content-between align-items-center">
        <small class="text-muted-custom">${new Date(i.created_at).toLocaleString()}</small>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary status-btn" data-id="${i.id}" data-status="read">Mark Read</button>
          <button class="btn btn-sm btn-outline-danger status-btn" data-id="${i.id}" data-status="flagged">Flag</button>
          <button class="btn btn-sm btn-outline-secondary status-btn" data-id="${i.id}" data-status="archived">Archive</button>
        </div>
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".status-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await api.patch(`/api/v1/admin/inquiries/${btn.dataset.id}`, { status: btn.dataset.status });
      await loadInquiries(document.getElementById("status-filter").value);
    });
  });
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById("status-filter").addEventListener("change", (e) => {
    loadInquiries(e.target.value);
  });

  await loadInquiries();
})();
