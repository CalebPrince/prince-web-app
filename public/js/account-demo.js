(async function () {
  const shell = document.getElementById("demo-shell");
  const token = new URLSearchParams(location.search).get("token") || "";
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

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

    const fragment = document.getElementById("demo-template").content.cloneNode(true);
    fragment.querySelector("[data-business]").textContent = data.business_name;
    fragment.querySelector("[data-headline]").textContent = data.headline;
    fragment.querySelector("[data-summary]").textContent = data.outcome_summary;
    fragment.querySelector("[data-friction]").textContent = data.friction_label;
    fragment.querySelector("[data-proof]").textContent = data.proof_note;
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
        navigator.sendBeacon?.(`/api/v1/account-demos/${encodeURIComponent(token)}/track`, new Blob([JSON.stringify({ event: "cta" })], { type: "application/json" }));
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
      fetch(`/api/v1/account-demos/${encodeURIComponent(token)}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "view" }),
        keepalive: true,
      }).catch(() => {});
    }
  } catch (error) {
    fail(error.message || "The walkthrough could not be loaded.");
  }
})();
