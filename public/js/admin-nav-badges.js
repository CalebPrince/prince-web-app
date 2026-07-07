// Sidebar notification badges (Inquiries / Chat Leads), shared by every admin
// page. Polls periodically so a badge clears soon after the admin reads the
// section on another tab, without needing a full page reload.
(function () {
  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function buildRowSummary(row) {
    const cells = Array.from(row.querySelectorAll("th, td"));
    const parts = [];
    for (const cell of cells) {
      const text = normalizeText(cell.textContent);
      if (text) parts.push(text);
      if (parts.length >= 3) break;
    }
    return parts.join(" | ");
  }

  function attachTooltip(el, title) {
    if (!el || !title || typeof bootstrap === "undefined" || !bootstrap.Tooltip) return;
    if (el.dataset.tooltipReady === "1") {
      const instance = bootstrap.Tooltip.getInstance(el);
      if (instance) instance.setContent({ ".tooltip-inner": title });
      el.setAttribute("data-bs-title", title);
      return;
    }
    el.setAttribute("data-bs-toggle", "tooltip");
    el.setAttribute("data-bs-placement", "top");
    el.setAttribute("data-bs-title", title);
    el.dataset.tooltipReady = "1";
    bootstrap.Tooltip.getOrCreateInstance(el, {
      container: "body",
      trigger: "hover focus"
    });
  }

  function applyCardTooltips() {
    document.querySelectorAll(".admin-card").forEach((card) => {
      const label = normalizeText(
        card.querySelector(".stat-label")?.textContent ||
        card.querySelector("h5, h6")?.textContent ||
        card.querySelector(".text-muted-custom.small")?.textContent
      );
      if (!label) return;
      attachTooltip(card, label);
    });
  }

  function applyHeaderTooltips() {
    document.querySelectorAll("table thead th").forEach((th) => {
      const text = normalizeText(th.textContent);
      if (!text) return;
      attachTooltip(th, `Column: ${text}`);
    });
  }

  function applyRowTooltips(root = document) {
    root.querySelectorAll("table tbody tr").forEach((row) => {
      const summary = buildRowSummary(row);
      if (!summary) return;
      attachTooltip(row, summary);
    });
  }

  function watchDynamicRows() {
    document.querySelectorAll("table tbody").forEach((tbody) => {
      const observer = new MutationObserver(() => {
        applyRowTooltips(tbody);
      });
      observer.observe(tbody, { childList: true, subtree: true });
    });
  }

  function initAdminTooltips() {
    applyCardTooltips();
    applyHeaderTooltips();
    applyRowTooltips();
    watchDynamicRows();
  }

  function setBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) {
      el.textContent = count > 99 ? "99+" : String(count);
      el.classList.remove("d-none");
    } else {
      el.classList.add("d-none");
    }
  }

  async function refreshNavBadges() {
    try {
      const counts = await api.get("/api/v1/admin/notifications");
      setBadge("nav-badge-inquiries", counts.unread_inquiries || 0);
      setBadge("nav-badge-chats", counts.unseen_chats || 0);
    } catch (_) { /* leave badges as-is on failure */ }
  }

  refreshNavBadges();
  setInterval(refreshNavBadges, 60000);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminTooltips, { once: true });
  } else {
    initAdminTooltips();
  }
})();
