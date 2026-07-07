const PRICING_FIELDS = [
  "pricing_intro",
  "pricing_currency",
  "pricing_tier_1_amount",
  "pricing_tier_1_name",
  "pricing_tier_1_price",
  "pricing_tier_1_tagline",
  "pricing_tier_1_features",
  "pricing_tier_2_name",
  "pricing_tier_2_price",
  "pricing_tier_2_tagline",
  "pricing_tier_2_features",
  "pricing_tier_3_name",
  "pricing_tier_3_price",
  "pricing_tier_3_tagline",
  "pricing_tier_3_features",
];

const PRICING_DEFAULTS = {
  pricing_currency: "GHS",
  pricing_tier_1_amount: "6000",
  pricing_tier_1_name: "Starter",
  pricing_tier_1_price: "From GHS 6,000",
  pricing_tier_1_tagline: "Landing pages, small brochure sites, and simple booking or contact tools.",
  pricing_tier_1_features: "Up to 5 pages, responsive design\nContact or booking form wired to email\nBasic on-page SEO\n~2 weeks typical delivery",
  pricing_tier_2_name: "Growth",
  pricing_tier_2_price: "From GHS 25,000",
  pricing_tier_2_tagline: "Custom web apps, CMS ecosystems, and dashboards built around your actual workflow.",
  pricing_tier_2_features: "Custom database & API design\nAdmin dashboard / CMS\nThird-party integrations (payments, messaging)\n4-8 weeks typical delivery",
  pricing_tier_3_name: "Custom / Enterprise",
  pricing_tier_3_price: "Custom quote",
  pricing_tier_3_tagline: "Multi-feature platforms, mobile apps, and ongoing engineering partnerships.",
  pricing_tier_3_features: "Cross-platform mobile apps\nAI integrations & automation\nOngoing support & iteration\nScoped after a discovery call",
};

function showPricingMsg(text, ok) {
  const el = document.getElementById("pricing-msg");
  el.className = `alert py-2 small ${ok ? "alert-success" : "alert-danger"}`;
  el.textContent = text;
  el.scrollIntoView({ block: "nearest" });
}

function renderTierEditors() {
  const wrap = document.getElementById("tier-editors");
  wrap.innerHTML = "";

  for (let i = 1; i <= 3; i++) {
    const col = document.createElement("div");
    col.className = "col-12";
    col.innerHTML = `
      <div class="admin-card p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="mb-0">Tier ${i}</h5>
          ${i === 2 ? '<span class="status-pill published">Most requested</span>' : ""}
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Name</label>
            <input type="text" class="form-control" id="pricing_tier_${i}_name" maxlength="80">
          </div>
          <div class="col-md-6">
            <label class="form-label">Displayed price</label>
            <input type="text" class="form-control" id="pricing_tier_${i}_price" maxlength="120" placeholder="From GHS 6,000">
          </div>
          <div class="col-12">
            <label class="form-label">Tagline</label>
            <textarea class="form-control" id="pricing_tier_${i}_tagline" rows="2" maxlength="500"></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Features</label>
            <textarea class="form-control" id="pricing_tier_${i}_features" rows="5" placeholder="One feature per line"></textarea>
            <div class="form-text">One feature per line. These appear as bullets on the public pricing page.</div>
          </div>
        </div>
      </div>
    `;
    wrap.appendChild(col);
  }
}

async function loadPricing() {
  const settings = await api.get("/api/v1/admin/settings");
  PRICING_FIELDS.forEach(key => {
    const el = document.getElementById(key);
    if (!el) return;
    el.value = settings[key] || PRICING_DEFAULTS[key] || "";
  });
}

async function savePricing(e) {
  e.preventDefault();
  const payload = {};
  PRICING_FIELDS.forEach(key => {
    const el = document.getElementById(key);
    if (el) payload[key] = el.value.trim();
  });

  const amount = payload.pricing_tier_1_amount;
  const parsedAmount = Number(amount);
  if (amount !== "" && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
    showPricingMsg("Starter checkout amount must be a valid positive number.", false);
    return;
  }

  const btn = document.getElementById("save-pricing-btn");
  btn.disabled = true;
  try {
    await api.put("/api/v1/admin/settings", payload);
    showPricingMsg("Saved - public pricing updates immediately.", true);
  } catch (err) {
    showPricingMsg(err.message, false);
  }
  btn.disabled = false;
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();
  renderTierEditors();
  document.getElementById("pricing-form").addEventListener("submit", savePricing);
  await loadPricing();
})();
