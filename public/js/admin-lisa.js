const LISA_FIELDS = [
  "lisa_page_eyebrow",
  "lisa_page_subheadline",
  "lisa_page_integrations_disclaimer",
  "lisa_pricing_eyebrow",
  "lisa_pricing_title",
  "lisa_page_service_pitch",
  "lisa_tier_1_name",
  "lisa_tier_1_price_ghs",
  "lisa_tier_1_price_usd",
  "lisa_tier_1_tagline",
  "lisa_tier_1_features",
  "lisa_tier_2_name",
  "lisa_tier_2_price_ghs",
  "lisa_tier_2_price_usd",
  "lisa_tier_2_tagline",
  "lisa_tier_2_features",
  "lisa_tier_3_name",
  "lisa_tier_3_price_ghs",
  "lisa_tier_3_price_usd",
  "lisa_tier_3_tagline",
  "lisa_tier_3_features",
  "lisa_custom_tier_name",
  "lisa_custom_tier_cta_label",
  "lisa_custom_tier_tagline",
  "lisa_custom_tier_features",
];

const LISA_DEFAULTS = {
  lisa_page_eyebrow: "// Meet Lisa",
  lisa_page_subheadline: "Lisa can answer calls and messages, understand what a customer needs, complete the next task in the tools your team already uses, and bring a person in when judgment is required.",
  lisa_page_integrations_disclaimer: "Tool names describe possible integrations. Availability depends on the tool’s API, your account plan, permissions, and the workflow we approve together.",
  lisa_pricing_eyebrow: "// One connected service",
  lisa_pricing_title: "Lisa, sold as one whole service.",
  lisa_page_service_pitch: "Lisa isn’t a pile of separate tools you have to stitch together. She’s one monthly service — calls, WhatsApp, and web chat on one side, and your social media tools, apps, and CRMs connected on the other, all managed as a single subscription.",
  lisa_tier_1_name: "Starter",
  lisa_tier_1_price_ghs: "GHS 800",
  lisa_tier_1_price_usd: "$55",
  lisa_tier_1_tagline: "One channel, answering the questions and requests that come in every day.",
  lisa_tier_1_features: "One channel: WhatsApp or web chat\nApproved FAQ and lead capture\nMonthly conversation summary",
  lisa_tier_2_name: "Growth",
  lisa_tier_2_price_ghs: "GHS 2,000",
  lisa_tier_2_price_usd: "$140",
  lisa_tier_2_tagline: "Voice and messaging together, connected to the calendar and CRM your team already uses.",
  lisa_tier_2_features: "Voice, WhatsApp, and web chat\nOne CRM or calendar integration\nHuman escalation and notifications\nMonthly reporting dashboard",
  lisa_tier_3_name: "Scale",
  lisa_tier_3_price_ghs: "GHS 4,500",
  lisa_tier_3_price_usd: "$300",
  lisa_tier_3_tagline: "Every channel plus a live AI video agent, connected to your apps and CRMs with priority support.",
  lisa_tier_3_features: "All channels, including social inboxes\nLive AI video agent with an agreed monthly allowance\nMultiple CRM, app, and social integrations\nPriority support and monthly optimisation\nFull audit trail and reporting",
  lisa_custom_tier_name: "Custom",
  lisa_custom_tier_cta_label: "Talk to us",
  lisa_custom_tier_tagline: "A workflow built around your exact tools, volume, and compliance needs, priced once we've scoped it.",
  lisa_custom_tier_features: "Unlimited channels and integrations\nCustom-trained branded video avatar\nDedicated workflows and safeguards\nA named point of contact",
};

function showLisaMsg(text, ok) {
  const el = document.getElementById("lisa-msg");
  el.className = `alert py-2 small ${ok ? "alert-success" : "alert-danger"}`;
  el.textContent = text;
  el.scrollIntoView({ block: "nearest" });
}

function renderLisaTierEditors() {
  const wrap = document.getElementById("tier-editors");
  wrap.innerHTML = "";

  for (let i = 1; i <= 3; i++) {
    const col = document.createElement("div");
    col.className = "col-12";
    col.innerHTML = `
      <div class="admin-card p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="mb-0">Tier ${i} <small class="text-muted-custom fw-normal">Monthly</small></h5>
          ${i === 2 ? '<span class="status-pill published">Most requested</span>' : ""}
        </div>
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label">Name</label>
            <input type="text" class="form-control" id="lisa_tier_${i}_name" maxlength="80">
          </div>
          <div class="col-md-4">
            <label class="form-label">Price (GHS, monthly)</label>
            <input type="text" class="form-control" id="lisa_tier_${i}_price_ghs" maxlength="60" placeholder="GHS 2,000">
          </div>
          <div class="col-md-4">
            <label class="form-label">Price (USD, monthly)</label>
            <input type="text" class="form-control" id="lisa_tier_${i}_price_usd" maxlength="60" placeholder="$140">
          </div>
          <div class="col-12">
            <label class="form-label">Tagline</label>
            <textarea class="form-control" id="lisa_tier_${i}_tagline" rows="2" maxlength="500"></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Features</label>
            <textarea class="form-control" id="lisa_tier_${i}_features" rows="4" placeholder="One feature per line"></textarea>
            <div class="form-text">One feature per line. These appear as bullets on the public Lisa page.</div>
          </div>
        </div>
      </div>
    `;
    wrap.appendChild(col);
  }
}

async function loadLisa() {
  const settings = await api.get("/api/v1/admin/settings");
  LISA_FIELDS.forEach(key => {
    const el = document.getElementById(key);
    if (!el) return;
    el.value = settings[key] || LISA_DEFAULTS[key] || "";
  });
}

async function saveLisa(e) {
  e.preventDefault();
  const payload = {};
  LISA_FIELDS.forEach(key => {
    const el = document.getElementById(key);
    if (el) payload[key] = el.value.trim();
  });

  const btn = document.getElementById("save-lisa-btn");
  btn.disabled = true;
  try {
    await api.put("/api/v1/admin/settings", payload);
    showLisaMsg("Saved - the public Lisa page updates immediately.", true);
  } catch (err) {
    showLisaMsg(err.message, false);
  }
  btn.disabled = false;
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();
  renderLisaTierEditors();
  document.getElementById("lisa-form").addEventListener("submit", saveLisa);
  await loadLisa();
})();
