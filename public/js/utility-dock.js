// Header utility dock: the small tab glued to the top edge of the nav that
// drops down the theme / search / admin icon tray.
(function () {
  var dock = document.querySelector(".utility-dock");
  if (!dock) return;
  var tab = dock.querySelector(".utility-tab");

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
})();
