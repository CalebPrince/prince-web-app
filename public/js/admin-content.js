const CONTENT_FIELDS = [
  "availability_badge", "hero_eyebrow", "hero_title", "hero_subtitle", "hero_atmosphere_intensity", "hero_motion_strength", "tech_badges",
  "quarterly_project_status", "quarterly_project_slots", "quarterly_next_open_date",
  "hero_value_eyebrow",
  "hero_value_1_label", "hero_value_1_text",
  "hero_value_2_label", "hero_value_2_text",
  "hero_value_3_label", "hero_value_3_text",
  "faq_eyebrow", "faq_title", "faq_count",
  "service_1_title", "service_1_summary", "service_1_desc",
  "service_2_title", "service_2_summary", "service_2_desc",
  "service_3_title", "service_3_summary", "service_3_desc",
  "about_intro", "about_bio", "contact_intro", "contact_location", "contact_phone", "ai_voice_public_number",
  "social_github", "social_linkedin", "social_twitter", "social_whatsapp", "social_upwork", "social_fiverr", "social_email",
  "github_username",
  "timeline_1_label", "timeline_1_title", "timeline_1_desc",
  "timeline_2_label", "timeline_2_title", "timeline_2_desc",
  "timeline_3_label", "timeline_3_title", "timeline_3_desc",
  "timeline_4_label", "timeline_4_title", "timeline_4_desc",
  "timeline_5_label", "timeline_5_title", "timeline_5_desc",
  "chat_assistant_name",
  "chat_greeting", "chat_intro", "chat_offline_message", "chat_persona",
  "chat_voice_gender", "chat_voice_accent", "chat_voice_rate", "chat_voice_pitch",
  "beacon_assistant_name", "beacon_voice_gender", "beacon_voice_accent",
  "dossier_assistant_name", "dossier_voice_gender", "dossier_voice_accent",
  "nurturer_assistant_name", "nurturer_voice_gender", "nurturer_voice_accent",
  "proposal_assistant_name", "proposal_voice_gender", "proposal_voice_accent",
  "sketch_assistant_name", "sketch_voice_gender", "sketch_voice_accent",
  "content_assistant_name", "content_voice_gender", "content_voice_accent",
  "arch_assistant_name", "arch_voice_gender", "arch_voice_accent",
  "ada_assistant_name", "ada_voice_gender", "ada_voice_accent",
  "chief_assistant_name", "chief_voice_gender", "chief_voice_accent",
  "scout_assistant_name", "scout_voice_gender", "scout_voice_accent",
  "sage_assistant_name", "sage_voice_gender", "sage_voice_accent",
  "reel_assistant_name", "reel_voice_gender", "reel_voice_accent",
  "brand_primary_color", "brand_accent_color", "brand_font", "brand_style_note",
  "brand_logo_dark_url", "brand_logo_white_url",
  "stat_1_value", "stat_1_suffix", "stat_1_label",
  "stat_2_value", "stat_2_suffix", "stat_2_label",
  "stat_3_value", "stat_3_suffix", "stat_3_label",
  "stat_4_value", "stat_4_prefix", "stat_4_suffix", "stat_4_label", "google_review_count",
  "testimonial_1_quote", "testimonial_1_name", "testimonial_1_role",
  "testimonial_2_quote", "testimonial_2_name", "testimonial_2_role",
  "testimonial_3_quote", "testimonial_3_name", "testimonial_3_role",
  "pricing_tier_1_name", "pricing_tier_1_price", "pricing_tier_1_tagline", "pricing_tier_1_features",
  "pricing_tier_2_name", "pricing_tier_2_price", "pricing_tier_2_tagline", "pricing_tier_2_features",
  "pricing_tier_3_name", "pricing_tier_3_price", "pricing_tier_3_tagline", "pricing_tier_3_features",
  "pricing_tier_4_name", "pricing_tier_4_price", "pricing_tier_4_tagline", "pricing_tier_4_features",
  "home_pricing_eyebrow", "home_pricing_title", "home_pricing_note",
  "archive_eyebrow", "archive_title",
  "archive_1_domain", "archive_1_meta", "archive_1_title", "archive_1_desc", "archive_1_link", "archive_1_metric", "archive_1_metric_label",
  "archive_2_domain", "archive_2_meta", "archive_2_title", "archive_2_desc", "archive_2_link", "archive_2_metric", "archive_2_metric_label",
  "archive_3_domain", "archive_3_meta", "archive_3_title", "archive_3_desc", "archive_3_link", "archive_3_metric", "archive_3_metric_label",
  "production_eyebrow", "production_title",
  "live_demo_eyebrow", "live_demo_title", "live_demo_desc", "live_demo_metric_label", "live_demo_metric_text", "live_demo_console_label",
  "live_demo_video_url",
];

const FAQ_MAX_ITEMS = 12;
for (let i = 1; i <= FAQ_MAX_ITEMS; i += 1) {
  CONTENT_FIELDS.push(`faq_${i}_question`, `faq_${i}_answer`);
}

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

  const faqCountInput = document.getElementById("faq_count");
  if (faqCountInput && !settings.faq_count) {
    let inferredCount = 4;
    for (let i = FAQ_MAX_ITEMS; i >= 1; i -= 1) {
      if ((settings[`faq_${i}_question`] || "").trim() || (settings[`faq_${i}_answer`] || "").trim()) {
        inferredCount = i;
        break;
      }
    }
    faqCountInput.value = String(Math.max(1, inferredCount));
  }
  syncFaqRowsVisibility();

  // Brand logo previews — fall back to the committed defaults (same paths
  // SharedAgentTools::getBrandInfo() falls back to server-side) so the admin
  // sees the real logo even before ever saving anything on this page.
  setBrandLogoPreview("dark", settings.brand_logo_dark_url || "/uploads/brand/logo-dark.png");
  setBrandLogoPreview("white", settings.brand_logo_white_url || "/uploads/brand/logo-white.png");
}

function buildFaqEditorRows() {
  const container = document.getElementById("faq-items-editor");
  if (!container || container.dataset.ready === "1") return;

  const defaults = {
    1: {
      q: "How quickly can we launch the first useful version?",
      a: "Most projects start with one focused workflow and ship in 2 to 6 weeks depending on integrations, approvals, and how much existing process cleanup is needed.",
    },
    2: {
      q: "Do you only build AI agents, or full systems too?",
      a: "Both. I build voice and chat agents, automation pipelines, and the custom websites, dashboards, and portals those workflows need to run reliably.",
    },
    3: {
      q: "Can this integrate with our current tools?",
      a: "Yes. Typical integrations include calendars, CRMs, WhatsApp, email, payment tools, and internal reporting workflows. We map integration risk before implementation.",
    },
    4: {
      q: "What happens after launch?",
      a: "We review real usage, fix weak points, and iterate in small steps. The goal is measurable business outcomes, not shipping features and disappearing.",
    },
  };

  for (let i = 1; i <= FAQ_MAX_ITEMS; i += 1) {
    const row = document.createElement("div");
    row.className = "faq-editor-item border rounded-3 p-3";
    row.setAttribute("data-faq-row", String(i));

    const heading = document.createElement("h6");
    heading.className = "mb-2";
    heading.textContent = `Question ${i}`;
    row.appendChild(heading);

    const question = document.createElement("input");
    question.type = "text";
    question.className = "form-control form-control-sm mb-2";
    question.id = `faq_${i}_question`;
    question.placeholder = (defaults[i] && defaults[i].q) || "Question text";
    row.appendChild(question);

    const answer = document.createElement("textarea");
    answer.className = "form-control form-control-sm";
    answer.id = `faq_${i}_answer`;
    answer.rows = 2;
    answer.placeholder = (defaults[i] && defaults[i].a) || "Answer text";
    row.appendChild(answer);

    container.appendChild(row);
  }

  container.dataset.ready = "1";
}

function getFaqCount() {
  const input = document.getElementById("faq_count");
  const raw = parseInt(input && input.value, 10);
  const safe = Number.isFinite(raw) ? raw : 4;
  return Math.min(FAQ_MAX_ITEMS, Math.max(1, safe));
}

function setFaqCount(count) {
  const input = document.getElementById("faq_count");
  if (!input) return;
  const safe = Math.min(FAQ_MAX_ITEMS, Math.max(1, count));
  input.value = String(safe);
  syncFaqRowsVisibility();
}

function syncFaqRowsVisibility() {
  const count = getFaqCount();
  const countLabel = document.getElementById("faq-count-label");
  const addBtn = document.getElementById("faq-add-item");
  const removeBtn = document.getElementById("faq-remove-item");

  document.querySelectorAll("[data-faq-row]").forEach(row => {
    const index = parseInt(row.getAttribute("data-faq-row"), 10);
    row.classList.toggle("d-none", index > count);
  });

  if (countLabel) countLabel.textContent = `(${count} active)`;
  if (addBtn) addBtn.disabled = count >= FAQ_MAX_ITEMS;
  if (removeBtn) removeBtn.disabled = count <= 1;
}

function wireFaqEditor() {
  buildFaqEditorRows();

  const addBtn = document.getElementById("faq-add-item");
  const removeBtn = document.getElementById("faq-remove-item");
  const countInput = document.getElementById("faq_count");

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      setFaqCount(getFaqCount() + 1);
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      const count = getFaqCount();
      if (count <= 1) return;
      const q = document.getElementById(`faq_${count}_question`);
      const a = document.getElementById(`faq_${count}_answer`);
      if (q) q.value = "";
      if (a) a.value = "";
      setFaqCount(count - 1);
    });
  }

  if (countInput) {
    countInput.addEventListener("change", () => {
      setFaqCount(getFaqCount());
    });
  }

  syncFaqRowsVisibility();
}

function setBrandLogoPreview(variant, path) {
  const img = document.getElementById(`brand-logo-${variant}-preview`);
  if (!img) return;
  if (path) {
    img.src = path;
    img.classList.remove("d-none");
  } else {
    img.classList.add("d-none");
  }
}

// Mirrors uploadFile() in admin-blog.js — this page has no shared JS include
// for it, and every other admin page keeps its upload helper local too.
async function uploadBrandFile(file, isRetry = false) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/v1/admin/uploads", {
    method: "POST",
    credentials: "same-origin",
    body: formData,
  });
  if (res.status === 401 && !isRetry) {
    const refreshed = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" });
    if (refreshed.ok) return uploadBrandFile(file, true);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.error) || "Upload failed.");
  return body.path;
}

function wireBrandLogoUpload(variant) {
  const input = document.getElementById(`brand-logo-${variant}-upload-input`);
  const msg = document.getElementById(`brand-logo-${variant}-upload-msg`);
  const urlField = document.getElementById(`brand_logo_${variant}_url`);
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    msg.textContent = "Uploading...";
    try {
      const path = await uploadBrandFile(file);
      urlField.value = path;
      setBrandLogoPreview(variant, path);
      msg.textContent = "Uploaded — click Save changes to keep it.";
    } catch (err) {
      msg.textContent = err.message;
    }
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

// Beacon/Nurturer preview buttons — same idea as Lisa's above, minus rate/pitch
// (those two agents don't expose speaking speed/tone, only gender + accent).
function wireAgentVoicePreview(prefix, fallbackName, sampleLine) {
  const btn = document.getElementById(prefix + "_voice_preview");
  const note = document.getElementById(prefix + "_voice_preview_note");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!("speechSynthesis" in window)) {
      if (note) note.textContent = "This browser can't preview speech.";
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const gender = document.getElementById(prefix + "_voice_gender").value;
    const accent = document.getElementById(prefix + "_voice_accent").value;
    const nameEl = document.getElementById(prefix + "_assistant_name");
    const assistantName = (nameEl && nameEl.value.trim()) || fallbackName;
    const u = new SpeechSynthesisUtterance(`Hi, I'm ${assistantName}. ${sampleLine}`);
    const voice = pickPreviewVoice(synth.getVoices(), gender, accent);
    if (voice) { u.voice = voice; if (voice.lang) u.lang = voice.lang; }
    if (note) note.textContent = voice ? `Using: ${voice.name}` : "Using this device's default voice.";
    synth.speak(u);
  });
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById("content-form").addEventListener("submit", saveContent);
  wireFaqEditor();
  await loadContent();
  wireVoiceControls();
  wireAgentVoicePreview("beacon", "Joan", "This is how I'll sound when you talk to me in the admin console.");
  wireAgentVoicePreview("dossier", "Sharon", "This is how I'll sound when you talk to me in the admin console.");
  wireAgentVoicePreview("nurturer", "Jason", "This is how I'll sound when you talk to me in the admin console.");
  wireAgentVoicePreview("proposal", "Ledger", "This is how I'll sound when you talk to me in the admin console.");
  wireAgentVoicePreview("content", "Danielle", "This is how I'll sound when you talk to me in the admin console.");
  wireAgentVoicePreview("arch", "Arch", "This is how I'll sound when you talk to me in the admin console.");
  wireAgentVoicePreview("sketch", "Sketch", "This is how I'll sound when you talk to me in the admin console.");
  wireAgentVoicePreview("ada", "Ada", "This is how I'll sound when you talk to me in the admin console.");
  wireAgentVoicePreview("chief", "Chief", "This is how I'll sound when you talk to me in the admin console.");
  wireAgentVoicePreview("scout", "Scout", "This is how I'll sound when you talk to me in the admin console.");
  wireAgentVoicePreview("sage", "Sage", "This is how I'll sound if read-aloud is ever added to the public marketing brain page.");
  wireAgentVoicePreview("reel", "Reel", "This is how I'll sound when you talk to me in the admin console.");
  wireBrandLogoUpload("dark");
  wireBrandLogoUpload("white");
})();
