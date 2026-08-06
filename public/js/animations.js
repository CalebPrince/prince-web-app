// Lightweight, dependency-free scroll animations: reveal-on-scroll +
// number count-up. Both no-op instantly if the visitor prefers reduced motion.
// A MutationObserver picks up elements added later by fetch-driven page
// scripts (project grids, featured project cards) without those scripts
// needing to know anything about the animation system.

(function () {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supportsFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const noIO = !("IntersectionObserver" in window);
  const homeNav = document.body.classList.contains("home-page") ? document.querySelector(".site-nav") : null;
  const homeHero = document.body.classList.contains("home-page") ? document.querySelector(".home-page .agency-hero") : null;
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
    ".deck-card",
    ".home-process-step",
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

  function setupHomeNavScrollState() {
    if (!homeNav) return;
    let ticking = false;
    let navOffset = 0;

    function computeNavOffset() {
      navOffset = Math.max(0, Math.round(homeNav.getBoundingClientRect().height));
    }

    function updateNavState() {
      let shouldBeScrolled = window.scrollY > 12;
      if (homeHero) {
        const heroRect = homeHero.getBoundingClientRect();
        shouldBeScrolled = heroRect.bottom <= (navOffset + 6);
      }
      homeNav.classList.toggle("is-scrolled", shouldBeScrolled);
      homeNav.classList.toggle("is-on-hero", !shouldBeScrolled);
      ticking = false;
    }

    computeNavOffset();
    updateNavState();

    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateNavState);
    }, { passive: true });

    window.addEventListener("resize", () => {
      computeNavOffset();
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateNavState);
    });
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

  function setupStoryChapters() {
    const chapters = Array.from(document.querySelectorAll("[data-story-chapter]"));
    if (!chapters.length || noIO) return;

    const activate = (active) => {
      chapters.forEach((chapter) => chapter.classList.toggle("is-chapter-active", chapter === active));
      if (active) document.body.setAttribute("data-active-story-chapter", active.getAttribute("data-story-chapter") || "");
    };

    const chapterObserver = new IntersectionObserver(
      (entries) => {
        let candidate = null;
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          if (!candidate || entry.intersectionRatio > candidate.intersectionRatio) {
            candidate = entry;
          }
        });
        if (candidate) activate(candidate.target);
      },
      { threshold: [0.25, 0.45, 0.65], rootMargin: "-12% 0px -28% 0px" }
    );

    chapters.forEach((chapter) => chapterObserver.observe(chapter));

    // Initial chapter state on first paint.
    const inView = chapters.find((chapter) => {
      const rect = chapter.getBoundingClientRect();
      return rect.top < window.innerHeight * 0.62 && rect.bottom > window.innerHeight * 0.25;
    });
    if (inView) activate(inView);
  }

  function setupScrollMilestones() {
    if (typeof window.trackUiEvent !== "function") return;
    const fired = new Set();
    const marks = [25, 50, 75, 100];

    function updateMilestones() {
      const maxScrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const depth = Math.min(100, Math.round((window.scrollY / maxScrollable) * 100));
      marks.forEach((mark) => {
        if (depth >= mark && !fired.has(mark)) {
          fired.add(mark);
          window.trackUiEvent("scroll_depth_" + mark);
        }
      });
    }

    updateMilestones();
    window.addEventListener("scroll", updateMilestones, { passive: true });
  }

  function scan(root) {
    root.querySelectorAll(".reveal, .reveal-on-scroll").forEach(watchReveal);
    root.querySelectorAll("[data-count-to]").forEach(watchCount);
    watchDepth(root);
  }

  scan(document);
  setupHomeNavScrollState();
  setupStoryChapters();
  setupScrollMilestones();
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
