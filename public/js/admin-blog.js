let postModal = null;
let allPosts = [];
let slugEditedManually = false;

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function updateSlugFromTitle(force = false) {
  const title = document.getElementById("title");
  const slug = document.getElementById("slug");
  if (!title || !slug) return;
  if (!force && slugEditedManually) return;
  slug.value = slugify(title.value);
}

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

function renderPostsTable(posts) {
  const tbody = document.getElementById("posts-tbody");
  if (posts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted-custom py-4">No posts yet.</td></tr>';
    return;
  }

  tbody.innerHTML = posts.map(p => `
    <tr>
      <td class="ps-3">${escapeHtml(p.title)}</td>
      <td>${escapeHtml(p.category || "—")}</td>
      <td><span class="status-pill ${p.is_published ? "published" : "draft"}">${p.is_published ? "Published" : "Draft"}</span></td>
      <td class="text-end pe-3">
        <button class="btn btn-sm btn-outline-secondary edit-btn" data-id="${p.id}">Edit</button>
        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${p.id}">Delete</button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditModal(allPosts.find(p => p.id === Number(btn.dataset.id))));
  });
  tbody.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", () => deletePost(Number(btn.dataset.id)));
  });
}

function renderCurrentPage() {
  AdminPagination.page('posts', allPosts, renderPostsTable, { anchor: document.getElementById('pagination') });
}

async function loadPosts() {
  const response = await api.get("/api/v1/admin/blog");
  allPosts = Array.isArray(response) ? response : [];
  renderCurrentPage();
}

function openNewModal() {
  document.getElementById("post-form").reset();
  document.getElementById("post-id").value = "";
  slugEditedManually = false;
  document.getElementById("modal-title").textContent = "New Post";
  document.getElementById("cover-upload-msg").textContent = "";
  setCoverPreview(null);
  postModal.show();
}

function openEditModal(post) {
  slugEditedManually = true;
  document.getElementById("post-id").value = post.id;
  document.getElementById("title").value = post.title;
  document.getElementById("category").value = post.category || "";
  document.getElementById("slug").value = post.slug;
  document.getElementById("excerpt").value = post.excerpt;
  document.getElementById("body").value = post.body;
  document.getElementById("cover_image_path").value = post.cover_image_path;
  document.getElementById("sort_order").value = post.sort_order;
  document.getElementById("is_published").checked = !!post.is_published;
  document.getElementById("cover-upload-msg").textContent = "";
  setCoverPreview(post.cover_image_path);
  document.getElementById("modal-title").textContent = "Edit Post";
  postModal.show();
}

async function savePost() {
  const id = document.getElementById("post-id").value;
  const payload = {
    title: document.getElementById("title").value,
    category: document.getElementById("category").value.trim(),
    slug: document.getElementById("slug").value.trim() || slugify(document.getElementById("title").value),
    excerpt: document.getElementById("excerpt").value,
    body: document.getElementById("body").value,
    cover_image_path: document.getElementById("cover_image_path").value,
    sort_order: Number(document.getElementById("sort_order").value) || 0,
    is_published: document.getElementById("is_published").checked,
  };

  try {
    if (id) {
      await api.put(`/api/v1/admin/blog/${id}`, payload);
    } else {
      await api.post("/api/v1/admin/blog", payload);
    }
  } catch (err) {
    alert(err.message);
    return;
  }
  postModal.hide();
  await loadPosts();
}

async function deletePost(id) {
  if (!confirm("Delete this post? This cannot be undone.")) return;
  try {
    await api.delete(`/api/v1/admin/blog/${id}`);
  } catch (err) {
    alert(err.message);
    return;
  }
  await loadPosts();
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  postModal = new bootstrap.Modal(document.getElementById("post-modal"));
  document.getElementById("new-post-btn").addEventListener("click", openNewModal);
  document.getElementById("save-post-btn").addEventListener("click", savePost);
  document.getElementById("title").addEventListener("input", () => updateSlugFromTitle());
  document.getElementById("slug").addEventListener("input", () => {
    slugEditedManually = true;
    const slug = document.getElementById("slug");
    const cleaned = slugify(slug.value);
    if (slug.value !== cleaned) slug.value = cleaned;
  });

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

  await loadPosts();
})();
