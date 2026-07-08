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
    root.querySelectorAll(".reveal").forEach(watchReveal);
    root.querySelectorAll("[data-count-to]").forEach(watchCount);
  }

  // Floating bubbles: a handful of small circles per .hero that slowly
  // rise and fade, each with randomized size/position/timing so they
  // never look mechanically identical. Skipped entirely under reduced
  // motion — the .hero-bubbles container is just never created.
  function addFloatingBubbles(hero) {
    if (hero.querySelector(".hero-bubbles")) return;
    const container = document.createElement("div");
    container.className = "hero-bubbles";
    container.setAttribute("aria-hidden", "true");
    // Some heroes are a short banner, others (homepage) also wrap a full
    // featured-project card and can run 1000px+ tall — a fixed rise
    // distance left bubbles stranded below the fold on those. Measuring
    // the actual height keeps every bubble traveling bottom-to-top.
    container.style.setProperty("--bubble-travel", `${hero.offsetHeight + 100}px`);

    const count = 7;
    for (let i = 0; i < count; i++) {
      const bubble = document.createElement("span");
      bubble.className = "floating-bubble";
      const size = 14 + Math.random() * 46; // 14–60px
      const left = Math.random() * 100; // %
      const duration = 12 + Math.random() * 10; // 12–22s
      const delay = Math.random() * duration * -1; // negative = already mid-animation on load
      const drift = (Math.random() * 60 - 30).toFixed(0) + "px"; // -30..30px sideways
      const opacity = (0.35 + Math.random() * 0.3).toFixed(2); // 0.35–0.65

      bubble.style.width = `${size}px`;
      bubble.style.height = `${size}px`;
      bubble.style.left = `${left}%`;
      bubble.style.animationDuration = `${duration}s`;
      bubble.style.animationDelay = `${delay}s`;
      bubble.style.setProperty("--bubble-drift", drift);
      bubble.style.setProperty("--bubble-opacity", opacity);

      container.appendChild(bubble);
    }

    hero.prepend(container);
  }

  function addBubblesToHeroes(root) {
    if (prefersReducedMotion) return;
    root.querySelectorAll(".hero").forEach(addFloatingBubbles);
  }

  scan(document);
  addBubblesToHeroes(document);

  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.(".reveal")) watchReveal(node);
        if (node.matches?.("[data-count-to]")) watchCount(node);
        scan(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
