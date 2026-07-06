const CONTENT_FIELDS = [
  "default_theme",
  "availability_badge", "hero_eyebrow", "hero_title", "hero_subtitle", "tech_badges",
  "service_1_title", "service_1_summary", "service_1_desc",
  "service_2_title", "service_2_summary", "service_2_desc",
  "service_3_title", "service_3_summary", "service_3_desc",
  "about_intro", "about_bio", "contact_intro", "contact_location", "contact_phone",
  "social_github", "social_linkedin", "social_twitter", "social_whatsapp", "social_email",
  "github_username",
  "timeline_1_label", "timeline_1_title", "timeline_1_desc",
  "timeline_2_label", "timeline_2_title", "timeline_2_desc",
  "timeline_3_label", "timeline_3_title", "timeline_3_desc",
  "timeline_4_label", "timeline_4_title", "timeline_4_desc",
  "timeline_5_label", "timeline_5_title", "timeline_5_desc",
  "chat_greeting", "chat_intro", "chat_offline_message", "chat_persona",
  "stat_1_value", "stat_1_suffix", "stat_1_label",
  "stat_2_value", "stat_2_suffix", "stat_2_label",
  "stat_3_value", "stat_3_suffix", "stat_3_label",
  "stat_4_value", "stat_4_prefix", "stat_4_suffix", "stat_4_label",
  "testimonial_1_quote", "testimonial_1_name", "testimonial_1_role",
  "testimonial_2_quote", "testimonial_2_name", "testimonial_2_role",
  "testimonial_3_quote", "testimonial_3_name", "testimonial_3_role",
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
