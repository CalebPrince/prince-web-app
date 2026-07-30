(function () {
  if (window.__cinematicNavReady) return;
  window.__cinematicNavReady = true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const overlay = document.createElement("div");
  overlay.className = "system-page-transition";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = '<span>BUILDER OS</span><strong id="system-transition-label">Loading system…</strong><i></i>';
  document.body.appendChild(overlay);

  const labels = {
    "/home.html": "Loading command surface…",
    "/builder-os.html": "Loading Builder OS topology…",
    "/projects.html": "Opening system registry…",
    "/project.html": "Inspecting deployed system…",
    "/services.html": "Loading capabilities…",
    "/contact.html": "Opening workflow request…",
  };

  document.addEventListener("click", event => {
    const link = event.target.closest("a[href]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target || link.hasAttribute("download")) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.href === location.href || url.hash && url.pathname === location.pathname) return;
    if (url.pathname === "/home.html") return;
    if (!/\.html$/.test(url.pathname)) return;
    event.preventDefault();
    document.getElementById("system-transition-label").textContent = labels[url.pathname] || "Loading next system…";
    overlay.classList.add("show");
    window.setTimeout(() => { location.href = url.href; }, 430);
  });

  window.addEventListener("pageshow", () => overlay.classList.remove("show"));
})();
