const CONTENT_FIELDS = [
  "default_theme",
  "splash_screen_enabled",
  "animation_style",
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
  "chat_assistant_name",
  "chat_greeting", "chat_intro", "chat_offline_message", "chat_persona",
  "chat_voice_gender", "chat_voice_accent", "chat_voice_rate", "chat_voice_pitch",
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
  "live_demo_video_url",
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
    // Fall back to the element's own default (matters for the voice <select>
    // and range inputs, whose HTML defaults are the intended starting values)
    // when a setting hasn't been saved yet.
    if (el) el.value = settings[key] || el.value || "";
  });

  // Live Chat availability (schedule) — not simple value fields, so handled
  // separately from CONTENT_FIELDS. These are admin-only Settings keys, saved
  // through the same /admin/settings endpoint as the rest of this form.
  document.getElementById("hours-enabled").checked = !!settings.chat_hours_enabled;
  const hoursDays = (settings.chat_hours_days || "").split(",").map(d => d.trim()).filter(Boolean);
  document.querySelectorAll(".hours-day").forEach(el => { el.checked = hoursDays.includes(el.value); });
  document.getElementById("hours-start").value = settings.chat_hours_start || "";
  document.getElementById("hours-end").value = settings.chat_hours_end || "";
  document.getElementById("hours-timezone").value = settings.chat_timezone || "";

  await renderChatLiveStatus(settings);
}

// Show whether Live Chat is online *right now* and, when it's not, the actual
// reason — the #1 gotcha is that the chat stays offline until an AI provider
// key is set, regardless of the schedule. The authoritative online flag comes
// from the public /chat/status endpoint; the settings we already loaded tell us
// why it's off (no key vs. outside scheduled hours).
async function renderChatLiveStatus(settings) {
  const el = document.getElementById("chat-live-status");
  if (!el) return;
  const hasKey = !!(settings.gemini_api_key || settings.openrouter_api_key || settings.groq_api_key);

  let online = false;
  try { online = !!(await api.get("/api/v1/chat/status")).online; } catch (_) { /* treat as offline */ }

  el.classList.remove("d-none", "alert-success", "alert-warning");
  if (online) {
    el.classList.add("alert-success");
    el.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i>Live Chat is <strong>online</strong> right now — visitors can chat.';
    return;
  }

  let reason;
  if (!hasKey) {
    reason = 'no AI provider key is set — add a Gemini, OpenRouter, or Groq key under <a href="/admin/settings.html">Settings → API keys</a>.';
  } else if (settings.chat_hours_enabled) {
    reason = "the current day/time is outside the scheduled hours set below.";
  } else {
    reason = "the assistant is currently unavailable.";
  }
  el.classList.add("alert-warning");
  el.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-1"></i>Live Chat is <strong>offline</strong> right now — ' + reason;
}

async function saveContent(e) {
  e.preventDefault();
  const payload = {};
  CONTENT_FIELDS.forEach(key => {
    const el = document.getElementById(key);
    if (el) payload[key] = el.value.trim();
  });

  // Live Chat availability (schedule) — folded into the same save.
  payload.chat_hours_enabled = document.getElementById("hours-enabled").checked ? "1" : "";
  payload.chat_hours_days = [...document.querySelectorAll(".hours-day:checked")].map(el => el.value).join(",");
  payload.chat_hours_start = document.getElementById("hours-start").value;
  payload.chat_hours_end = document.getElementById("hours-end").value;
  payload.chat_timezone = document.getElementById("hours-timezone").value.trim();

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

// ---- read-aloud voice preview ---------------------------------------------
// Mirrors the matching logic in ai-widget.js so the admin hears exactly what a
// visitor's browser would pick for the current gender + accent selection.
const V_FEMALE_RE = /(female|zira|susan|hazel|linda|samantha|karen|moira|tessa|fiona|serena|catherine|aria|jenny|sonia|libby|amy|joanna|salli|kimberly|google uk english female)/i;
const V_MALE_RE = /(\bmale\b|david|mark|george|guy|ryan|thomas|daniel|alex|fred|oliver|james|brian|matthew|arthur|google uk english male)/i;

function pickPreviewVoice(voices, gender, accent) {
  if (!voices.length) return null;
  const acc = accent && accent !== "auto" ? accent.toLowerCase() : null;
  const wantRe = gender === "male" ? V_MALE_RE : gender === "female" ? V_FEMALE_RE : null;
  const notRe = gender === "male" ? V_FEMALE_RE : gender === "female" ? V_MALE_RE : null;
  const en = voices.filter((v) => /^en/i.test(v.lang));
  const byAccent = acc ? en.filter((v) => v.lang.toLowerCase().startsWith(acc)) : en;
  const tiers = [];
  if (wantRe) {
    tiers.push(byAccent.filter((v) => wantRe.test(v.name) && !notRe.test(v.name)));
    tiers.push(byAccent.filter((v) => wantRe.test(v.name)));
    tiers.push(en.filter((v) => wantRe.test(v.name) && !notRe.test(v.name)));
    tiers.push(en.filter((v) => wantRe.test(v.name)));
  }
  tiers.push(byAccent, en, voices);
  for (const tier of tiers) if (tier && tier.length) return tier[0];
  return null;
}

function wireVoiceControls() {
  const rate = document.getElementById("chat_voice_rate");
  const pitch = document.getElementById("chat_voice_pitch");
  const rateOut = document.getElementById("chat_voice_rate_out");
  const pitchOut = document.getElementById("chat_voice_pitch_out");
  const sync = () => {
    if (rateOut) rateOut.textContent = Number(rate.value).toFixed(2).replace(/0$/, "") + "×";
    if (pitchOut) pitchOut.textContent = Number(pitch.value).toFixed(2).replace(/0$/, "");
  };
  rate && rate.addEventListener("input", sync);
  pitch && pitch.addEventListener("input", sync);
  sync();

  if ("speechSynthesis" in window) window.speechSynthesis.getVoices();

  const btn = document.getElementById("chat_voice_preview");
  const note = document.getElementById("chat_voice_preview_note");
  btn && btn.addEventListener("click", () => {
    if (!("speechSynthesis" in window)) {
      if (note) note.textContent = "This browser can't preview speech.";
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const gender = document.getElementById("chat_voice_gender").value;
    const accent = document.getElementById("chat_voice_accent").value;
    const nameEl = document.getElementById("chat_assistant_name");
    const assistantName = (nameEl && nameEl.value.trim()) || "Lisa";
    const u = new SpeechSynthesisUtterance(
      `Hi, I'm ${assistantName}, Prince Caleb's virtual assistant. This is how I'll sound to your visitors.`
    );
    u.rate = Math.min(2, Math.max(0.5, Number(rate.value) || 1));
    u.pitch = Math.min(2, Math.max(0, Number(pitch.value) || 1));
    const voice = pickPreviewVoice(synth.getVoices(), gender, accent);
    if (voice) { u.voice = voice; if (voice.lang) u.lang = voice.lang; }
    if (note) note.textContent = voice ? `Using: ${voice.name}` : "Using this device's default voice.";
    synth.speak(u);
  });
}

// Grey out the day/time controls when the "Restrict to specific hours" master
// toggle is off — otherwise it looks like unticking a day takes the chat
// offline, when in fact the day/time settings only apply once restriction is on.
function syncHoursEnabledState() {
  const enabled = document.getElementById("hours-enabled").checked;
  document.querySelectorAll(".hours-day, #hours-start, #hours-end, #hours-timezone")
    .forEach(el => { el.disabled = !enabled; });
  const note = document.getElementById("hours-disabled-note");
  if (note) note.classList.toggle("d-none", enabled);
}

function wireHoursControls() {
  const toggle = document.getElementById("hours-enabled");
  if (toggle) toggle.addEventListener("change", syncHoursEnabledState);
  syncHoursEnabledState();
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById("content-form").addEventListener("submit", saveContent);
  await loadContent();
  wireVoiceControls();
  wireHoursControls();
})();
