// Framer Motion (motion.dev) enhancement layer for the homepage.
// Keeps existing CSS/IO reveals intact while adding scroll-linked movement
// and an atmospheric, non-video hero.
(async function () {
  if (!document.body.classList.contains("home-page")) return;

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var lowCpu = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4;
  var lowMemory = typeof navigator.deviceMemory === "number" && navigator.deviceMemory > 0 && navigator.deviceMemory <= 4;
  var perfLite = saveData || lowCpu || lowMemory;
  if (prefersReduced || perfLite) {
    document.documentElement.classList.add("perf-lite");
    return;
  }

  var motion;
  try {
    await new Promise((resolve) => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(function () { resolve(); }, { timeout: 1300 });
      } else {
        window.setTimeout(resolve, 350);
      }
    });
    motion = await import("https://cdn.jsdelivr.net/npm/motion/+esm");
  } catch (err) {
    console.warn("home-motion: Framer Motion import skipped", err);
    return;
  }

  var animate = motion.animate;
  var inView = motion.inView;
  var scroll = motion.scroll;
  var stagger = motion.stagger;

  if (typeof animate !== "function" || typeof scroll !== "function") return;

  document.documentElement.classList.add("motion-enhanced");

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function map(value, inMin, inMax, outMin, outMax) {
    if (inMax === inMin) return outMin;
    var t = clamp((value - inMin) / (inMax - inMin), 0, 1);
    return outMin + (outMax - outMin) * t;
  }

  var motionSetting = document.documentElement.getAttribute("data-hero-motion") || "normal";
  var motionScale = motionSetting === "subtle" ? 0.65 : (motionSetting === "bold" ? 1.28 : 1);

  var hero = document.querySelector(".home-page .agency-hero");
  if (hero) {
    var heroAtmosphere = hero.querySelector(".hero-atmosphere");
    var heroOrbs = hero.querySelectorAll(".hero-orb");
    var heroGrid = hero.querySelector(".hero-grid");
    var heroContainer = hero.querySelector(":scope > .container");

    if (heroAtmosphere) {
      animate(
        heroAtmosphere,
        {
          opacity: [0, 1],
          transform: ["scale(1.08)", "scale(1)"],
        },
        {
          duration: 1.2,
          easing: [0.22, 1, 0.36, 1],
        }
      );

      scroll(
        function (progress) {
          var p = clamp(progress, 0, 1);
          var atmosphereScale = map(p, 0, 1, 1, 1 + (0.08 * motionScale));
          var atmosphereY = map(p, 0, 1, 0, 62 * motionScale);
          heroAtmosphere.style.transform = "translate3d(0," + atmosphereY.toFixed(2) + "px,0) scale(" + atmosphereScale.toFixed(4) + ")";
          heroAtmosphere.style.opacity = String(map(p, 0, 1, 1, 0.74));

          heroOrbs.forEach(function (orb, idx) {
            var drift = (idx + 1) * 8 * motionScale;
            var x = Math.sin((p + idx * 0.1) * Math.PI) * drift;
            var y = map(p, 0, 1, 0, -drift * 0.7);
            orb.style.transform = "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0)";
          });

          if (heroGrid) {
            heroGrid.style.transform = "translate3d(0," + map(p, 0, 1, 0, -38 * motionScale).toFixed(2) + "px,0)";
            heroGrid.style.opacity = String(map(p, 0, 1, 0.95, 0.58));
          }
        },
        {
          target: hero,
          offset: ["start start", "end start"],
        }
      );
    }

    var heroAccentBlocks = hero.querySelectorAll(".hero-side-stack, .hero-proof-line, .live-channel-rail");
    if (heroAccentBlocks.length) {
      animate(
        heroAccentBlocks,
        {
          opacity: [0, 1],
          transform: ["translateY(36px)", "translateY(0px)"],
          filter: ["blur(8px)", "blur(0px)"],
        },
        {
          duration: 0.95,
          delay: stagger(0.1, { startDelay: 0.18 }),
          easing: [0.19, 1, 0.22, 1],
        }
      );
    }

    if (heroContainer) {
      scroll(
        function (progress) {
          var p = clamp(progress, 0, 1);
          var y = map(p, 0, 1, 0, -38 * motionScale);
          heroContainer.style.transform = "translate3d(0," + y.toFixed(2) + "px,0)";
          heroContainer.style.opacity = String(map(p, 0, 1, 1, 0.76));
        },
        {
          target: hero,
          offset: ["start start", "end start"],
        }
      );
    }
  }

  var movingSections = document.querySelectorAll("[data-motion-section]");
  movingSections.forEach(function (section, index) {
    var amplitude = (Number(section.getAttribute("data-motion-distance")) || 56) * motionScale;
    var direction = index % 2 === 0 ? 1 : -1;

    inView(section, function () {
      animate(
        section,
        {
          opacity: [0.78, 1],
          filter: ["blur(5px)", "blur(0px)"],
        },
        {
          duration: 0.7,
          easing: [0.19, 1, 0.22, 1],
        }
      );
    }, { amount: 0.28 });

    scroll(
      function (progress) {
        var p = clamp(progress, 0, 1);
        var centered = p * 2 - 1;
        var y = centered * amplitude * 0.32;
        var x = direction * Math.sin(p * Math.PI) * amplitude * 0.09;
        section.style.transform = "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0)";
      },
      {
        target: section,
        offset: ["start end", "end start"],
      }
    );
  });
})();
