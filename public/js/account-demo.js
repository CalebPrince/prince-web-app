(async function () {
  const shell = document.getElementById("demo-shell");
  const token = new URLSearchParams(location.search).get("token") || "";
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  const endpoint = `/api/v1/account-demos/${encodeURIComponent(token)}/track`;

  function track(event, value = 0, beacon = false, extra = {}) {
    const payload = JSON.stringify({ event, value, ...extra });
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
      return;
    }
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }

  function fail(message) {
    shell.innerHTML = `<section class="demo-error"><p class="demo-kicker">Private walkthrough</p><h1>This page is not available.</h1><p>${escapeHtml(message)}</p></section>`;
  }
  if (!/^[a-f0-9]{36}$/.test(token)) {
    fail("Check that the private link was copied in full.");
    return;
  }

  try {
    const response = await fetch(`/api/v1/account-demos/${encodeURIComponent(token)}`, { credentials: "same-origin" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The walkthrough may still be awaiting review.");

    const personalization = data.personalization || {};
    const template = personalization.template || "professional";
    const theme = personalization.theme || {};
    document.querySelector("[data-builder-label]").textContent =
      `Built by ${personalization.builder_name || "Arch"} · Private outcome walkthrough`;
    const templateCopy = ({
      healthcare: {
        contrast: "From a waiting patient to a guided next step.",
        before: "Care questions compete for attention.",
        after: "Patient access keeps moving.",
        playback: "How one patient request can move with clarity",
        shift: "Patient access stays responsive",
        close: "Start with one patient-access workflow. Monitor it with the care team. Expand only where it protects attention and trust.",
      },
      hospitality: {
        contrast: "From a waiting guest to a considered response.",
        before: "Guest interest waits for a free moment.",
        after: "Every enquiry receives attention.",
        playback: "How one guest enquiry becomes a clear next step",
        shift: "Guest enquiries stay warm",
        close: "Begin with one guest journey. Tune it around the way your team serves. Expand when the experience feels unmistakably yours.",
      },
      finance: {
        contrast: "From an uncertain enquiry to a controlled handoff.",
        before: "Routine questions absorb specialist time.",
        after: "Service moves within clear boundaries.",
        playback: "How one client request moves without compromising judgment",
        shift: "Service stays clear and controlled",
        close: "Start with a bounded service workflow. Keep sensitive decisions human. Expand only with the controls and audit trail your team expects.",
      },
      property: {
        contrast: "From casual property interest to a qualified next step.",
        before: "Enquiries wait for an available agent.",
        after: "Viewing intent reaches the right person.",
        playback: "How one property enquiry moves toward a viewing",
        shift: "Property interest keeps its momentum",
        close: "Begin with one enquiry-to-viewing journey. Prove the handoff with your agents. Expand across the portfolio when it earns confidence.",
      },
      education: {
        contrast: "From a broad question to a confident enrolment step.",
        before: "Repeated questions compete with learner support.",
        after: "Prospective learners find direction.",
        playback: "How one learner enquiry moves toward enrolment",
        shift: "Learner enquiries stay guided",
        close: "Start with one programme enquiry journey. Review it with admissions. Expand when it consistently gives learners the right next step.",
      },
      commerce: {
        contrast: "From a product question to a purchase-ready next step.",
        before: "Customer questions interrupt fulfilment.",
        after: "Buying intent keeps moving.",
        playback: "How one customer request moves toward fulfilment",
        shift: "Customer intent stays active",
        close: "Begin with one customer-service journey. Measure the response and handoff. Expand when it helps the team serve without slowing delivery.",
      },
      professional: {
        contrast: "From a waiting enquiry to an organised next step.",
        before: "New requests compete with focused work.",
        after: "Client opportunities stay moving.",
        playback: "How one client enquiry moves with context",
        shift: "Client enquiries stay responsive",
        close: "Start with one controlled client journey. Review it with the team. Expand only when it consistently protects focus and follow-through.",
      },
    })[template] || {
      contrast: "From a waiting enquiry to an organised next step.",
      before: "New requests compete with focused work.",
      after: "Client opportunities stay moving.",
      playback: "How one client enquiry moves with context",
      shift: "Client enquiries stay responsive",
      close: "Start with one controlled client journey. Review it with the team. Expand only when it consistently protects focus and follow-through.",
    };
    document.body.dataset.template = template;
    document.body.dataset.variant = String(personalization.variant || 1);
    const themeVariables = {
      accent: "--blue",
      navy: "--navy",
      paper: "--paper",
      soft: "--blue-soft",
      warm: "--amber",
    };
    Object.entries(themeVariables).forEach(([key, cssVariable]) => {
      if (/^#[0-9a-f]{6}$/i.test(theme[key] || "")) {
        document.documentElement.style.setProperty(cssVariable, theme[key]);
      }
    });

    const fragment = document.getElementById("demo-template").content.cloneNode(true);
    fragment.querySelector("[data-business]").textContent = data.business_name;
    fragment.querySelector("[data-client-initials]").textContent = personalization.initials || "PC";
    fragment.querySelector("[data-industry]").textContent = personalization.industry_label || "Client operations";
    const domain = fragment.querySelector("[data-domain]");
    domain.textContent = personalization.website_host || "Private concept";
    fragment.querySelector("[data-contrast-title]").textContent = templateCopy.contrast;
    fragment.querySelector("[data-before-title]").textContent = templateCopy.before;
    fragment.querySelector("[data-after-title]").textContent = templateCopy.after;
    fragment.querySelector("[data-playback-title]").textContent = templateCopy.playback;
    fragment.querySelector("[data-shift-label]").textContent = templateCopy.shift;
    fragment.querySelector("[data-close-line]").textContent = templateCopy.close;
    fragment.querySelector("[data-headline]").textContent = data.headline;
    fragment.querySelector("[data-summary]").textContent = data.outcome_summary;
    fragment.querySelector("[data-friction]").textContent = data.friction_label;
    fragment.querySelector("[data-proof]").textContent = data.proof_note;
    fragment.querySelector("[data-evidence]").innerHTML = (personalization.evidence_points || [])
      .map(point => `<li>${escapeHtml(point)}</li>`).join("");
    fragment.querySelector("[data-contrast-before]").textContent = data.friction_label;
    fragment.querySelector("[data-contrast-after]").textContent = data.outcome_summary;
    const contrast = fragment.querySelector("[data-contrast]");
    const contrastRange = fragment.querySelector("[data-contrast-range]");
    contrastRange.addEventListener("input", () => contrast.style.setProperty("--split", `${contrastRange.value}%`));
    contrastRange.addEventListener("change", () => track("interaction"));
    fragment.querySelector("[data-workflow]").innerHTML = (data.workflow || []).map(step => `
      <article class="workflow-step">
        <span class="workflow-node" aria-hidden="true"></span>
        <span class="workflow-actor">${escapeHtml(step.actor)}</span>
        <h3>${escapeHtml(step.label)}</h3>
        <p>${escapeHtml(step.detail)}</p>
      </article>`).join("");
    fragment.querySelectorAll("[data-cta]").forEach(link => {
      link.href = data.cta_url;
      link.querySelector("[data-cta-label]").textContent = data.cta_label;
      link.addEventListener("click", () => {
        track("cta", 0, true);
      });
    });
    shell.replaceChildren(fragment);
    document.title = `${data.business_name} outcome walkthrough | Prince Caleb`;

    const viewKey = `account-demo-viewed:${token}`;
    let shouldTrackView = true;
    try {
      shouldTrackView = !sessionStorage.getItem(viewKey);
      if (shouldTrackView) sessionStorage.setItem(viewKey, "1");
    } catch (_) {
      // Privacy modes may disable storage; the page remains usable and the
      // server-side rate limit still bounds duplicate analytics.
    }
    if (shouldTrackView) {
      track("view");
    }

    let activeSeconds = 0;
    let maxScroll = 0;
    const engagementTimer = setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) activeSeconds += 5;
    }, 5000);
    const measureScroll = () => {
      const available = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      maxScroll = Math.max(maxScroll, Math.min(100, Math.round((scrollY / available) * 100)));
    };
    addEventListener("scroll", measureScroll, { passive: true });
    addEventListener("pagehide", () => {
      clearInterval(engagementTimer);
      measureScroll();
      if (maxScroll || activeSeconds) track("session", 0, true, { scroll: maxScroll, engaged: activeSeconds });
    }, { once: true });
  } catch (error) {
    fail(error.message || "The walkthrough could not be loaded.");
  }
})();
