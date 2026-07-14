// Stacked-card "deck" for the homepage services section. Ported from a
// 21st.dev React/Framer-Motion component to vanilla CSS transitions: 4 real
// card elements permanently exist and cycle through 5 role classes
// (front/middle/back/hidden/exiting) rather than swapping content, so there's
// no timing-sensitive re-render logic — just reassigning which class each
// element wears.
(function () {
  var stage = document.getElementById("service-deck-stage");
  var nextBtn = document.getElementById("service-deck-next");
  if (!stage || !nextBtn) return;

  var cards = Array.prototype.slice.call(stage.querySelectorAll(".deck-card"));
  if (cards.length < 4) return;

  var ROLE_CLASSES = ["deck-front", "deck-middle", "deck-back", "deck-hidden", "deck-exiting"];
  var ROLES = ["deck-front", "deck-middle", "deck-back", "deck-hidden"];
  // order[i] = index into `cards` currently wearing ROLES[i]
  var order = [0, 1, 2, 3];
  var animating = false;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setRole(cardIndex, role) {
    var el = cards[cardIndex];
    ROLE_CLASSES.forEach(function (c) { el.classList.remove(c); });
    el.classList.add(role);
  }

  function applyOrder() {
    order.forEach(function (cardIndex, roleIndex) {
      setRole(cardIndex, ROLES[roleIndex]);
    });
  }
  applyOrder();

  function next() {
    if (animating) return;
    animating = true;

    var exiting = order[0];
    setRole(exiting, "deck-exiting");
    setRole(order[1], "deck-front");
    setRole(order[2], "deck-middle");
    setRole(order[3], "deck-back");
    order = [order[1], order[2], order[3], exiting];

    var settle = function () {
      setRole(exiting, "deck-hidden");
      animating = false;
    };
    if (reduced) settle();
    else setTimeout(settle, 620);
  }

  nextBtn.addEventListener("click", next);
})();
