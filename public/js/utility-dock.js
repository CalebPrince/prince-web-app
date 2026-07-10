// Header utility dock: the small tab glued to the top edge of the nav that
// drops down the theme / search / admin icon tray.
(function () {
  var dock = document.querySelector(".utility-dock");
  if (!dock) return;
  var tab = dock.querySelector(".utility-tab");
  var lastSearchTrigger = null;

  function setOpen(open) {
    dock.classList.toggle("open", open);
    tab.setAttribute("aria-expanded", open ? "true" : "false");
  }

  tab.addEventListener("click", function () {
    setOpen(!dock.classList.contains("open"));
  });

  // Close when clicking anywhere outside the dock, or on Escape.
  document.addEventListener("click", function (e) {
    if (dock.classList.contains("open") && !dock.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && dock.classList.contains("open")) {
      setOpen(false);
      tab.focus();
    }
  });

  function escapeHtml(value) {
    var div = document.createElement("div");
    div.textContent = value == null ? "" : value;
    return div.innerHTML;
  }

  function createSearchPopup() {
    var popup = document.createElement("div");
    popup.className = "site-search-popup";
    popup.setAttribute("aria-hidden", "true");
    popup.innerHTML = [
      '<div class="site-search-backdrop" data-search-close></div>',
      '<section class="site-search-panel" role="dialog" aria-modal="true" aria-labelledby="site-search-title">',
      '  <button type="button" class="site-search-close" aria-label="Close search" data-search-close>&times;</button>',
      '  <p class="eyebrow mb-2">// Search</p>',
      '  <h2 class="h4 mb-3" id="site-search-title">Find a project or article.</h2>',
      '  <form class="site-search-form">',
      '    <input type="search" class="form-control form-control-lg" placeholder="e.g. booking app, SEO, WordPress..." autocomplete="off">',
      '    <button type="submit" class="btn-brand">Search</button>',
      '  </form>',
      '  <div class="site-search-status text-muted-custom"></div>',
      '  <div class="site-search-results"></div>',
      '  <div class="site-search-empty text-muted-custom d-none">No matches yet. Try a different word, or <a href="/contact.html">ask directly</a>.</div>',
      '</section>'
    ].join("");
    document.body.appendChild(popup);
    return popup;
  }

  var searchPopup = null;

  function getSearchApi(path) {
    if (window.api && typeof window.api.get === "function") return window.api.get(path);
    return fetch(path, { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    });
  }

  function renderResults(container, results) {
    container.innerHTML = results.map(function (result) {
      return [
        '<a class="site-search-result" href="' + escapeHtml(result.url) + '">',
        '  <img src="' + escapeHtml(result.image) + '" alt="' + escapeHtml(result.title) + '">',
        '  <span>',
        '    <small>' + (result.type === "project" ? "Project" : "Blog Post") + '</small>',
        '    <strong>' + escapeHtml(result.title) + '</strong>',
        '    <em>' + escapeHtml(result.snippet) + '</em>',
        '  </span>',
        '</a>'
      ].join("");
    }).join("");
  }

  async function runPopupSearch(popup, query) {
    var status = popup.querySelector(".site-search-status");
    var resultsEl = popup.querySelector(".site-search-results");
    var empty = popup.querySelector(".site-search-empty");

    resultsEl.innerHTML = "";
    empty.classList.add("d-none");

    if (!query) {
      status.textContent = "";
      return;
    }

    status.textContent = "Searching...";
    try {
      var data = await getSearchApi("/api/v1/search?q=" + encodeURIComponent(query));
      var results = data.results || [];
      if (!results.length) {
        status.textContent = "";
        empty.classList.remove("d-none");
        return;
      }
      status.textContent = results.length + " result" + (results.length === 1 ? "" : "s") + ' for "' + query + '"';
      renderResults(resultsEl, results);
    } catch (_) {
      status.textContent = "Search is unavailable right now. Please try again in a moment.";
    }
  }

  function openSearchPopup(trigger) {
    lastSearchTrigger = trigger || null;
    if (!searchPopup) {
      searchPopup = createSearchPopup();
      var form = searchPopup.querySelector(".site-search-form");
      var input = form.querySelector("input");

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        runPopupSearch(searchPopup, input.value.trim());
      });

      searchPopup.addEventListener("click", function (e) {
        if (e.target.closest("[data-search-close]")) closeSearchPopup();
      });
    }

    setOpen(false);
    searchPopup.classList.add("open");
    searchPopup.setAttribute("aria-hidden", "false");
    document.body.classList.add("site-search-open");
    setTimeout(function () {
      searchPopup.querySelector("input").focus();
    }, 80);
  }

  function closeSearchPopup() {
    if (!searchPopup || !searchPopup.classList.contains("open")) return;
    searchPopup.classList.remove("open");
    searchPopup.setAttribute("aria-hidden", "true");
    document.body.classList.remove("site-search-open");
    if (lastSearchTrigger) lastSearchTrigger.focus();
  }

  document.querySelectorAll(".nav-search-btn").forEach(function (button) {
    button.addEventListener("click", function (e) {
      e.preventDefault();
      openSearchPopup(button);
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSearchPopup();
  });
})();
