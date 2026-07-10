const CONTENT_FIELDS = [
  "default_theme",
  "availability_badge", "hero_eyebrow", "hero_title", "hero_subtitle", "hero_video_url", "tech_badges",
  "hero_value_eyebrow",
  "hero_value_1_label", "hero_value_1_text",
  "hero_value_2_label", "hero_value_2_text",
  "hero_value_3_label", "hero_value_3_text",
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
  "pricing_tier_1_name", "pricing_tier_1_price", "pricing_tier_1_tagline", "pricing_tier_1_features",
  "pricing_tier_2_name", "pricing_tier_2_price", "pricing_tier_2_tagline", "pricing_tier_2_features",
  "pricing_tier_3_name", "pricing_tier_3_price", "pricing_tier_3_tagline", "pricing_tier_3_features",
  "home_pricing_eyebrow", "home_pricing_title", "home_pricing_note",
  "archive_eyebrow", "archive_title",
  "archive_1_domain", "archive_1_meta", "archive_1_title", "archive_1_desc", "archive_1_link", "archive_1_metric", "archive_1_metric_label",
  "archive_2_domain", "archive_2_meta", "archive_2_title", "archive_2_desc", "archive_2_link", "archive_2_metric", "archive_2_metric_label",
  "archive_3_domain", "archive_3_meta", "archive_3_title", "archive_3_desc", "archive_3_link", "archive_3_metric", "archive_3_metric_label",
  "production_eyebrow", "production_title",
  "live_demo_eyebrow", "live_demo_title", "live_demo_desc", "live_demo_metric_label", "live_demo_metric_text", "live_demo_console_label",
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
