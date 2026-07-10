// "Work" mega-dropdown on the desktop nav's Projects link: platform
// categories, the live list of published projects, and a featured case study
// (springsummer.dk-style, adapted to the editorial system). Built entirely
// client-side so the 24 static pages stay in sync with the real portfolio.
(function () {
  var trigger = document.querySelector(".site-nav .d-md-flex a[href='/projects.html']");
  if (!trigger || typeof api === "undefined") return;

  // Shared with projects.html's ?platform= filter — keep the two in sync by
  // exposing the classifier rather than duplicating it.
  function platformOf(p) {
    var hay = ((p.tags || []).map(function (t) { return t.name; }).join(" ")
      + " " + (p.title || "") + " " + (p.summary || "")).toLowerCase();
    if (/e-?commerce|storefront|shopfront|\bshop\b|\bstore\b|paystack|woocommerce|checkout/.test(hay)) return "ecommerce";
    if (/mobile|android|\bios\b|react native|flutter/.test(hay)) return "mobile";
    return "webapp";
  }
  window.worksPlatformOf = platformOf;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var dropdown = document.createElement("div");
  dropdown.className = "works-panel";
  dropdown.setAttribute("aria-label", "Our work");
  document.querySelector(".site-nav").appendChild(dropdown);

  trigger.classList.add("works-trigger");
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  trigger.insertAdjacentHTML("beforeend",
    ' <svg class="works-caret" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="6 9 12 15 18 9"/></svg>');

  function render(projects) {
    var counts = { ecommerce: 0, webapp: 0, mobile: 0 };
    projects.forEach(function (p) { counts[platformOf(p)]++; });

    var platformRows = [
      { label: "All projects", href: "/projects.html", count: projects.length },
      { label: "E-commerce", href: "/projects.html?platform=ecommerce", count: counts.ecommerce },
      { label: "Web apps", href: "/projects.html?platform=webapp", count: counts.webapp },
      { label: "Mobile apps", href: "/projects.html?platform=mobile", count: counts.mobile },
    ].map(function (r) {
      return '<a class="works-platform" href="' + r.href + '">' + esc(r.label)
        + '<span class="works-count">' + r.count + "</span></a>";
    }).join("");

    var items = projects.map(function (p, i) {
      var num = String(i + 1).padStart(2, "0");
      var tag = (p.tags && p.tags[0] && p.tags[0].name) ? p.tags[0].name : "Build";
      return '<a class="works-item" href="/project.html?slug=' + encodeURIComponent(p.slug) + '">'
        + '<span class="works-index">' + num + "</span>"
        + '<span class="works-title">' + esc(p.title) + "</span>"
        + '<span class="works-tag">' + esc(tag) + "</span></a>";
    }).join("");

    var featured = projects[0];
    var featuredHtml = featured
      ? '<p class="works-label">// HAVE YOU SEEN</p>'
        + '<a class="works-featured" href="/project.html?slug=' + encodeURIComponent(featured.slug) + '">'
        + "<strong>" + esc(featured.title) + "</strong>"
        + "<span>" + esc(String(featured.summary || "").slice(0, 140)) + "</span>"
        + '<span class="works-cta">View case study &rarr;</span></a>'
      : "";

    dropdown.innerHTML =
      '<div class="container works-grid">'
      + '<div class="works-col"><p class="works-label">// PLATFORMS</p>' + platformRows + "</div>"
      + '<div class="works-col works-col-list"><p class="works-label">// PRODUCTION LOGS</p>'
      + '<div class="works-items">' + items + "</div></div>"
      + '<div class="works-col">' + featuredHtml + "</div>"
      + "</div>";
  }

  var closeTimer = null;
  function setOpen(open) {
    clearTimeout(closeTimer);
    dropdown.classList.toggle("open", open);
    trigger.classList.toggle("open", open);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  }
  function scheduleClose() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { setOpen(false); }, 160);
  }

  [trigger, dropdown].forEach(function (el) {
    el.addEventListener("mouseenter", function () { setOpen(true); });
    el.addEventListener("mouseleave", scheduleClose);
  });
  trigger.addEventListener("focus", function () { setOpen(true); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });
  document.addEventListener("click", function (e) {
    if (dropdown.classList.contains("open") && !dropdown.contains(e.target) && e.target !== trigger) {
      setOpen(false);
    }
  });

  api.get("/api/v1/projects")
    .then(function (projects) { render(projects || []); })
    .catch(function () { dropdown.remove(); trigger.querySelector(".works-caret").remove(); });
})();
