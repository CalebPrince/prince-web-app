// Homepage hero: a subtle Three.js particle constellation behind the headline.
// Deliberately gated so the library never loads where it can't earn its cost:
// desktop-class pointers only, reduced-motion respected, WebGL required, and
// the ~85KB (gzipped) self-hosted module is fetched on idle — never in the
// critical path. The render loop pauses whenever the hero is off-screen or
// the tab is hidden. If the admin-configured hero background video is active,
// this never mounts (and unmounts if the video appears later), so the two
// background treatments can't stack.
(function () {
  const hero = document.querySelector(".home-page .agency-hero");
  if (!hero) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  function webglAvailable() {
    try {
      const c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (_) {
      return false;
    }
  }
  if (!webglAvailable()) return;

  const videoPanel = document.getElementById("hero-video-panel");
  const videoActive = () => !!videoPanel && !videoPanel.classList.contains("d-none");

  let destroyed = false;
  let destroyScene = null;

  // content.js reveals the hero video asynchronously; if that happens after
  // the scene mounted, tear the scene down rather than rendering under it.
  if (videoPanel) {
    new MutationObserver(() => {
      if (videoActive() && destroyScene) destroyScene();
    }).observe(videoPanel, { attributes: true, attributeFilter: ["class"] });
  }

  // The timeout matters: this page animates continuously (hero, marquee), so
  // requestIdleCallback without one can be starved and never fire at all.
  const onIdle = window.requestIdleCallback
    ? fn => window.requestIdleCallback(fn, { timeout: 4000 })
    : fn => setTimeout(fn, 1500);
  onIdle(() => {
    if (destroyed || videoActive()) return;
    // The scene is decorative, so failure is non-fatal — but log it, or a
    // broken vendor file/init bug is indistinguishable from the guards
    // having (correctly) skipped the effect.
    // Versioned directory: the module internally imports ./three.core.min.js,
    // so upgrades bump the folder name (not the filenames) to bust caches.
    import("/js/vendor/three-0.180.0/three.module.min.js").then(init).catch(err => {
      console.warn("hero-3d: skipped —", err);
    });
  });

  function inkColor() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
    return v || "#17181c";
  }

  function init(THREE) {
    if (destroyed || videoActive()) return;

    const panel = document.createElement("div");
    panel.className = "hero-3d-panel";
    panel.setAttribute("aria-hidden", "true");
    hero.prepend(panel);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(hero.clientWidth, hero.clientHeight);
    panel.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, hero.clientWidth / hero.clientHeight, 1, 400);
    camera.position.z = 95;

    const group = new THREE.Group();
    scene.add(group);

    // Particle field: a wide, shallow box so the points read as a drifting
    // plane of "signals" behind the text rather than a centered blob.
    const COUNT = 240;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 320;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 140;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pointsMat = new THREE.PointsMaterial({
      color: inkColor(),
      size: 1.9,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true,
      depthWrite: false,
    });
    group.add(new THREE.Points(pointsGeo, pointsMat));

    // Constellation lines between nearby points, computed once at build.
    const linePositions = [];
    const THRESHOLD = 34;
    for (let i = 0; i < COUNT; i++) {
      for (let j = i + 1; j < COUNT; j++) {
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < THRESHOLD * THRESHOLD) {
          linePositions.push(
            positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
            positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]
          );
        }
      }
    }
    const linesGeo = new THREE.BufferGeometry();
    linesGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(linePositions), 3));
    const linesMat = new THREE.LineBasicMaterial({
      color: inkColor(),
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    });
    group.add(new THREE.LineSegments(linesGeo, linesMat));

    // One slow wireframe icosahedron, offset right so it sits behind the
    // hero's value panel column — texture, not a focal point.
    const icoGeo = new THREE.IcosahedronGeometry(30, 1);
    const icoMat = new THREE.MeshBasicMaterial({
      color: inkColor(),
      wireframe: true,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    const ico = new THREE.Mesh(icoGeo, icoMat);
    ico.position.set(70, -6, -20);
    group.add(ico);

    // Theme toggle swaps --ink between near-black and near-white; follow it.
    const themeObserver = new MutationObserver(() => {
      const c = inkColor();
      pointsMat.color.set(c);
      linesMat.color.set(c);
      icoMat.color.set(c);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // Pointer parallax: ease toward the cursor instead of snapping to it.
    let targetX = 0;
    let targetY = 0;
    const onPointerMove = e => {
      const rect = hero.getBoundingClientRect();
      targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    const onPointerLeave = () => {
      targetX = 0;
      targetY = 0;
    };
    hero.addEventListener("pointermove", onPointerMove);
    hero.addEventListener("pointerleave", onPointerLeave);

    let rafId = 0;
    let running = false;
    const clock = new THREE.Clock();

    function frame() {
      if (!running) return;
      const t = clock.getElapsedTime();
      group.rotation.y += ((targetX * 0.12) - group.rotation.y) * 0.04 + 0.0004;
      group.rotation.x += ((targetY * 0.08) - group.rotation.x) * 0.04;
      group.position.y = Math.sin(t * 0.3) * 2;
      ico.rotation.x = t * 0.08;
      ico.rotation.y = t * 0.12;
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(frame);
    }

    let heroVisible = true;
    function syncRunning() {
      const shouldRun = heroVisible && !document.hidden && !destroyed;
      if (shouldRun && !running) {
        running = true;
        clock.start();
        rafId = requestAnimationFrame(frame);
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(rafId);
      }
    }

    const visObserver = new IntersectionObserver(entries => {
      heroVisible = entries[0].isIntersecting;
      syncRunning();
    });
    visObserver.observe(hero);
    const onVisibility = () => syncRunning();
    document.addEventListener("visibilitychange", onVisibility);

    const onResize = () => {
      renderer.setSize(hero.clientWidth, hero.clientHeight);
      camera.aspect = hero.clientWidth / hero.clientHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    destroyScene = () => {
      destroyed = true;
      running = false;
      cancelAnimationFrame(rafId);
      visObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      hero.removeEventListener("pointermove", onPointerMove);
      hero.removeEventListener("pointerleave", onPointerLeave);
      pointsGeo.dispose();
      linesGeo.dispose();
      icoGeo.dispose();
      pointsMat.dispose();
      linesMat.dispose();
      icoMat.dispose();
      renderer.dispose();
      panel.remove();
    };

    syncRunning();
    // First frame is rendered before the fade-in starts, so the canvas never
    // pops in half-drawn.
    renderer.render(scene, camera);
    requestAnimationFrame(() => panel.classList.add("is-live"));
  }
})();
