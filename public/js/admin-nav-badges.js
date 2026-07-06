// Sidebar notification badges (Inquiries / Chat Leads), shared by every admin
// page. Polls periodically so a badge clears soon after the admin reads the
// section on another tab, without needing a full page reload.
(function () {
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
})();
