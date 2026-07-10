// Lightweight, dependency-free scroll animations: reveal-on-scroll +
// number count-up. Both no-op instantly if the visitor prefers reduced motion.
// A MutationObserver picks up elements added later by fetch-driven page
// scripts (project grids, featured project cards) without those scripts
// needing to know anything about the animation system.

(function () {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const noIO = !("IntersectionObserver" in window);

  const revealObserver =
    !prefersReducedMotion && !noIO
      ? new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                revealObserver.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
        )
      : null;

  function watchReveal(el) {
    if (prefersReducedMotion || noIO) {
      el.classList.add("is-visible");
    } else {
      revealObserver.observe(el);
    }
  }

  function animateCount(el) {
    const target = Number(el.dataset.countTo);
    const prefix = el.dataset.countPrefix || "";
    const suffix = el.dataset.countSuffix || "";

    if (prefersReducedMotion) {
      el.textContent = `${prefix}${target}${suffix}`;
      return;
    }

    const duration = 1200;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      el.textContent = `${prefix}${Math.round(target * eased)}${suffix}`;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const countObserver = noIO
    ? null
    : new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              animateCount(entry.target);
              countObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.5 }
      );

  function watchCount(el) {
    if (noIO) {
      animateCount(el);
    } else {
      countObserver.observe(el);
    }
  }

  function scan(root) {
    root.querySelectorAll(".reveal, .reveal-on-scroll").forEach(watchReveal);
    root.querySelectorAll("[data-count-to]").forEach(watchCount);
  }

  scan(document);

  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.(".reveal, .reveal-on-scroll")) watchReveal(node);
        if (node.matches?.("[data-count-to]")) watchCount(node);
        scan(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
