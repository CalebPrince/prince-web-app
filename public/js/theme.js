// Light/dark toggle. The inline snippet in <head> already set data-theme
// before first paint (localStorage, falling back to the OS preference) —
// this file just wires up the toggle button and layers the admin's
// site-wide default on top for visitors who haven't chosen for themselves.
(function () {
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }

  function updateToggleIcons(theme) {
    document.querySelectorAll(".theme-toggle").forEach(btn => {
      btn.textContent = theme === "dark" ? "☀️" : "🌙";
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
