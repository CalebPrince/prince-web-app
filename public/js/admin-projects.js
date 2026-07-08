let projectModal = null;
let galleryPaths = [];
let currentProjects = [];
let draggedId = null;
let approvedTestimonials = [];

async function uploadFile(file, isRetry = false) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/v1/admin/uploads", {
    method: "POST",
    credentials: "same-origin",
    body: formData,
  });

  if (res.status === 401 && !isRetry) {
    const refreshed = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" });
    if (refreshed.ok) return uploadFile(file, true);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body && body.error) || "Upload failed.");
  }
  return body.path;
}

function setCoverPreview(path) {
  const preview = document.getElementById("cover-preview");
  if (path) {
    preview.src = path;
    preview.classList.remove("d-none");
  } else {
    preview.classList.add("d-none");
  }
}

function renderGalleryList() {
  const list = document.getElementById("gallery-list");
  list.innerHTML = galleryPaths.map((path, i) => `
    <div class="position-relative">
      <img src="${path}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--line);">
      <button type="button" class="btn-close gallery-remove-btn" data-index="${i}"
        style="position:absolute;top:-6px;right:-6px;width:16px;height:16px;padding:4px;background-color:#fff;border-radius:50%;opacity:1;"></button>
    </div>
  `).join("");
  list.querySelectorAll(".gallery-remove-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      galleryPaths.splice(Number(btn.dataset.index), 1);
      renderGalleryList();
    });
  });
}

function renderProjectsTable(projects) {
  currentProjects = projects;
  const tbody = document.getElementById("projects-tbody");
  if (projects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted-custom py-4">No projects yet.</td></tr>';
    return;
  }

  tbody.innerHTML = projects.map(p => `
    <tr draggable="true" data-id="${p.id}">
      <td class="ps-3 text-muted-custom" style="cursor:grab;" title="Drag to reorder">&#x2630;</td>
      <td>${p.title}</td>
      <td class="text-capitalize">${p.category.replace("_", " ")}</td>
      <td>${p.tags.map(t => t.name).join(", ")}</td>
      <td>
        <span class="status-pill ${p.is_published ? "published" : "draft"}">${p.is_published ? "Published" : "Draft"}</span>
        ${p.is_featured ? '<span class="status-pill published ms-1">&#9733; Featured</span>' : ""}
      </td>
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

  tbody.querySelectorAll("tr[draggable]").forEach(row => {
    row.addEventListener("dragstart", () => {
      draggedId = Number(row.dataset.id);
      row.classList.add("opacity-50");
    });
    row.addEventListener("dragend", () => row.classList.remove("opacity-50"));
    row.addEventListener("dragover", (e) => e.preventDefault());
    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      const targetId = Number(row.dataset.id);
      if (draggedId === null || draggedId === targetId) return;

      const ids = currentProjects.map(p => p.id);
      const fromIndex = ids.indexOf(draggedId);
      const toIndex = ids.indexOf(targetId);
      ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, draggedId);

      renderProjectsTable(ids.map(id => currentProjects.find(p => p.id === id)));
      try {
        await api.patch("/api/v1/admin/projects/reorder", { order: ids });
      } catch (err) {
        alert(err.message);
        await loadProjects();
      }
    });
  });
}

async function loadProjects() {
  const response = await api.get("/api/v1/admin/projects");
  const projects = Array.isArray(response) ? response : [];
  renderProjectsTable(projects);
}

async function loadTestimonialOptions() {
  const response = await api.get("/api/v1/admin/testimonials");
  approvedTestimonials = (Array.isArray(response) ? response : []).filter(t => t.status === "approved");
  const select = document.getElementById("testimonial_id");
  select.innerHTML = '<option value="">None</option>' + approvedTestimonials.map(t =>
    `<option value="${t.id}">${escapeHtml(t.client_name)} — "${escapeHtml(t.quote.slice(0, 60))}${t.quote.length > 60 ? "…" : ""}"</option>`
  ).join("");
}

function openNewModal() {
  document.getElementById("project-form").reset();
  document.getElementById("project-id").value = "";
  document.getElementById("modal-title").textContent = "New Project";
  document.getElementById("cover-upload-msg").textContent = "";
  document.getElementById("gallery-upload-msg").textContent = "";
  document.getElementById("outcome_metrics").value = "";
  document.getElementById("testimonial_id").value = "";
  document.getElementById("is_featured").checked = false;
  setCoverPreview(null);
  galleryPaths = [];
  renderGalleryList();
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
  document.getElementById("is_embeddable").checked = !!project.is_embeddable;
  document.getElementById("is_featured").checked = !!project.is_featured;
  document.getElementById("outcome_metrics").value = project.outcome_metrics || "";
  document.getElementById("testimonial_id").value = project.testimonial_id || "";
  document.getElementById("cover-upload-msg").textContent = "";
  document.getElementById("gallery-upload-msg").textContent = "";
  setCoverPreview(project.cover_image_path);
  galleryPaths = [...(project.gallery || [])];
  renderGalleryList();
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
    gallery: galleryPaths,
    sort_order: Number(document.getElementById("sort_order").value) || 0,
    tags: document.getElementById("tags").value.split(",").map(t => t.trim()).filter(Boolean),
    is_published: document.getElementById("is_published").checked,
    is_embeddable: document.getElementById("is_embeddable").checked,
    is_featured: document.getElementById("is_featured").checked,
    outcome_metrics: document.getElementById("outcome_metrics").value || null,
    testimonial_id: document.getElementById("testimonial_id").value || null,
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

  document.getElementById("cover-upload-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const msg = document.getElementById("cover-upload-msg");
    msg.textContent = "Uploading…";
    try {
      const path = await uploadFile(file);
      document.getElementById("cover_image_path").value = path;
      setCoverPreview(path);
      msg.textContent = "Uploaded.";
    } catch (err) {
      msg.textContent = err.message;
    }
    e.target.value = "";
  });

  document.getElementById("gallery-upload-input").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    const msg = document.getElementById("gallery-upload-msg");
    msg.textContent = `Uploading ${files.length} image(s)…`;
    for (const file of files) {
      try {
        galleryPaths.push(await uploadFile(file));
      } catch (err) {
        msg.textContent = err.message;
        renderGalleryList();
        e.target.value = "";
        return;
      }
    }
    msg.textContent = "";
    renderGalleryList();
    e.target.value = "";
  });

  await Promise.all([loadProjects(), loadTestimonialOptions()]);
})();
