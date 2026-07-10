// Homepage-only behavior: scope planner + lead capture, capability track
// switching, API-driven case-study rows, and live testimonials feeding the
// hero rating pill. Every block guards on its root element so this file is
// inert on any other page.
(function () {
  // --- Scope planner -------------------------------------------------------
  const hoursEl = document.getElementById("planner-hours");
  if (hoursEl) {
    const checks = {
      web: document.getElementById("check-web"),
      mobile: document.getElementById("check-mobile"),
      cloud: document.getElementById("check-cloud"),
    };
    const range = document.getElementById("complexity-range");
    const blueprintEl = document.getElementById("planner-blueprint");
    const launchEl = document.getElementById("planner-launch");
    const lead = document.getElementById("planner-lead");
    const complexityNames = { 1: "MVP prototype", 2: "Standard build", 3: "Scale infrastructure" };
    let lastEstimate = null;

    function flash(el) {
      el.classList.remove("value-update-fade");
      void el.offsetWidth; // restart the keyframe animation
      el.classList.add("value-update-fade");
    }

    function calculate() {
      let base = 0;
      if (checks.web.checked) base += 45;
      if (checks.mobile.checked) base += 75;
      if (checks.cloud.checked) base += 35;

      const total = Math.round(base * (0.5 + parseFloat(range.value) * 0.5));
      let blueprint, launch;
      if (total <= 45) {
        blueprint = "1 wk"; launch = "2–3 wks";
      } else if (total <= 100) {
        blueprint = "1–2 wks"; launch = "4–6 wks";
      } else {
        blueprint = "2–3 wks"; launch = "8–12 wks";
      }

      hoursEl.textContent = total ? `${total} hours` : "—";
      blueprintEl.textContent = total ? blueprint : "—";
      launchEl.textContent = total ? launch : "—";
      [hoursEl, blueprintEl, launchEl].forEach(flash);

      lastEstimate = total
        ? {
            platforms: Object.keys(checks).filter(k => checks[k].checked),
            complexity: complexityNames[range.value],
            hours: total,
            blueprint,
            launch,
          }
        : null;
    }

    [checks.web, checks.mobile, checks.cloud, range].forEach(input => {
      input.addEventListener("input", () => {
        calculate();
        if (lead) lead.classList.add("open"); // progressive lead capture: only after engagement
      });
    });

    const form = document.getElementById("planner-lead-form");
    if (form) {
      form.addEventListener("submit", async e => {
        e.preventDefault();
        const status = document.getElementById("lead-status");
        const btn = document.getElementById("lead-submit");
        const est = lastEstimate;
        const platformLabels = { web: "Web platform", mobile: "Mobile app", cloud: "Cloud backend/APIs" };
        const message = est
          ? `Scope planner estimate request.\nPlatforms: ${est.platforms.map(p => platformLabels[p]).join(", ")}.\nComplexity: ${est.complexity}.\nEstimated ~${est.hours} hours (blueprint ${est.blueprint}, alpha launch ${est.launch}).`
          : "Scope planner estimate request (no platforms selected yet).";

        btn.disabled = true;
        btn.textContent = "Sending…";
        try {
          await api.post("/api/v1/inquiries", {
            name: document.getElementById("lead-name").value.trim(),
            email: document.getElementById("lead-email").value.trim(),
            message,
            website: document.getElementById("lead-website").value, // honeypot
          });
          form.innerHTML = '<p class="mb-0" style="color: var(--heading-color); font-weight: 500;">Estimate on its way — I\'ll follow up within 48 hours. ✓</p>';
        } catch (err) {
          status.textContent = err.message || "Something went wrong — please try again.";
          status.classList.remove("d-none");
          status.style.color = "#ef4444";
          btn.disabled = false;
          btn.textContent = "Send me this estimate";
        }
      });
    }
  }

  // --- Capability tracks ---------------------------------------------------
  const selector = document.getElementById("track-selector");
  if (selector) {
    selector.addEventListener("click", e => {
      const btn = e.target.closest(".track-btn");
      if (!btn) return;
      selector.querySelectorAll(".track-btn").forEach(b => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".track-pane").forEach(pane => {
        pane.classList.toggle("d-none", pane.dataset.pane !== btn.dataset.track);
      });
    });
  }

  // --- Case-study rows (projects API) --------------------------------------
  const caseRows = document.getElementById("case-rows");
  if (caseRows) {
    (async () => {
      let projects = [];
      try {
        projects = await api.get("/api/v1/projects");
      } catch (_) {
        caseRows.innerHTML = ""; // API down — drop the skeletons quietly
        return;
      }

      const picks = [
        ...projects.filter(p => p.is_featured),
        ...projects.filter(p => !p.is_featured),
      ].slice(0, 3);

      if (!picks.length) {
        caseRows.innerHTML = "";
        return;
      }

      const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      const metricFor = (p, i) => {
        const raw = String(p.outcome_metrics || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0];
        if (raw) return raw;
        return ["99.9% uptime", "40% faster delivery", "1.5s response target"][i] || "Live deployment";
      };

      caseRows.innerHTML = picks.map((p, i) => {
        const num = String(i + 1).padStart(2, "0");
        const tag = (p.tags && p.tags[0] && p.tags[0].name) ? p.tags[0].name : "Deployment";
        const badges = (p.tags || []).slice(0, 3).map(t => `<span class="mono-badge">${esc(t.name)}</span>`).join("");
        const metric = metricFor(p, i);
        const tech = badges || `<span class="mono-badge">Vanilla PHP</span><span class="mono-badge">SQLite</span><span class="mono-badge">Bootstrap 5</span>`;
        const media = `<a href="/project.html?slug=${esc(p.slug)}" class="text-decoration-none"><div class="case-code-card"><code>metric: ${esc(metric)}</code><div class="sub">${esc(tag)} / architecture summary</div></div></a>`;
        const flip = i % 2 === 1;

        return `
          <div class="case-row reveal reveal-on-scroll">
            <div class="row g-5 align-items-center">
              <div class="col-lg-6 ${flip ? "order-1 order-lg-2 offset-lg-1" : ""}">
                <div class="case-copy">
                  <span class="case-index">${num} / ${esc(tag)}</span>
                  <h3 class="h2 mb-3"><a href="/project.html?slug=${esc(p.slug)}" style="color: var(--heading-color);">${esc(p.title)}</a></h3>
                  <p class="text-muted-custom">${esc(p.summary)}</p>
                  <div class="d-flex flex-wrap gap-2 mt-3">${tech}</div>
                  <a href="/project.html?slug=${esc(p.slug)}" class="d-inline-block mt-4 small fw-semibold">View case study →</a>
                </div>
              </div>
              <div class="col-lg-5 ${flip ? "order-2 order-lg-1" : "offset-lg-1"}">${media}</div>
            </div>
          </div>`;
      }).join("");
    })();
  }

  // --- Live testimonials + hero rating pill --------------------------------
  const grid = document.getElementById("testimonial-grid");
  if (grid) {
    (async () => {
      let rows = [];
      try {
        rows = await api.get("/api/v1/testimonials");
      } catch (_) {
        return; // static fallback cards stay
      }
      if (!rows.length) return;

      const rated = rows.filter(r => r.rating);
      const pill = document.getElementById("hero-rating");
      if (pill && rated.length >= 3) {
        const avg = rated.reduce((sum, r) => sum + Number(r.rating), 0) / rated.length;
        pill.innerHTML = `<span class="stars">★</span> ${avg.toFixed(1)} · ${rated.length} client reviews`;
        pill.classList.remove("d-none");
      }

      const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

      grid.innerHTML = rows.slice(0, 3).map((t, i) => `
        <div class="col-md-4">
          <div class="testimonial-card reveal${i ? ` reveal-delay-${i}` : ""}">
            ${t.rating ? `<div class="testimonial-stars mb-2">${"★".repeat(Math.round(t.rating))}</div>` : ""}
            <p class="testimonial-quote">"${esc(t.quote)}"</p>
            <div class="d-flex align-items-center gap-3 mt-4">
              <div class="testimonial-avatar">${esc((t.client_name || "?").trim().charAt(0).toUpperCase())}</div>
              <div>
                <div class="fw-semibold" style="color: var(--ink);">${esc(t.client_name)}</div>
                ${t.project_reference ? `<div class="small text-muted-custom">${esc(t.project_reference)}</div>` : ""}
              </div>
            </div>
          </div>
        </div>`).join("");
    })();
  }
})();
