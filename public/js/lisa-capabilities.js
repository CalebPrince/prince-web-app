(function () {
  "use strict";
  var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-lisa-scenario]"));
  var panels = Array.prototype.slice.call(document.querySelectorAll("[data-scenario-panel]"));
  if (!tabs.length || !panels.length) return;

  function activate(name, scrollOnMobile) {
    tabs.forEach(function (tab) {
      var selected = tab.getAttribute("data-lisa-scenario") === name;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.setAttribute("tabindex", selected ? "0" : "-1");
    });
    panels.forEach(function (panel) {
      var selected = panel.getAttribute("data-scenario-panel") === name;
      panel.hidden = !selected;
      if (selected) {
        panel.classList.remove("scenario-enter");
        void panel.offsetWidth;
        panel.classList.add("scenario-enter");
        if (scrollOnMobile && window.matchMedia("(max-width: 767px)").matches) panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () { activate(tab.getAttribute("data-lisa-scenario"), true); });
    tab.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      var next = (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      activate(tabs[next].getAttribute("data-lisa-scenario"), false);
    });
  });
})();
