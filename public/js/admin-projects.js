let projectModal = null;

function renderProjectsTable(projects) {
  const tbody = document.getElementById("projects-tbody");
  tbody.innerHTML = projects.map(p => `
    <tr>
      <td class="ps-3">${p.title}</td>
      <td class="text-capitalize">${p.category.replace("_", " ")}</td>
      <td>${p.tags.map(t => t.name).join(", ")}</td>
      <td><span class="status-pill ${p.is_published ? "published" : "draft"}">${p.is_published ? "Published" : "Draft"}</span></td>
      <td class="text-end pe-3">
        <button class="btn btn-sm btn-outline-secondary edit-btn" data-id="${p.id}">Edit</button>
        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${p.id}">Delete</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(projects.find(p => p.id === Number(btn.dataset.id))));
  });
  tbody.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteProject(Number(btn.dataset.id)));
  });
}

async function loadProjects() {
  const projects = await api.get("/api/v1/admin/projects");
  renderProjectsTable(projects);
}

function openNewModal() {
  document.getElementById("project-form").reset();
  document.getElementById("project-id").value = "";
  document.getElementById("modal-title").textContent = "New Project";
  projectModal.show();
}

function openEditModal(project) {
  document.getElementById("project-id").value = project.id;
  document.getElementById("title").value = project.title;
  document.getElementById("slug").value = project.slug;
  document.getElementById("summary").value = project.summary;
  document.getElementById("case_study_body").value = project.case_study_body || "";
  document.getElementById("category").value = project.category;
  document.getElementById("live_url").value = project.live_url || "";
  document.getElementById("repo_url").value = project.repo_url || "";
  document.getElementById("cover_image_path").value = project.cover_image_path;
  document.getElementById("sort_order").value = project.sort_order;
  document.getElementById("tags").value = project.tags.map(t => t.name).join(", ");
  document.getElementById("is_published").checked = !!project.is_published;
  document.getElementById("modal-title").textContent = "Edit Project";
  projectModal.show();
}

async function saveProject() {
  const id = document.getElementById("project-id").value;
  const payload = {
    title: document.getElementById("title").value,
    slug: document.getElementById("slug").value,
    summary: document.getElementById("summary").value,
    case_study_body: document.getElementById("case_study_body").value,
    category: document.getElementById("category").value,
    live_url: document.getElementById("live_url").value || null,
    repo_url: document.getElementById("repo_url").value || null,
    cover_image_path: document.getElementById("cover_image_path").value,
    sort_order: Number(document.getElementById("sort_order").value) || 0,
    tags: document.getElementById("tags").value.split(",").map(t => t.trim()).filter(Boolean),
    is_published: document.getElementById("is_published").checked,
  };

  try {
    if (id) {
      await api.put(`/api/v1/admin/projects/${id}`, payload);
    } else {
      await api.post("/api/v1/admin/projects", payload);
    }
  } catch (err) {
    alert(err.message);
    return;
  }
  projectModal.hide();
  await loadProjects();
}

async function deleteProject(id) {
  if (!confirm("Delete this project? This cannot be undone.")) return;
  try {
    await api.delete(`/api/v1/admin/projects/${id}`);
  } catch (err) {
    alert(err.message);
    return;
  }
  await loadProjects();
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  projectModal = new bootstrap.Modal(document.getElementById("project-modal"));
  document.getElementById("new-project-btn").addEventListener("click", openNewModal);
  document.getElementById("save-project-btn").addEventListener("click", saveProject);

  await loadProjects();
})();
