// Hydrates admin-editable site copy into the static pages. The hardcoded HTML
// is the fallback: elements only change when a value exists in the settings
// table, so an empty database renders the site exactly as authored.
(async function () {
  let content = {};
  try {
    content = await api.get("/api/v1/content");
  } catch (_) {
    return; // API down — static fallbacks stay
  }

  // Plain text swaps (also reveals d-none elements like the availability pill)
  document.querySelectorAll("[data-content]").forEach(el => {
    const value = content[el.dataset.content];
    if (value) {
      el.textContent = value;
      el.classList.remove("d-none");
    }
  });

  // Links whose href must stay in sync with the displayed value (phone/email)
  document.querySelectorAll("[data-content-href]").forEach(el => {
    const value = content[el.dataset.contentHref];
    if (!value) return;
    el.textContent = value;
    el.href = el.dataset.contentHref === "social_email" ? `mailto:${value}` : `tel:${value.replace(/[^\d+]/g, "")}`;
  });

  // Multi-paragraph blocks: blank-line-separated text becomes <p> elements
  document.querySelectorAll("[data-content-paragraphs]").forEach(el => {
    const value = content[el.dataset.contentParagraphs];
    if (!value) return;
    el.innerHTML = "";
    value.split(/\n\s*\n/).forEach(par => {
      const p = document.createElement("p");
      p.className = "text-muted-custom";
      p.textContent = par.trim();
      el.appendChild(p);
    });
    if (el.lastElementChild) el.lastElementChild.classList.add("mb-0");
  });

  // Homepage stats: value/prefix/suffix feed the count-up animation in animations.js
  const statDefs = [
    { value: "stat_1_value", suffix: "stat_1_suffix", label: "stat_1_label" },
    { value: "stat_2_value", suffix: "stat_2_suffix", label: "stat_2_label" },
    { value: "stat_3_value", suffix: "stat_3_suffix", label: "stat_3_label" },
    { value: "stat_4_value", prefix: "stat_4_prefix", suffix: "stat_4_suffix", label: "stat_4_label" },
  ];
  document.querySelectorAll(".stat-item").forEach((item, i) => {
    const def = statDefs[i];
    if (!def) return;
    const valueEl = item.querySelector(".stat-value");
    const labelEl = item.querySelector(".stat-label");
    if (valueEl && content[def.value]) {
      valueEl.dataset.countTo = content[def.value];
      valueEl.textContent = "0";
    }
    if (valueEl && def.prefix && content[def.prefix]) valueEl.dataset.countPrefix = content[def.prefix];
    if (valueEl && content[def.suffix]) valueEl.dataset.countSuffix = content[def.suffix];
    if (labelEl && content[def.label]) labelEl.textContent = content[def.label];
  });

  // Testimonials: quote/name/role per card; avatar initial derives from the name
  document.querySelectorAll(".testimonial-card").forEach((card, i) => {
    const n = i + 1;
    const quote = content[`testimonial_${n}_quote`];
    const name = content[`testimonial_${n}_name`];
    const role = content[`testimonial_${n}_role`];
    if (quote) {
      const el = card.querySelector(".testimonial-quote");
      if (el) el.textContent = `"${quote}"`;
    }
    if (name) {
      const nameEl = card.querySelector(".fw-semibold");
      if (nameEl) nameEl.textContent = name;
      const avatarEl = card.querySelector(".testimonial-avatar");
      if (avatarEl) avatarEl.textContent = name.trim().charAt(0).toUpperCase();
    }
    if (role) {
      const roleEl = card.querySelector(".small.text-muted-custom");
      if (roleEl) roleEl.textContent = role;
    }
  });

  // Tech badges: comma-separated list rebuilds the badge row
  const badges = document.getElementById("tech-badges");
  if (badges && content.tech_badges) {
    badges.querySelectorAll(".tech-badge").forEach(b => b.remove());
    content.tech_badges.split(",").map(t => t.trim()).filter(Boolean).forEach(name => {
      const span = document.createElement("span");
      span.className = "tech-badge";
      span.textContent = name;
      badges.appendChild(span);
    });
  }

  // Footer social links, built only when at least one is set
  const socials = [
    ["social_github", "GitHub"],
    ["social_linkedin", "LinkedIn"],
    ["social_twitter", "Twitter/X"],
    ["social_whatsapp", "WhatsApp"],
    ["social_email", "Email"],
  ].filter(([key]) => content[key]);

  if (socials.length) {
    document.querySelectorAll(".site-footer").forEach(footer => {
      const row = document.createElement("div");
      row.className = "container mt-2 d-flex gap-4 justify-content-center justify-content-sm-start";
      socials.forEach(([key, label]) => {
        const a = document.createElement("a");
        let href = content[key];
        if (key === "social_email" && !href.startsWith("mailto:")) href = "mailto:" + href;
        a.href = href;
        a.textContent = label;
        a.target = key === "social_email" ? "_self" : "_blank";
        a.rel = "noopener";
        a.className = "small";
        row.appendChild(a);
      });
      footer.insertBefore(row, footer.lastElementChild);
    });
  }
})();
