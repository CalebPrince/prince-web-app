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

  // Live Chat toggle button — on by default, hidden only if explicitly turned off
  const chatToggle = document.getElementById("ai-widget-toggle");
  if (chatToggle && content.live_chat_enabled === "0") {
    chatToggle.classList.add("d-none");
  }

  // Floating WhatsApp contact button — hidden unless a link is configured
  // and the widget hasn't been explicitly turned off
  const whatsappOn = content.whatsapp_button_enabled !== "0";
  const whatsappBtn = document.getElementById("whatsapp-float-btn");
  if (whatsappBtn && content.social_whatsapp && whatsappOn) {
    whatsappBtn.href = content.social_whatsapp;
    whatsappBtn.classList.remove("d-none");
  }

  // Contact page's own WhatsApp row (separate element, same source setting)
  const contactWhatsappRow = document.getElementById("contact-whatsapp-row");
  if (contactWhatsappRow && content.social_whatsapp && whatsappOn) {
    document.getElementById("contact-whatsapp-link").href = content.social_whatsapp;
    contactWhatsappRow.classList.remove("d-none");
  }

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

  // Bulleted lists: one line per <li>, replacing the static fallback items
  document.querySelectorAll("[data-content-list]").forEach(el => {
    const value = content[el.dataset.contentList];
    if (!value) return;
    el.innerHTML = "";
    value.split("\n").map(line => line.trim()).filter(Boolean).forEach(line => {
      const li = document.createElement("li");
      li.textContent = line;
      el.appendChild(li);
    });
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

  // Footer social links, built only when at least one is set — icons, not text
  const socialIcons = {
    social_github: {
      label: "GitHub",
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.725-4.042-1.61-4.042-1.61-.546-1.385-1.333-1.754-1.333-1.754-1.09-.744.084-.729.084-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.42-1.305.763-1.605-2.665-.303-5.466-1.332-5.466-5.93 0-1.31.469-2.38 1.236-3.22-.124-.303-.536-1.523.117-3.176 0 0 1.008-.322 3.301 1.23A11.5 11.5 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.655 1.653.243 2.873.12 3.176.77.84 1.235 1.91 1.235 3.22 0 4.61-2.807 5.625-5.48 5.92.43.372.823 1.102.823 2.222 0 1.606-.014 2.896-.014 3.286 0 .32.216.694.825.576C20.565 21.795 24 17.298 24 12c0-6.63-5.37-12-12-12z"/></svg>',
    },
    social_linkedin: {
      label: "LinkedIn",
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.114 20.452H3.558V9h3.556v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
    },
    social_twitter: {
      label: "Twitter/X",
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    },
    social_whatsapp: {
      label: "WhatsApp",
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.04 22h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.999-3.648-.235-.374a9.86 9.86 0 0 1-1.512-5.264c.001-5.45 4.436-9.885 9.89-9.885 2.64 0 5.122 1.031 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.002 5.45-4.437 9.89-9.886 9.89zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.304-1.654a11.86 11.86 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.49-8.198z"/></svg>',
    },
    social_email: {
      label: "Email",
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M2 4h20v16H2V4zm2 2.236V6l8 5.99L20 6v.236l-8 6.021-8-6.021zM4 8.52V18h16V8.52l-7.386 5.55a1 1 0 0 1-1.228 0L4 8.52z"/></svg>',
    },
  };

  const socials = Object.keys(socialIcons).filter(key => content[key]);

  if (socials.length) {
    document.querySelectorAll(".site-footer").forEach(footer => {
      const row = document.createElement("div");
      row.className = "container mt-2 d-flex gap-3 justify-content-center justify-content-sm-start";
      socials.forEach(key => {
        const icon = socialIcons[key];
        const a = document.createElement("a");
        let href = content[key];
        if (key === "social_email" && !href.startsWith("mailto:")) href = "mailto:" + href;
        a.href = href;
        a.innerHTML = icon.svg;
        a.setAttribute("aria-label", icon.label);
        a.title = icon.label;
        a.target = key === "social_email" ? "_self" : "_blank";
        a.rel = "noopener";
        a.className = "social-icon-link";
        row.appendChild(a);
      });
      footer.insertBefore(row, footer.lastElementChild);
    });
  }
})();
