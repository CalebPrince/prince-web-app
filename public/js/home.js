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
            attribution: window.getLeadAttribution ? window.getLeadAttribution() : {},
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

  // --- Prototype-generator teaser: animated placeholder --------------------
  // Types example ideas into the landing mock's fake input, mirroring the
  // typewriter placeholder on /chat.html so the teaser feels like the real
  // thing. Purely cosmetic — static first example under reduced motion. The
  // row height is held by the send button, so the emptying text never jitters.
  const mockPlaceholder = document.getElementById("proto-cta-placeholder");
  if (mockPlaceholder) {
    const EXAMPLES = [
      "A booking site for my hair salon, with online payments…",
      "A portfolio site for a photographer, with a gallery…",
      "An online store for handmade jewelry, with checkout…",
      "A booking app for a fitness studio, with class schedules…",
    ];
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      mockPlaceholder.textContent = EXAMPLES[0];
    } else {
      let phrase = 0, char = 0, deleting = false;
      (function tick() {
        const text = EXAMPLES[phrase];
        if (!deleting) {
          char++;
          mockPlaceholder.textContent = text.slice(0, char);
          if (char === text.length) { deleting = true; setTimeout(tick, 1800); return; }
          setTimeout(tick, 45);
        } else {
          char--;
          mockPlaceholder.textContent = text.slice(0, char);
          if (char === 0) { deleting = false; phrase = (phrase + 1) % EXAMPLES.length; setTimeout(tick, 400); return; }
          setTimeout(tick, 20);
        }
      })();
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

      caseRows.innerHTML = picks.map((p, i) => {
        const num = String(i + 1).padStart(2, "0");
        const tag = (p.tags && p.tags[0] && p.tags[0].name) ? p.tags[0].name : "Deployment";
        const badges = (p.tags || []).slice(0, 3).map(t => `<span class="mono-badge">${esc(t.name)}</span>`).join("");
        const tech = badges || `<span class="mono-badge">Vanilla PHP</span><span class="mono-badge">SQLite</span><span class="mono-badge">Bootstrap 5</span>`;
        const media = p.cover_image_path
          ? `<a href="/project.html?slug=${esc(p.slug)}" class="case-media"><img src="${esc(p.cover_image_path)}" alt="${esc(p.title)}" loading="lazy"></a>`
          : `<a href="/project.html?slug=${esc(p.slug)}" class="text-decoration-none"><div class="case-code-card"><code>${esc(tag)}</code><div class="sub">architecture summary</div></div></a>`;
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
                  <a href="/project.html?slug=${esc(p.slug)}" class="d-inline-block mt-4 small fw-semibold">View case study <span class="cta-arrow">→</span></a>
                </div>
              </div>
              <div class="col-lg-5 ${flip ? "order-2 order-lg-1" : "offset-lg-1"}">${media}</div>
            </div>
          </div>`;
      }).join("");
    })();
  }

  // --- Latest archive posts (blog API) --------------------------------------
  // The API returns posts newest-first, so the top three here are always the
  // three most recent publishes. The static entries in the HTML stay as the
  // fallback when the API is unreachable.
  const archiveList = document.getElementById("archive-latest");
  if (archiveList) {
    (async () => {
      let posts = [];
      try {
        posts = await api.get("/api/v1/blog");
      } catch (_) {
        return; // static fallback entries stay
      }
      if (!posts.length) return;

      const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      const monthYear = iso => {
        const d = new Date(String(iso || "").replace(" ", "T"));
        return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
      };

      archiveList.innerHTML = posts.slice(0, 3).map((p, i) => {
        const url = `/archive-post.html?slug=${encodeURIComponent(p.slug)}`;
        const dateLabel = monthYear(p.created_at);
        return `
          <article class="archive-entry reveal reveal-on-scroll${i ? ` reveal-delay-${i}` : ""}">
            <div>
              <span class="archive-domain">[${esc((p.category || "Technical Archive").toUpperCase())}]</span>
              ${dateLabel ? `<div class="small text-muted-custom mt-2">${esc(dateLabel)}</div>` : ""}
            </div>
            <div>
              <h3 class="h3 archive-title"><a href="${url}">${esc(p.title)}</a></h3>
              <p class="archive-meta">${esc(p.excerpt)}</p>
              <a href="${url}" class="archive-link">Read the breakdown</a>
            </div>
            <div class="archive-metric">
              <strong>${Number(p.reading_time) || 1} min</strong>
              <span>Technical read</span>
            </div>
          </article>`;
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
