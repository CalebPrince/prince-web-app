let tagModal = null;
let allTags = [];

function renderTagsTable(tags) {
  const tbody = document.getElementById("tags-tbody");
  const empty = document.getElementById("empty-state");
  empty.classList.toggle("d-none", tags.length > 0);

  tbody.innerHTML = tags.map(t => `
    <tr>
      <td class="ps-3">${t.name}</td>
      <td><code>${t.slug}</code></td>
      <td>${t.project_count}</td>
      <td class="text-end pe-3">
        <button class="btn btn-sm btn-outline-secondary rename-btn" data-id="${t.id}">Rename</button>
        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${t.id}">Delete</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".rename-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(tags.find(t => t.id === Number(btn.dataset.id))));
  });
  tbody.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteTag(tags.find(t => t.id === Number(btn.dataset.id))));
  });
}

async function loadTags() {
  allTags = await api.get("/api/v1/admin/tags");
  renderTagsTable(allTags);
}

function openNewModal() {
  document.getElementById("tag-form").reset();
  document.getElementById("tag-id").value = "";
  document.getElementById("modal-title").textContent = "New Tag";
  tagModal.show();
}

function openEditModal(tag) {
  document.getElementById("tag-id").value = tag.id;
  document.getElementById("tag-name").value = tag.name;
  document.getElementById("modal-title").textContent = "Rename Tag";
  tagModal.show();
}

async function saveTag() {
  const id = document.getElementById("tag-id").value;
  const payload = { name: document.getElementById("tag-name").value };

  try {
    if (id) {
      await api.put(`/api/v1/admin/tags/${id}`, payload);
    } else {
      await api.post("/api/v1/admin/tags", payload);
    }
  } catch (err) {
    alert(err.message);
    return;
  }
  tagModal.hide();
  await loadTags();
}

async function deleteTag(tag) {
  const warning = tag.project_count > 0
    ? `Delete "${tag.name}"? It will be removed from ${tag.project_count} project(s).`
    : `Delete "${tag.name}"?`;
  if (!confirm(warning)) return;
  await api.delete(`/api/v1/admin/tags/${tag.id}`);
  await loadTags();
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  tagModal = new bootstrap.Modal(document.getElementById("tag-modal"));
  document.getElementById("new-tag-btn").addEventListener("click", openNewModal);
  document.getElementById("save-tag-btn").addEventListener("click", saveTag);

  await loadTags();
})();
