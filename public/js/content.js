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
