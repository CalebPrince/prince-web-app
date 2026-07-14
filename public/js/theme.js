// Theme picker. The inline snippet in <head> already set data-theme before
// first paint (localStorage, falling back to the OS preference) — this file
// wires up the toggle button into a small popover offering every theme, and
// layers the admin's site-wide default on top for visitors who haven't
// chosen for themselves.
(function () {
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }

  var SVG_ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
  // Fixed "appearance" glyph (half-filled circle) rather than a sun/moon that
  // reflects current state — the toggle now opens a picker with more than
  // two options, not a simple on/off switch.
  var ICON_APPEARANCE = '<svg ' + SVG_ATTRS + '><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>';
  var CHECK_SVG = '<svg class="theme-check" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="20 6 9 17 4 12"/></svg>';

  var ALL_THEMES = [
    { id: "light", label: "Light", bg: "#fbfbfa" },
    { id: "dark", label: "Dark", bg: "#0b0c0e" },
    { id: "midnight", label: "Midnight", bg: "#060a14" },
    { id: "paper", label: "Paper", bg: "#f5efe0" },
  ];
  // Admin pages maintain their own, separate dark-theme color system in
  // admin.css (sidebar section colors, etc.) that doesn't cover Midnight or
  // Paper — offer just Light/Dark there so the dashboard never ends up
  // half-themed.
  var isAdminContext = !!document.querySelector('link[href*="/css/admin.css"]');
  var THEMES = isAdminContext ? ALL_THEMES.filter(t => t.id === "light" || t.id === "dark") : ALL_THEMES;
  var VALID_IDS = THEMES.map(t => t.id);

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    updateMenuChecks();
  }

  // ---- shared popover, built once and repositioned for whichever toggle was clicked ----

  var menu = null;
  var openBtn = null;

  function buildMenu() {
    var el = document.createElement("div");
    el.className = "theme-menu";
    el.setAttribute("role", "menu");
    el.innerHTML = THEMES.map(function (t) {
      return '<button type="button" class="theme-menu-item" role="menuitemradio" data-theme-id="' + t.id + '">'
        + '<span class="theme-swatch" style="background:' + t.bg + '"></span>'
        + '<span class="theme-menu-label">' + t.label + '</span>'
        + CHECK_SVG
        + "</button>";
    }).join("");
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      var item = e.target.closest(".theme-menu-item");
      if (!item) return;
      var theme = item.getAttribute("data-theme-id");
      applyTheme(theme);
      localStorage.setItem("theme", theme);
      closeMenu();
    });
    return el;
  }

  function updateMenuChecks() {
    if (!menu) return;
    var theme = currentTheme();
    menu.querySelectorAll(".theme-menu-item").forEach(function (item) {
      item.classList.toggle("active", item.getAttribute("data-theme-id") === theme);
      item.setAttribute("aria-checked", item.getAttribute("data-theme-id") === theme ? "true" : "false");
    });
  }

  function positionMenu(btn) {
    var rect = btn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 8) + "px";
    // Anchor to the button's right edge, clamped so it can't run off-screen
    // on narrow viewports.
    var left = rect.right - menu.offsetWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - menu.offsetWidth - 8));
    menu.style.left = left + "px";
  }

  function openMenu(btn) {
    if (!menu) menu = buildMenu();
    updateMenuChecks();
    menu.classList.add("open");
    positionMenu(btn);
    btn.setAttribute("aria-expanded", "true");
    openBtn = btn;
  }

  function closeMenu() {
    if (!menu) return;
    menu.classList.remove("open");
    if (openBtn) openBtn.setAttribute("aria-expanded", "false");
    openBtn = null;
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".theme-toggle");
    if (btn) {
      e.preventDefault();
      if (menu && menu.classList.contains("open") && openBtn === btn) {
        closeMenu();
      } else {
        openMenu(btn);
      }
      return;
    }
    if (menu && menu.classList.contains("open") && !e.target.closest(".theme-menu")) closeMenu();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", function () {
    if (menu && menu.classList.contains("open") && openBtn) positionMenu(openBtn);
  });

  // No explicit visitor choice yet — let the admin's site-wide default (if
  // set to something other than "match visitor's system") override the
  // OS-preference guess the inline head script made.
  if (!localStorage.getItem("theme")) {
    api.get("/api/v1/content")
      .then(content => {
        // Re-check: the visitor may have already picked a theme while this
        // request was in flight (more likely on a slow mobile connection,
        // which widens the window) — don't clobber an explicit choice they
        // made in the meantime.
        if (localStorage.getItem("theme")) return;
        if (VALID_IDS.indexOf(content.default_theme) !== -1) {
          applyTheme(content.default_theme);
        }
      })
      .catch(() => {});
  }

  document.querySelectorAll(".theme-toggle").forEach(btn => {
    btn.innerHTML = ICON_APPEARANCE;
    btn.setAttribute("aria-label", "Choose theme appearance");
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
  });
})();
