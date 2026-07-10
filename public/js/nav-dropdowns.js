// Mega dropdowns on the desktop nav (springsummer.dk-style, adapted to the
// editorial system): About, Services, and Projects each open a full-width
// panel under the nav bar. Services and About are static link maps; Projects
// is fed by the live portfolio API and About's featured slot by the blog API,
// so the static pages stay in sync with real content. Built entirely
// client-side — pages only include this script, no per-page nav markup.
(function () {
  var nav = document.querySelector(".site-nav");
  var desktopLinks = nav && nav.querySelector(".d-md-flex");
  if (!desktopLinks || typeof api === "undefined") return;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var CARET =
    ' <svg class="mega-caret" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="6 9 12 15 18 9"/></svg>';

  var panels = [];

  function makeDropdown(href, label) {
    var trigger = desktopLinks.querySelector("a[href='" + href + "']");
    if (!trigger) return null;

    var panel = document.createElement("div");
    panel.className = "mega-panel";
    panel.setAttribute("aria-label", label);
    nav.appendChild(panel);

    trigger.classList.add("mega-trigger");
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.insertAdjacentHTML("beforeend", CARET);

    var closeTimer = null;
    function setOpen(open) {
      clearTimeout(closeTimer);
      if (open) {
        panels.forEach(function (p) { if (p !== entry) p.setOpen(false); });
      }
      panel.classList.toggle("open", open);
      trigger.classList.toggle("open", open);
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
    }
    function scheduleClose() {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(function () { setOpen(false); }, 160);
    }

    [trigger, panel].forEach(function (el) {
      el.addEventListener("mouseenter", function () { setOpen(true); });
      el.addEventListener("mouseleave", scheduleClose);
    });
    trigger.addEventListener("focus", function () { setOpen(true); });
    // No hover on touch screens: the first tap opens the panel instead of
    // navigating (mouse users hover first, so their click always passes).
    trigger.addEventListener("click", function (e) {
      if (matchMedia("(hover: none)").matches && !panel.classList.contains("open")) {
        e.preventDefault();
        setOpen(true);
      }
    });

    var entry = { trigger: trigger, panel: panel, setOpen: setOpen };
    panels.push(entry);
    return entry;
  }

  function remove(entry) {
    entry.panel.remove();
    entry.trigger.classList.remove("mega-trigger");
    entry.trigger.removeAttribute("aria-haspopup");
    entry.trigger.removeAttribute("aria-expanded");
    var caret = entry.trigger.querySelector(".mega-caret");
    if (caret) caret.remove();
    panels.splice(panels.indexOf(entry), 1);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") panels.forEach(function (p) { p.setOpen(false); });
  });
  // Close on click or keyboard focus landing outside the trigger + panel.
  ["click", "focusin"].forEach(function (type) {
    document.addEventListener(type, function (e) {
      panels.forEach(function (p) {
        if (
          p.panel.classList.contains("open") &&
          !p.panel.contains(e.target) &&
          !p.trigger.contains(e.target)
        ) {
          p.setOpen(false);
        }
      });
    });
  });

  function col(label, inner) {
    return '<div class="mega-col"><p class="mega-label">// ' + label + "</p>" + inner + "</div>";
  }
  function link(href, label, meta) {
    return '<a class="mega-link" href="' + href + '">' + esc(label)
      + (meta ? '<span class="mega-meta">' + esc(meta) + "</span>" : "")
      + "</a>";
  }
  function item(href, index, title, tag) {
    return '<a class="mega-item" href="' + href + '">'
      + '<span class="mega-index">' + esc(index) + "</span>"
      + '<span class="mega-title">' + esc(title) + "</span>"
      + '<span class="mega-tag">' + esc(tag) + "</span></a>";
  }
  function featured(href, title, blurb, cta) {
    return '<a class="mega-featured" href="' + href + '">'
      + "<strong>" + esc(title) + "</strong>"
      + "<span>" + esc(blurb) + "</span>"
      + '<span class="mega-cta">' + esc(cta) + " &rarr;</span></a>";
  }

  /* ---- About ---------------------------------------------------------- */
  var about = makeDropdown("/about.html", "About");
  if (about) {
    about.panel.innerHTML =
      '<div class="container mega-grid">'
      + col("GET TO KNOW ME",
          link("/about.html", "The story so far")
        + link("/about.html#principles", "Engineering principles")
        + link("/about.html#career-timeline", "Career timeline")
        + link("/about.html#github-feed-section", "GitHub activity"))
      + col("PROOF & ARCHIVE",
          link("/testimonials.html", "Client testimonials")
        + link("/blog.html", "Technical archive")
        + link("/search.html", "Search the site"))
      + '<div class="mega-col" data-slot="about-featured"></div>'
      + "</div>";
    api.get("/api/v1/blog").then(function (posts) {
      var post = (posts || [])[0];
      if (!post) return;
      about.panel.querySelector("[data-slot='about-featured']").innerHTML =
        '<p class="mega-label">// FROM THE ARCHIVE</p>'
        + featured(
            "/blog-post.html?slug=" + encodeURIComponent(post.slug),
            post.title,
            String(post.excerpt || "").slice(0, 140),
            "Open technical breakdown");
    }).catch(function () {});
  }

  /* ---- Services ------------------------------------------------------- */
  var services = makeDropdown("/services.html", "Services");
  if (services) {
    services.panel.innerHTML =
      '<div class="container mega-grid">'
      + col("SERVICE TRACKS",
          '<div class="mega-items">'
        + item("/services.html#track-01", "01", "Custom builds from scratch", "System build")
        + item("/services.html#track-02", "02", "CMS development & ecosystems", "Content ops")
        + item("/services.html#track-03", "03", "Mobile app engineering", "Mobile")
        + item("/services.html#track-04", "04", "Custom AI integrations", "AI")
        + "</div>")
      + col("ENGAGEMENT",
          link("/pricing.html", "Pricing & packages")
        + link("/#estimator", "Scope your project")
        + link("/book.html", "Book a discovery call")
        + link("/request.html", "Request a project"))
      + col("NOT SURE WHERE TO START",
          featured(
            "/book.html",
            "Book a 20-minute discovery call",
            "Walk through what you're trying to build and get a straight read on scope, cost, and timeline — no obligation.",
            "Pick a time"))
      + "</div>";
  }

  /* ---- Projects ------------------------------------------------------- */
  // Shared with projects.html's ?platform= filter — keep the two in sync by
  // exposing the classifier rather than duplicating it.
  function platformOf(p) {
    var hay = ((p.tags || []).map(function (t) { return t.name; }).join(" ")
      + " " + (p.title || "") + " " + (p.summary || "")).toLowerCase();
    if (/e-?commerce|storefront|shopfront|\bshop\b|\bstore\b|paystack|woocommerce|checkout/.test(hay)) return "ecommerce";
    if (/mobile|android|\bios\b|react native|flutter/.test(hay)) return "mobile";
    return "webapp";
  }
  window.navPlatformOf = platformOf;

  var projects = makeDropdown("/projects.html", "Projects");
  if (projects) {
    api.get("/api/v1/projects").then(function (list) {
      list = list || [];
      if (!list.length) { remove(projects); return; }

      var counts = { ecommerce: 0, webapp: 0, mobile: 0 };
      list.forEach(function (p) { counts[platformOf(p)]++; });
      var platformRows = [
        { label: "All projects", href: "/projects.html", count: list.length },
        { label: "E-commerce", href: "/projects.html?platform=ecommerce", count: counts.ecommerce },
        { label: "Web apps", href: "/projects.html?platform=webapp", count: counts.webapp },
        { label: "Mobile apps", href: "/projects.html?platform=mobile", count: counts.mobile },
      ].map(function (r) {
        return link(r.href, r.label, String(r.count));
      }).join("");

      var items = list.slice(0, 6).map(function (p, i) {
        var tag = (p.tags && p.tags[0] && p.tags[0].name) ? p.tags[0].name : "Build";
        return item(
          "/project.html?slug=" + encodeURIComponent(p.slug),
          String(i + 1).padStart(2, "0"), p.title, tag);
      }).join("");

      var star = list.find(function (p) { return p.is_featured; }) || list[0];
      projects.panel.innerHTML =
        '<div class="container mega-grid">'
        + col("PLATFORMS", platformRows)
        + col("PRODUCTION LOGS", '<div class="mega-items">' + items + "</div>")
        + col("HAVE YOU SEEN",
            featured(
              "/project.html?slug=" + encodeURIComponent(star.slug),
              star.title,
              String(star.summary || "").slice(0, 140),
              "View case study"))
        + "</div>";
    }).catch(function () { remove(projects); });
  }
})();
