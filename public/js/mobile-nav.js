// Mobile nav drawer polish. The hamburger/drawer markup is identical on
// every page (no per-page "active" link or open-state wiring), so this
// script owns both:
//  - morphing the hamburger icon into an X while the drawer is open
//  - marking whichever drawer link matches the current page as active
// The staggered link reveal + drawer slide easing are pure CSS, keyed off
// Bootstrap's own .show/.showing classes on the offcanvas element.
(function () {
  var drawer = document.getElementById("nav-drawer");
  var toggle = document.querySelector(".nav-toggle");
  if (!drawer || !toggle) return;

  drawer.addEventListener("show.bs.offcanvas", function () {
    toggle.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
  });
  drawer.addEventListener("hidden.bs.offcanvas", function () {
    toggle.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  });

  var path = location.pathname === "/" ? "/" : location.pathname.replace(/\/$/, "");
  drawer.querySelectorAll(".nav-link").forEach(function (link) {
    var href = link.getAttribute("href");
    if (href === path || (href === "/" && path === "/index.html")) {
      link.classList.add("active");
    }
  });
})();
