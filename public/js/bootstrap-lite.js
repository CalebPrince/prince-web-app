// Drop-in replacement for bootstrap.bundle.min.js's JS behavior — not a
// general Bootstrap reimplementation, only the surface this codebase
// actually uses: the `new bootstrap.Modal(el)` / `.Offcanvas` / `.Collapse`
// constructor API (instantiated directly in ~20 admin/*.js files),
// `getInstance()` / `getOrCreateInstance()`, and the standard
// data-bs-toggle/data-bs-dismiss/data-bs-target attribute wiring used in
// page markup. Bootstrap's own CSS (still loaded via CDN until each page's
// Tailwind conversion lands) already styles the .show/.showing/.collapsing/
// .fade classes and the backdrop elements — this file only toggles them
// with the same timing and dispatches the same bs.*-namespaced custom
// events (e.g. "show.bs.offcanvas") that existing listeners, like
// mobile-nav.js, already listen for. That event-name reuse is what lets
// this swap in with zero changes to any other file.
(function (global) {
  "use strict";

  var instances = new WeakMap();

  function resolve(el) {
    return typeof el === "string" ? document.querySelector(el) : el;
  }

  function getTargetOf(trigger) {
    var sel = trigger.getAttribute("data-bs-target") || trigger.getAttribute("href");
    if (!sel || sel === "#") return null;
    return document.querySelector(sel);
  }

  function dispatch(el, name, relatedTarget) {
    el.dispatchEvent(new CustomEvent(name, { bubbles: true, cancelable: true, detail: { relatedTarget: relatedTarget || null } }));
  }

  function transitionDuration(el) {
    var n = parseFloat(getComputedStyle(el).transitionDuration) || 0;
    return n * 1000;
  }

  function Backdrop(className) {
    this.el = null;
    this.className = className;
  }
  Backdrop.prototype.show = function (onClick) {
    if (this.el) return;
    this.el = document.createElement("div");
    this.el.className = this.className;
    document.body.appendChild(this.el);
    this.el.offsetHeight; // force reflow so the fade-in transition runs
    this.el.classList.add("show");
    this._onClick = onClick;
    if (onClick) this.el.addEventListener("click", onClick);
  };
  Backdrop.prototype.hide = function () {
    if (!this.el) return;
    var el = this.el;
    this.el = null;
    el.classList.remove("show");
    setTimeout(function () { el.remove(); }, transitionDuration(el) || 300);
  };

  // ---- Offcanvas ---------------------------------------------------------
  function Offcanvas(el) {
    this.el = resolve(el);
    instances.set(this.el, this);
    this.backdrop = new Backdrop("offcanvas-backdrop fade");
  }
  Offcanvas.prototype.show = function () {
    var el = this.el;
    if (el.classList.contains("show") || el.classList.contains("showing")) return;
    dispatch(el, "show.bs.offcanvas");
    document.body.classList.add("modal-open");
    el.classList.add("showing");
    el.offsetHeight;
    el.classList.add("show");
    var self = this;
    this.backdrop.show(function () { self.hide(); });
    setTimeout(function () {
      el.classList.remove("showing");
      dispatch(el, "shown.bs.offcanvas");
    }, transitionDuration(el) || 300);
  };
  Offcanvas.prototype.hide = function () {
    var el = this.el;
    if (!el.classList.contains("show")) return;
    dispatch(el, "hide.bs.offcanvas");
    el.classList.remove("show");
    el.classList.add("showing");
    this.backdrop.hide();
    var self = this;
    setTimeout(function () {
      el.classList.remove("showing");
      document.body.classList.remove("modal-open");
      dispatch(el, "hidden.bs.offcanvas");
    }, transitionDuration(el) || 300);
  };
  Offcanvas.prototype.toggle = function () { this[this.el.classList.contains("show") ? "hide" : "show"](); };
  Offcanvas.getInstance = function (el) { return instances.get(resolve(el)) || null; };
  Offcanvas.getOrCreateInstance = function (el) { el = resolve(el); return instances.get(el) || new Offcanvas(el); };

  // ---- Modal ---------------------------------------------------------
  function Modal(el) {
    this.el = resolve(el);
    instances.set(this.el, this);
    this.backdrop = new Backdrop("modal-backdrop fade");
  }
  Modal.prototype.show = function () {
    var el = this.el;
    if (el.classList.contains("show")) return;
    dispatch(el, "show.bs.modal");
    document.body.classList.add("modal-open");
    el.style.display = "block";
    el.removeAttribute("aria-hidden");
    el.setAttribute("aria-modal", "true");
    el.offsetHeight;
    el.classList.add("show");
    var self = this;
    this.backdrop.show(function () { self.hide(); });
    var dialog = el.querySelector(".modal-dialog") || el;
    setTimeout(function () { dispatch(el, "shown.bs.modal"); }, transitionDuration(dialog) || 300);
  };
  Modal.prototype.hide = function () {
    var el = this.el;
    if (!el.classList.contains("show")) return;
    dispatch(el, "hide.bs.modal");
    el.classList.remove("show");
    this.backdrop.hide();
    var dialog = el.querySelector(".modal-dialog") || el;
    setTimeout(function () {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
      el.removeAttribute("aria-modal");
      document.body.classList.remove("modal-open");
      dispatch(el, "hidden.bs.modal");
    }, transitionDuration(dialog) || 300);
  };
  Modal.prototype.toggle = function () { this[this.el.classList.contains("show") ? "hide" : "show"](); };
  Modal.getInstance = function (el) { return instances.get(resolve(el)) || null; };
  Modal.getOrCreateInstance = function (el) { el = resolve(el); return instances.get(el) || new Modal(el); };

  // ---- Collapse ---------------------------------------------------------
  function Collapse(el) {
    this.el = resolve(el);
    instances.set(this.el, this);
  }
  function syncTriggers(target, open) {
    if (!target.id) return;
    document.querySelectorAll('[data-bs-toggle="collapse"][data-bs-target="#' + target.id + '"]').forEach(function (trigger) {
      trigger.classList.toggle("collapsed", !open);
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  Collapse.prototype.show = function () {
    var el = this.el;
    if (el.classList.contains("show")) return;
    var parentSel = el.getAttribute("data-bs-parent");
    if (parentSel) {
      document.querySelectorAll(parentSel + " .collapse.show").forEach(function (sib) {
        if (sib !== el) Collapse.getOrCreateInstance(sib).hide();
      });
    }
    dispatch(el, "show.bs.collapse");
    el.classList.add("collapsing");
    el.classList.remove("collapse");
    el.style.height = el.scrollHeight + "px";
    setTimeout(function () {
      el.classList.remove("collapsing");
      el.classList.add("collapse", "show");
      el.style.height = "";
      dispatch(el, "shown.bs.collapse");
    }, transitionDuration(el) || 300);
    syncTriggers(el, true);
  };
  Collapse.prototype.hide = function () {
    var el = this.el;
    if (!el.classList.contains("show")) return;
    dispatch(el, "hide.bs.collapse");
    el.style.height = el.scrollHeight + "px";
    el.offsetHeight;
    el.classList.remove("collapse", "show");
    el.classList.add("collapsing");
    el.style.height = "0px";
    setTimeout(function () {
      el.classList.remove("collapsing");
      el.classList.add("collapse");
      el.style.height = "";
      dispatch(el, "hidden.bs.collapse");
    }, transitionDuration(el) || 300);
    syncTriggers(el, false);
  };
  Collapse.prototype.toggle = function () { this[this.el.classList.contains("show") ? "hide" : "show"](); };
  Collapse.getInstance = function (el) { return instances.get(resolve(el)) || null; };
  Collapse.getOrCreateInstance = function (el) { el = resolve(el); return instances.get(el) || new Collapse(el); };

  // ---- attribute-driven wiring (data-bs-toggle / data-bs-dismiss) -------
  var CTORS = { offcanvas: Offcanvas, modal: Modal, collapse: Collapse };

  document.addEventListener("click", function (e) {
    var toggle = e.target.closest('[data-bs-toggle="offcanvas"], [data-bs-toggle="modal"], [data-bs-toggle="collapse"]');
    if (toggle) {
      var target = getTargetOf(toggle);
      if (!target) return;
      e.preventDefault();
      CTORS[toggle.getAttribute("data-bs-toggle")].getOrCreateInstance(target).toggle();
      return;
    }
    var dismiss = e.target.closest('[data-bs-dismiss="offcanvas"], [data-bs-dismiss="modal"]');
    if (dismiss) {
      var kind = dismiss.getAttribute("data-bs-dismiss");
      var container = dismiss.closest(kind === "offcanvas" ? ".offcanvas" : ".modal");
      if (!container) return;
      e.preventDefault();
      CTORS[kind].getOrCreateInstance(container).hide();
      return;
    }
    // Clicking the modal's own backdrop area (the .modal element itself,
    // outside .modal-dialog) closes it, matching Bootstrap's default.
    if (e.target.classList && e.target.classList.contains("modal") && e.target.classList.contains("show")) {
      Modal.getOrCreateInstance(e.target).hide();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal.show").forEach(function (el) { Modal.getOrCreateInstance(el).hide(); });
    document.querySelectorAll(".offcanvas.show").forEach(function (el) { Offcanvas.getOrCreateInstance(el).hide(); });
  });

  global.bootstrap = { Modal: Modal, Offcanvas: Offcanvas, Collapse: Collapse };
})(window);
