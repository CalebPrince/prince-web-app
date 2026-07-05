const CONTENT_FIELDS = [
  "availability_badge", "hero_eyebrow", "hero_title", "hero_subtitle", "tech_badges",
  "service_1_title", "service_1_summary", "service_1_desc",
  "service_2_title", "service_2_summary", "service_2_desc",
  "service_3_title", "service_3_summary", "service_3_desc",
  "about_intro", "about_bio", "contact_intro",
  "social_github", "social_linkedin", "social_twitter", "social_whatsapp", "social_email",
  "chat_greeting", "chat_intro", "chat_offline_message", "chat_persona",
];

function showContentMsg(text, ok) {
  const el = document.getElementById("content-msg");
  el.className = `alert py-2 small ${ok ? "alert-success" : "alert-danger"}`;
  el.textContent = text;
  el.scrollIntoView({ block: "nearest" });
}

async function loadContent() {
  const settings = await api.get("/api/v1/admin/settings");
  CONTENT_FIELDS.forEach(key => {
    const el = document.getElementById(key);
    if (el) el.value = settings[key] || "";
  });
}

async function saveContent(e) {
  e.preventDefault();
  const payload = {};
  CONTENT_FIELDS.forEach(key => {
    const el = document.getElementById(key);
    if (el) payload[key] = el.value.trim();
  });

  const btn = document.getElementById("save-all-btn");
  btn.disabled = true;
  try {
    await api.put("/api/v1/admin/settings", payload);
    showContentMsg("Saved — the public site reflects your changes immediately.", true);
  } catch (err) {
    showContentMsg(err.message, false);
  }
  btn.disabled = false;
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById("content-form").addEventListener("submit", saveContent);
  await loadContent();
})();
