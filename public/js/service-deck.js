// Stacked-card "deck" for the homepage services section. Ported from a
// 21st.dev React/Framer-Motion component to vanilla CSS transitions: every real
// card element permanently exists and cycles through role classes
// (front/middle/back/hidden/exiting) rather than swapping content, so there's
// no timing-sensitive re-render logic — just reassigning which class each
// element wears. Works for any number of cards >= 4; the three frontmost are
// visible and every card behind them sits in the hidden stack.
(function () {
  var stage = document.getElementById("service-deck-stage");
  var nextBtn = document.getElementById("service-deck-next");
  if (!stage || !nextBtn) return;

  var cards = Array.prototype.slice.call(stage.querySelectorAll(".deck-card"));
  if (cards.length < 4) return;

  var ROLE_CLASSES = ["deck-front", "deck-middle", "deck-back", "deck-hidden", "deck-exiting"];
  var VISIBLE_ROLES = ["deck-front", "deck-middle", "deck-back"];
  // order[i] = index into `cards`; the first three wear the visible roles and
  // everything after them wears deck-hidden.
  var order = cards.map(function (_, i) { return i; });
  var animating = false;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setRole(cardIndex, role) {
    var el = cards[cardIndex];
    ROLE_CLASSES.forEach(function (c) { el.classList.remove(c); });
    el.classList.add(role);
  }

  function assignRoles(list) {
    list.forEach(function (cardIndex, pos) {
      setRole(cardIndex, VISIBLE_ROLES[pos] || "deck-hidden");
    });
  }
  assignRoles(order);

  function next() {
    if (animating) return;
    animating = true;

    var exiting = order[0];
    var rest = order.slice(1);
    setRole(exiting, "deck-exiting");
    assignRoles(rest);
    order = rest.concat(exiting);

    var settle = function () {
      setRole(exiting, "deck-hidden");
      animating = false;
    };
    if (reduced) settle();
    else setTimeout(settle, 620);
  }

  nextBtn.addEventListener("click", next);
})();
