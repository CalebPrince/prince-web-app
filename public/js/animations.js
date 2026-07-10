// Lightweight, dependency-free scroll animations: reveal-on-scroll +
// number count-up. Both no-op instantly if the visitor prefers reduced motion.
// A MutationObserver picks up elements added later by fetch-driven page
// scripts (project grids, featured project cards) without those scripts
// needing to know anything about the animation system.

(function () {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supportsFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const noIO = !("IntersectionObserver" in window);
  const depthSelector = [
    ".service-card",
    ".project-card",
    ".pricing-card",
    ".testimonial-card",
    ".case-code-card",
    ".hero-value-panel",
    ".planner-shell",
    ".capability-panel",
    ".ai-booking-panel",
  ].join(",");

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

  function addDepthCard(el) {
    if (prefersReducedMotion || !supportsFinePointer || el.dataset.depthReady === "1") return;
    if (el.parentElement?.closest(".depth-card")) return;
    el.dataset.depthReady = "1";
    el.classList.add("depth-card");

    el.addEventListener("pointermove", (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.setProperty("--tilt-x", `${(-y * 7).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(x * 7).toFixed(2)}deg`);
      el.style.setProperty("--glow-x", `${((x + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--glow-y", `${((y + 0.5) * 100).toFixed(1)}%`);
      el.classList.add("is-depth-active");
    });

    el.addEventListener("pointerleave", () => {
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
      el.classList.remove("is-depth-active");
    });
  }

  function watchDepth(root) {
    if (prefersReducedMotion || !supportsFinePointer) return;
    if (root.matches?.(depthSelector)) addDepthCard(root);
    root.querySelectorAll(depthSelector).forEach(addDepthCard);
  }

  function setupHeroDepth() {
    if (prefersReducedMotion || !supportsFinePointer) return;
    const hero = document.querySelector(".home-page .agency-hero");
    if (!hero) return;

    hero.classList.add("hero-depth");
    hero.addEventListener("pointermove", (e) => {
      const rect = hero.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      hero.style.setProperty("--hero-depth-x", x.toFixed(3));
      hero.style.setProperty("--hero-depth-y", y.toFixed(3));
    });
    hero.addEventListener("pointerleave", () => {
      hero.style.setProperty("--hero-depth-x", "0");
      hero.style.setProperty("--hero-depth-y", "0");
    });
  }

  function scan(root) {
    root.querySelectorAll(".reveal, .reveal-on-scroll").forEach(watchReveal);
    root.querySelectorAll("[data-count-to]").forEach(watchCount);
    watchDepth(root);
  }

  scan(document);
  setupHeroDepth();

  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.(".reveal, .reveal-on-scroll")) watchReveal(node);
        if (node.matches?.("[data-count-to]")) watchCount(node);
        if (node.matches?.(depthSelector)) addDepthCard(node);
        scan(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();
