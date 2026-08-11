// Homepage-only behavior: scope planner + lead capture, capability track
// switching, API-driven case-study rows, and live testimonials feeding the
// hero rating pill. Every block guards on its root element so this file is
// inert on any other page.
(function () {
  // --- Hero ------------------------------------------------------------
  // Eyebrow/title/subtitle used to be picked randomly per browser session
  // from 3 hardcoded A/B variants. That's gone: the homepage now shows one
  // AI-generated headline per calendar day for every visitor (see
  // database/generate_daily_headline.php + SettingsController::publicContent,
  // hydrated into the [data-content] elements below by content.js). This
  // block only owns the CTA labels/hrefs, trust-rail numbers, mobile sticky
  // bar, and click tracking — it must NOT touch hero_eyebrow/hero_title/
  // hero_subtitle, or it would clobber the daily headline on every load.
  const heroRoot = document.querySelector(".home-page .agency-hero");
  if (heroRoot) {
    const cta = {
      primary: { label: "Book a voice-agent call", href: "/book.html?focus=voice-agent" },
      secondary: { label: "See voice-agent examples", href: "/services.html#track-01" },
    };

    const primaryCta = document.getElementById("hero-primary-cta");
    const secondaryCta = document.getElementById("hero-secondary-cta");
    const outcomeCta = document.getElementById("hero-outcome-cta");
    const trustYears = document.getElementById("hero-trust-years");
    const trustProjects = document.getElementById("hero-trust-projects");
    const trustRating = document.getElementById("hero-trust-rating");
    const mobileSticky = document.getElementById("mobile-sticky-cta");
    const mobileStickyPrimary = document.getElementById("mobile-sticky-primary");
    const mobileStickyWhatsapp = document.getElementById("mobile-sticky-whatsapp");

    const applyCta = () => {
      if (primaryCta) {
        primaryCta.textContent = cta.primary.label;
        primaryCta.setAttribute("href", cta.primary.href);
      }
      if (secondaryCta) {
        secondaryCta.textContent = cta.secondary.label;
        secondaryCta.setAttribute("href", cta.secondary.href);
      }
      if (mobileStickyPrimary) {
        mobileStickyPrimary.textContent = cta.primary.label;
        mobileStickyPrimary.setAttribute("href", cta.primary.href);
      }
      if (outcomeCta) {
        outcomeCta.setAttribute("href", cta.primary.href);
      }
    };

    const syncTrustRail = () => {
      const years = document.getElementById("stat-years-count");
      const projects = document.querySelector('.stat-item .stat-value[data-count-to="30"], .stat-item:nth-child(2) .stat-value');
      const rating = document.querySelector('.stat-item .stat-value[data-count-suffix="%"]');
      if (trustYears && years) {
        const val = years.getAttribute("data-count-to") || "12";
        const suffix = years.getAttribute("data-count-suffix") || "+";
        trustYears.textContent = val + suffix;
      }
      if (trustProjects && projects) {
        const val = projects.getAttribute("data-count-to");
        const suffix = projects.getAttribute("data-count-suffix") || "+";
        if (val) trustProjects.textContent = val + suffix;
      }
      if (trustRating && rating) {
        const val = rating.getAttribute("data-count-to");
        const suffix = rating.getAttribute("data-count-suffix") || "%";
        if (val) trustRating.textContent = val + suffix;
      }
    };

    applyCta();
    syncTrustRail();
    // content.js can patch hero copy from API slightly later; re-assert once.
    window.setTimeout(function () {
      applyCta();
      syncTrustRail();
    }, 650);

    const seenKey = "home_hero_seen_" + new Date().toISOString().slice(0, 10);
    if (!sessionStorage.getItem(seenKey)) {
      sessionStorage.setItem(seenKey, "1");
      if (window.trackUiEvent) window.trackUiEvent("hero_view");
    }

    if (primaryCta) {
      primaryCta.addEventListener("click", () => {
        if (window.trackUiEvent) window.trackUiEvent("hero_cta_primary");
      });
    }
    if (secondaryCta) {
      secondaryCta.addEventListener("click", () => {
        if (window.trackUiEvent) window.trackUiEvent("hero_cta_secondary");
      });
    }
    if (outcomeCta) {
      outcomeCta.addEventListener("click", () => {
        if (window.trackUiEvent) window.trackUiEvent("hero_cta_outcome");
      });
    }

    if (mobileSticky) {
      const toggleSticky = () => {
        const isMobile = window.matchMedia("(max-width: 991.98px)").matches;
        const show = isMobile && window.scrollY > 220;
        mobileSticky.classList.toggle("is-visible", show);
      };
      toggleSticky();
      window.addEventListener("scroll", toggleSticky, { passive: true });
      window.addEventListener("resize", toggleSticky);
      if (mobileStickyPrimary) {
        mobileStickyPrimary.addEventListener("click", () => {
          if (window.trackUiEvent) window.trackUiEvent("hero_cta_mobile_primary");
        });
      }
      if (mobileStickyWhatsapp) {
        mobileStickyWhatsapp.addEventListener("click", () => {
          const afterDemo = (() => {
            try { return sessionStorage.getItem("voice_demo_started") === "1" || sessionStorage.getItem("voice_demo_answered") === "1"; }
            catch (_) { return false; }
          })();
          if (window.trackUiEvent) window.trackUiEvent("hero_cta_mobile_whatsapp" + (afterDemo ? "_after_demo" : ""));
        });
      }
    }

    const heroWhatsApp = heroRoot.querySelector('.live-channel-rail a[href*="wa.me"]');
    if (heroWhatsApp) {
      heroWhatsApp.addEventListener("click", () => {
        const afterDemo = (() => {
          try { return sessionStorage.getItem("voice_demo_started") === "1" || sessionStorage.getItem("voice_demo_answered") === "1"; }
          catch (_) { return false; }
        })();
        if (window.trackUiEvent) window.trackUiEvent("hero_cta_whatsapp" + (afterDemo ? "_after_demo" : ""));
      });
    }
  }

  // --- Homepage FAQ interactions + SEO schema -----------------------------
  const faqRoot = document.getElementById("home-faq");
  if (faqRoot) {
    const fired = new Set();
    const bindFaqTracking = function () {
      faqRoot.querySelectorAll(".accordion-collapse").forEach(panel => {
        if (panel.dataset.analyticsBound === "1") return;
        panel.dataset.analyticsBound = "1";
        panel.addEventListener("shown.bs.collapse", function () {
          const id = String(panel.id || "");
          if (!id || fired.has(id)) return;
          fired.add(id);
          if (window.trackUiEvent) window.trackUiEvent("faq_open_" + id.replace(/[^a-z0-9_\-]/gi, "").toLowerCase());
        });
      });
    };

    const refreshFaqSchema = function () {
      const existing = document.getElementById("home-faq-schema");
      if (existing) existing.remove();

      const entities = [];
      faqRoot.querySelectorAll(".accordion-item").forEach(item => {
        const q = item.querySelector(".accordion-button")?.textContent?.trim();
        const a = item.querySelector(".accordion-body")?.textContent?.trim();
        if (!q || !a) return;
        entities.push({
          "@type": "Question",
          "name": q,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": a,
          },
        });
      });

      if (!entities.length) return;
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = "home-faq-schema";
      script.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": entities,
      });
      document.head.appendChild(script);
    };

    bindFaqTracking();
    refreshFaqSchema();
    document.addEventListener("home:faq-updated", function () {
      bindFaqTracking();
      refreshFaqSchema();
    });
  }

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

      hoursEl.textContent = total ? `${total} hours` : " ";
      blueprintEl.textContent = total ? blueprint : " ";
      launchEl.textContent = total ? launch : " ";
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
          form.innerHTML = '<p class="mb-0" style="color: var(--heading-color); font-weight: 500;">Estimate on its way, I\'ll follow up within 48 hours. ✓</p>';
        } catch (err) {
          status.textContent = err.message || "Something went wrong, please try again.";
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
  // thing. Purely cosmetic, static first example under reduced motion. The
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
        caseRows.innerHTML = ""; // API down, drop the skeletons quietly
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
          ? `<a href="/project.html?slug=${esc(p.slug)}" class="case-media case-browser-mockup" aria-label="View ${esc(p.title)} system">
              <span class="case-browser-bar" aria-hidden="true">
                <span class="case-browser-dots"><i></i><i></i><i></i></span>
                <span class="case-browser-address">princecaleb.dev/systems/${esc(p.slug)}</span>
                <span class="case-browser-live"><i></i> Live</span>
              </span>
              <span class="case-browser-viewport">
                <img src="${esc(p.cover_image_path)}" alt="${esc(p.title)} system interface" loading="lazy">
              </span>
            </a>`
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
        const dateLabel = monthYear(p.published_at || p.created_at);
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

  // --- Builder OS conversion layer ----------------------------------------
  const agentRail = document.getElementById("home-os-agent-rail");
  let builderAgents = [];
  if (agentRail) {
    api.get("/api/v1/builder-os/team").then(data => {
      builderAgents = data.agents || [];
      agentRail.innerHTML = builderAgents.slice(0, 4).map(agent => `
        <div><i data-state="${escText(agent.status)}"></i><span>${escText(agent.name)}</span><small>${escText(agent.role)} · ${escText(agent.status)}</small></div>
      `).join("");
    }).catch(() => {
      agentRail.innerHTML = "<span>Live registry reconnecting. Lisa remains available through voice, WhatsApp, and web chat.</span>";
    });
  }

  const decisionDetail = document.getElementById("home-decision-detail");
  const decisionData = {
    agent: { title: "Deploy a customer-facing specialist", outcome: "Answer enquiries, qualify intent, book appointments, follow up, and escalate with context.", example: "Lisa · Voice + WhatsApp + bookings", range: "From GHS 3,500", action: "Explore AI agent systems" },
    automation: { title: "Remove the handoffs people forget", outcome: "Move information between inboxes, calendars, CRM, Slack, email, and operational records.", example: "Trigger → decision → action → owner alert", range: "From GHS 2,500", action: "Map an automation" },
    platform: { title: "Build the operating surface", outcome: "Give customers or staff a purpose-built website, portal, dashboard, or mobile application.", example: "Custom interface + workflows + integrations", range: "From GHS 6,000", action: "Scope a platform" },
  };
  document.querySelectorAll(".home-decision-grid button").forEach(button => button.addEventListener("click", () => {
    const item = decisionData[button.dataset.path];
    document.querySelectorAll(".home-decision-grid button").forEach(node => node.classList.toggle("active", node === button));
    decisionDetail.innerHTML = `<div><span>OUTCOME</span><strong>${item.title}</strong><p>${item.outcome}</p></div><div><span>EXAMPLE SYSTEM</span><strong>${item.example}</strong><small>${item.range}</small></div><a href="/contact.html?system=${encodeURIComponent(button.dataset.path)}">${item.action} →</a>`;
    decisionDetail.classList.add("show");
  }));

  const recommenderForm = document.getElementById("system-recommender-form");
  if (recommenderForm) {
    recommenderForm.addEventListener("submit", event => {
      event.preventDefault();
      const input = document.getElementById("system-recommender-input").value.trim();
      const lower = input.toLowerCase();
      const lisa = builderAgents.find(agent => agent.key === "lisa")?.name || "Lisa";
      const arch = builderAgents.find(agent => agent.key === "arch")?.name || "Arch";
      const isCall = /call|phone|miss|booking|appointment|whatsapp|customer|support|clinic|restaurant/.test(lower);
      const isPlatform = /website|app|portal|dashboard|platform|store|ecommerce/.test(lower);
      const lead = isCall ? lisa : isPlatform ? arch : "Builder OS";
      const title = isCall ? `${lisa} Customer Response System` : isPlatform ? `${arch} Custom Platform System` : "Connected Workflow System";
      const actions = isCall
        ? ["Answers and qualifies incoming requests", "Books or captures the next action", "Sends confirmations and structured follow-up", "Escalates sensitive cases to a person"]
        : isPlatform
          ? ["Creates a purpose-built customer or staff interface", "Connects forms, records, payments, and notifications", "Keeps operational progress visible", "Routes exceptions to the right person"]
          : ["Captures the trigger and required context", "Moves work between connected tools", "Records each completed action", "Alerts the owner when judgment is required"];
      const output = document.getElementById("system-recommendation");
      output.innerHTML = `<header><span>RECOMMENDED SYSTEM</span><strong>${escText(title)}</strong><small>Lead specialist: ${escText(lead)}</small></header><p>${escText(input)}</p><ul>${actions.map(action => `<li>${escText(action)}</li>`).join("")}</ul><div><span><small>ESTIMATED IMPLEMENTATION</small><strong>${isPlatform ? "4–8 weeks" : "2–3 weeks"}</strong></span><a href="/builder-os.html">See the workflow</a><a href="#" onclick="document.getElementById('ai-widget-toggle')?.click();return false;">Talk to ${escText(lisa)}</a><a class="btn-brand" href="/contact.html?brief=${encodeURIComponent(input)}">Request this system</a></div>`;
      output.classList.remove("d-none");
      output.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
    });
  }

  function escText(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
})();
