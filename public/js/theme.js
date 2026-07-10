// Light/dark toggle. The inline snippet in <head> already set data-theme
// before first paint (localStorage, falling back to the OS preference) —
// this file just wires up the toggle button and layers the admin's
// site-wide default on top for visitors who haven't chosen for themselves.
(function () {
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }

  var SVG_ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
  var ICON_SUN = '<svg ' + SVG_ATTRS + '><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  var ICON_MOON = '<svg ' + SVG_ATTRS + '><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function updateToggleIcons(theme) {
    document.querySelectorAll(".theme-toggle").forEach(btn => {
      btn.innerHTML = theme === "dark" ? ICON_SUN : ICON_MOON;
      btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    updateToggleIcons(theme);
  }

  // No explicit visitor choice yet — let the admin's site-wide default (if
  // set to something other than "match visitor's system") override the
  // OS-preference guess the inline head script made.
  if (!localStorage.getItem("theme")) {
    api.get("/api/v1/content")
      .then(content => {
        // Re-check: the visitor may have already clicked the toggle while
        // this request was in flight (more likely on a slow mobile
        // connection, which widens the window) — don't clobber an explicit
        // choice they made in the meantime.
        if (localStorage.getItem("theme")) return;
        if (content.default_theme === "light" || content.default_theme === "dark") {
          applyTheme(content.default_theme);
        }
      })
      .catch(() => {});
  }

  document.querySelectorAll(".theme-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem("theme", next);
    });
  });

  updateToggleIcons(currentTheme());
})();
