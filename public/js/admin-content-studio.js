// Content Studio: review, correct, and download what the Content agent
// ("Canvas") generated. Each item is one row in content_studio_items; the copy
// fields are editable inline (PATCH), images are downloadable, and items can be
// deleted. No publishing happens here — it's a review workbench.

let STUDIO_ITEMS = [];

const KIND_LABEL = { social: "Social post", flyer: "Flyer", blog: "Blog draft" };
const STATUSES = ["draft", "approved", "used"];

// Which editable text fields each kind shows, in render order.
// { field: column name sent to the API, label, type: 'input'|'textarea', rows }
const KIND_FIELDS = {
  social: [
    { field: "body", label: "Caption", type: "textarea", rows: 5 },
    { field: "excerpt", label: "Short variant (optional)", type: "textarea", rows: 2 },
    { field: "hashtags", label: "Hashtags", type: "input" },
  ],
  blog: [
    { field: "title", label: "Title", type: "input" },
    { field: "excerpt", label: "Excerpt", type: "textarea", rows: 2 },
    { field: "body", label: "Body", type: "textarea", rows: 10 },
  ],
  flyer: [
    { field: "body", label: "Caption (optional — add one to pair with this flyer)", type: "textarea", rows: 3 },
  ],
};

function studioMsg(text, ok) {
  const el = document.getElementById("studio-msg");
  el.className = "alert py-2 small " + (ok ? "alert-success" : "alert-danger");
  el.textContent = text;
  el.classList.remove("d-none");
  setTimeout(() => el.classList.add("d-none"), 3000);
}

function downloadName(url) {
  try {
    const clean = String(url).split("?")[0];
    return clean.substring(clean.lastIndexOf("/") + 1) || "flyer.png";
  } catch (_) {
    return "flyer.png";
  }
}

function buildCard(item) {
  const card = document.createElement("div");
  card.className = "admin-card p-4 studio-item";
  card.dataset.id = item.id;

  // --- media column ---
  const media = document.createElement("div");
  media.className = "studio-media";
  if (item.image_url) {
    const a = document.createElement("a");
    a.href = item.image_url;
    a.target = "_blank";
    a.rel = "noopener";
    const img = document.createElement("img");
    img.src = item.image_url;
    img.alt = item.title || "Generated image";
    img.loading = "lazy";
    a.appendChild(img);
    media.appendChild(a);
    const dl = document.createElement("a");
    dl.className = "btn btn-sm btn-outline-secondary w-100 mt-2";
    dl.href = item.image_url;
    dl.setAttribute("download", downloadName(item.image_url));
    dl.innerHTML = '<i class="bi bi-download me-1"></i>Download';
    media.appendChild(dl);
    if (item.image_size) {
      const sz = document.createElement("div");
      sz.className = "small text-muted-custom text-center mt-1";
      sz.textContent = item.image_size;
      media.appendChild(sz);
    }
  } else {
    const none = document.createElement("div");
    none.className = "no-image";
    none.textContent = "No image";
    media.appendChild(none);
  }

  // --- fields column ---
  const fields = document.createElement("div");
  fields.className = "studio-fields";

  const head = document.createElement("div");
  head.className = "d-flex justify-content-between align-items-center mb-2";
  const kind = document.createElement("span");
  kind.className = "studio-kind text-muted-custom";
  kind.textContent = KIND_LABEL[item.kind] || item.kind;
  const when = document.createElement("span");
  when.className = "small text-muted-custom";
  when.textContent = item.created_at ? new Date(item.created_at + "Z").toLocaleString() : "";
  head.appendChild(kind);
  head.appendChild(when);
  fields.appendChild(head);

  const inputs = {};
  const defs = (KIND_FIELDS[item.kind] || KIND_FIELDS.social);
  defs.forEach((def) => {
    const wrap = document.createElement("div");
    wrap.className = "mb-2";
    const label = document.createElement("label");
    label.className = "form-label small mb-1";
    label.textContent = def.label;
    let input;
    if (def.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = def.rows || 3;
    } else {
      input = document.createElement("input");
      input.type = "text";
    }
    input.className = "form-control form-control-sm";
    input.value = item[def.field] == null ? "" : item[def.field];
    wrap.appendChild(label);
    wrap.appendChild(input);
    fields.appendChild(wrap);
    inputs[def.field] = input;
  });

  // Notes — available on every kind.
  const notesWrap = document.createElement("div");
  notesWrap.className = "mb-2";
  const notesLabel = document.createElement("label");
  notesLabel.className = "form-label small mb-1";
  notesLabel.textContent = "Notes / corrections";
  const notes = document.createElement("textarea");
  notes.className = "form-control form-control-sm";
  notes.rows = 2;
  notes.value = item.notes == null ? "" : item.notes;
  notesWrap.appendChild(notesLabel);
  notesWrap.appendChild(notes);
  fields.appendChild(notesWrap);
  inputs.notes = notes;

  // Footer: status + save + delete
  const footer = document.createElement("div");
  footer.className = "d-flex align-items-center gap-2 mt-2 flex-wrap";
  const status = document.createElement("select");
  status.className = "form-select form-select-sm";
  status.style.width = "auto";
  STATUSES.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    if (s === item.status) opt.selected = true;
    status.appendChild(opt);
  });
  footer.appendChild(status);

  const save = document.createElement("button");
  save.type = "button";
  save.className = "btn btn-brand btn-sm";
  save.innerHTML = '<i class="bi bi-check2 me-1"></i>Save';
  footer.appendChild(save);

  // Push the reviewed item into the real pipeline: blog -> unpublished blog
  // post, everything else -> a social draft. Saves current edits first so the
  // corrected copy is what goes downstream.
  const send = document.createElement("button");
  send.type = "button";
  send.className = "btn btn-outline-primary btn-sm";
  const isBlog = item.kind === "blog";
  send.innerHTML = isBlog
    ? '<i class="bi bi-journal-arrow-up me-1"></i>Send to Blog'
    : '<i class="bi bi-megaphone me-1"></i>Send to Social Drafts';
  footer.appendChild(send);

  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn btn-outline-danger btn-sm ms-auto";
  del.innerHTML = '<i class="bi bi-trash me-1"></i>Delete';
  footer.appendChild(del);

  fields.appendChild(footer);

  save.addEventListener("click", async () => {
    const payload = { status: status.value };
    Object.keys(inputs).forEach((f) => { payload[f] = inputs[f].value.trim(); });
    save.disabled = true;
    try {
      const updated = await api.patch("/api/v1/admin/content-studio/" + item.id, payload);
      Object.assign(item, updated);
      studioMsg("Saved.", true);
    } catch (err) {
      studioMsg(err.message, false);
    }
    save.disabled = false;
  });

  send.addEventListener("click", async () => {
    send.disabled = true;
    save.disabled = true;
    try {
      // Save current edits first so the corrected copy is what gets promoted.
      const payload = { status: status.value };
      Object.keys(inputs).forEach((f) => { payload[f] = inputs[f].value.trim(); });
      await api.patch("/api/v1/admin/content-studio/" + item.id, payload);

      const res = await api.post("/api/v1/admin/content-studio/" + item.id + "/promote", {});
      item.status = "used";
      status.value = "used";
      const where = res.target === "blog"
        ? "the Blog as an unpublished draft"
        : "Social Drafts";
      studioMsg("Sent to " + where + ". It's marked ‘used’ here.", true);
    } catch (err) {
      studioMsg(err.message, false);
    }
    send.disabled = false;
    save.disabled = false;
  });

  del.addEventListener("click", async () => {
    if (!confirm("Delete this item? This can't be undone.")) return;
    del.disabled = true;
    try {
      await api.delete("/api/v1/admin/content-studio/" + item.id);
      STUDIO_ITEMS = STUDIO_ITEMS.filter((i) => i.id !== item.id);
      render();
    } catch (err) {
      studioMsg(err.message, false);
      del.disabled = false;
    }
  });

  card.appendChild(media);
  card.appendChild(fields);
  return card;
}

function render() {
  const filter = document.getElementById("studio-filter").value;
  const list = document.getElementById("studio-list");
  const empty = document.getElementById("studio-empty");
  list.innerHTML = "";

  const items = filter === "all" ? STUDIO_ITEMS : STUDIO_ITEMS.filter((i) => i.kind === filter);
  empty.classList.toggle("d-none", STUDIO_ITEMS.length > 0);
  if (STUDIO_ITEMS.length && !items.length) {
    const none = document.createElement("div");
    none.className = "text-muted-custom";
    none.textContent = "No " + filter + " items.";
    list.appendChild(none);
    return;
  }
  items.forEach((item) => list.appendChild(buildCard(item)));
}

async function loadItems() {
  try {
    STUDIO_ITEMS = await api.get("/api/v1/admin/content-studio");
  } catch (err) {
    studioMsg(err.message, false);
    STUDIO_ITEMS = [];
  }
  render();
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();
  document.getElementById("studio-filter").addEventListener("change", render);
  await loadItems();
})();
