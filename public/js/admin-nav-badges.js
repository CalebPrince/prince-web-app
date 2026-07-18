// Sidebar notification badges (Inquiries / Chat Leads), shared by every admin
// page. Polls periodically so a badge clears soon after the admin reads the
// section on another tab, without needing a full page reload.
(function () {
  const ADMIN_PAGE_SIZE = 10;

  // Pipeline is a cross-source view, so add it once from this shared admin
  // script instead of duplicating another static link across every page.
  function injectPipelineNav() {
    const nav = document.querySelector('.admin-sidebar nav');
    if (!nav || nav.querySelector('a[href="/admin/pipeline.html"]')) return;
    const contacts = nav.querySelector('a[href="/admin/contacts.html"]');
    if (!contacts) return;
    const link = document.createElement('a');
    link.href = '/admin/pipeline.html';
    link.className = 'nav-link' + (location.pathname.endsWith('/admin/pipeline.html') ? ' active' : '');
    link.innerHTML = '<i class="bi bi-kanban nav-icon" style="color: var(--section-leads)"></i><span class="nav-label">Pipeline</span>';
    contacts.insertAdjacentElement('afterend', link);
  }
  injectPipelineNav();
  function injectNotificationsNav() {
    const nav = document.querySelector('.admin-sidebar nav');
    if (!nav || nav.querySelector('a[href="/admin/notifications.html"]')) return;
    const dashboard = nav.querySelector('a[href="/admin/dashboard.html"]');
    if (!dashboard) return;
    const link = document.createElement('a');
    link.href = '/admin/notifications.html';
    link.className = 'nav-link' + (location.pathname.endsWith('/admin/notifications.html') ? ' active' : '');
    link.innerHTML = '<i class="bi bi-bell nav-icon" style="color: var(--section-blue)"></i><span class="nav-label">Notifications</span><span id="nav-badge-notifications" class="notif-badge d-none"></span>';
    dashboard.insertAdjacentElement('afterend', link);
  }
  injectNotificationsNav();

  window.AdminPagination = window.AdminPagination || {
    pageSize: ADMIN_PAGE_SIZE,
    state: new Map(),
    page(key, items, renderPage, options = {}) {
      const rows = Array.isArray(items) ? items : [];
      const pageSize = Number(options.pageSize) || ADMIN_PAGE_SIZE;
      const id = key || options.containerId || "default";
      const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
      const current = Math.min(Math.max(1, this.state.get(id) || 1), totalPages);
      this.state.set(id, current);

      const start = (current - 1) * pageSize;
      renderPage(rows.slice(start, start + pageSize), {
        currentPage: current,
        pageSize,
        totalPages,
        totalItems: rows.length,
        start,
      });
      this.renderControls(id, rows.length, pageSize, renderPage, rows, options);
    },
    renderControls(id, totalItems, pageSize, renderPage, rows, options = {}) {
      const anchor = typeof options.anchor === "string" ? document.querySelector(options.anchor) : options.anchor;
      if (!anchor) return;

      let container = document.getElementById(`${id}-pagination`);
      if (!container) {
        container = document.createElement("div");
        container.id = `${id}-pagination`;
        container.className = "admin-pagination d-flex flex-wrap gap-2 justify-content-center align-items-center mt-3";
        anchor.insertAdjacentElement(options.position || "afterend", container);
      }

      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      if (totalItems <= pageSize) {
        container.innerHTML = "";
        return;
      }

      const current = Math.min(Math.max(1, this.state.get(id) || 1), totalPages);
      let pages = "";
      for (let page = 1; page <= totalPages; page++) {
        pages += `<button type="button" class="pager-btn${page === current ? " active" : ""}" data-page="${page}">${page}</button>`;
      }

      container.innerHTML = `
        <button type="button" class="pager-btn" data-page="${current - 1}" ${current === 1 ? "disabled" : ""}>Prev</button>
        ${pages}
        <button type="button" class="pager-btn" data-page="${current + 1}" ${current === totalPages ? "disabled" : ""}>Next</button>
        <span class="small text-muted-custom ms-2">${totalItems} total</span>
      `;

      container.querySelectorAll("[data-page]").forEach(btn => {
        btn.addEventListener("click", () => {
          const nextPage = Number(btn.dataset.page);
          if (!nextPage || nextPage < 1 || nextPage > totalPages) return;
          this.state.set(id, nextPage);
          const start = (nextPage - 1) * pageSize;
          renderPage(rows.slice(start, start + pageSize), {
            currentPage: nextPage,
            pageSize,
            totalPages,
            totalItems,
            start,
          });
          this.renderControls(id, totalItems, pageSize, renderPage, rows, options);
        });
      });
    },
    reset(key) {
      this.state.set(key, 1);
    },
  };

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
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

  function timeAgo(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function notifItem(href, title, snippet, meta, key = "") {
    return `
      <a class="notif-item" href="${href}" ${key ? `data-notification-key="${key}"` : ""}>
        <div class="notif-item-title">${normalizeText(title)}</div>
        ${snippet ? `<div class="notif-item-snippet">${normalizeText(snippet)}</div>` : ""}
        <div class="notif-item-meta">${meta}</div>
      </a>
    `;
  }

  async function loadNotificationDetails() {
    const body = document.getElementById("notif-dropdown-body");
    if (!body) return;
    body.innerHTML = '<div class="notif-dropdown-empty">Loading…</div>';

    try {
      const data = await api.get("/api/v1/admin/notifications");
      const items = (data.items || []).slice(0, 8).map(item => notifItem(item.href, `${item.type} · ${item.title}`, item.detail, timeAgo(item.date), item.key));
      if (items.length === 0) {
        body.innerHTML = '<div class="notif-dropdown-empty">You\'re all caught up 🎉</div>';
        return;
      }
      body.innerHTML = items.join("") + `
        <div class="notif-dropdown-footer">
          <a href="/admin/inquiries.html" class="small">View inquiries</a>
          &nbsp;·&nbsp;
          <a href="/admin/chats.html" class="small">View chat leads</a>
        </div>
      `;
      body.querySelectorAll('[data-notification-key]').forEach(link => link.addEventListener('click', () => {
        api.patch(`/api/v1/admin/notifications/${encodeURIComponent(link.dataset.notificationKey)}`, {}).catch(() => {});
      }));
    } catch (_) {
      body.innerHTML = '<div class="notif-dropdown-empty">Could not load notifications.</div>';
    }
  }

  function initNotifBell() {
    const btn = document.getElementById("notif-bell-btn");
    const dropdown = document.getElementById("notif-dropdown");
    if (!btn || !dropdown) return;

    document.body.appendChild(dropdown);

    function placeDropdown() {
      const rect = btn.getBoundingClientRect();
      const gap = 8;
      const margin = 12;
      const width = Math.min(320, Math.max(220, window.innerWidth - margin * 2));
      const left = Math.min(
        Math.max(margin, rect.left),
        window.innerWidth - width - margin
      );

      dropdown.style.width = `${width}px`;
      dropdown.style.top = `${Math.round(rect.bottom + gap)}px`;
      dropdown.style.left = `${Math.round(left)}px`;
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = dropdown.classList.contains("d-none");
      dropdown.classList.toggle("d-none", !opening);
      if (opening) {
        placeDropdown();
        loadNotificationDetails();
      }
    });

    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.classList.add("d-none");
      }
    });

    window.addEventListener("resize", () => {
      if (!dropdown.classList.contains("d-none")) placeDropdown();
    });

    window.addEventListener("scroll", () => {
      if (!dropdown.classList.contains("d-none")) placeDropdown();
    }, true);
  }

  async function refreshNavBadges() {
    try {
      const counts = await api.get("/api/v1/admin/notifications");
      const unread = counts.unread_inquiries || 0;
      const unseen = counts.unseen_chats || 0;
      setBadge("nav-badge-inquiries", unread);
      setBadge("nav-badge-chats", unseen);
      const total = Number(counts.total ?? (unread + unseen));
      setBadge("notif-bell-badge", total);
      setBadge("nav-badge-notifications", total);
    } catch (_) { /* leave badges as-is on failure */ }
  }

  // Record pages call this after read/archive/delete actions so the bell and
  // sidebar badges never display stale counts until the next polling cycle.
  window.refreshAdminNotifications = refreshNavBadges;
  window.addEventListener("admin:notifications-changed", refreshNavBadges);

  function paginateDomContainer(container, key, itemSelector, anchor) {
    if (!container || container.dataset.skipAutoPagination === "true") return;
    const items = [...container.querySelectorAll(`:scope > ${itemSelector}`)];
    if (items.length === 0) return;
    if (items.length === 1 && items[0].querySelector('[colspan]')) return;

    const totalPages = Math.max(1, Math.ceil(items.length / ADMIN_PAGE_SIZE));
    let current = Math.min(Math.max(1, Number(container.dataset.adminPage || "1")), totalPages);
    container.dataset.adminPage = String(current);

    items.forEach((item, index) => {
      item.classList.toggle("d-none", index < (current - 1) * ADMIN_PAGE_SIZE || index >= current * ADMIN_PAGE_SIZE);
    });

    let pager = document.getElementById(`${key}-auto-pagination`);
    if (!pager) {
      pager = document.createElement("div");
      pager.id = `${key}-auto-pagination`;
      pager.className = "admin-pagination d-flex flex-wrap gap-2 justify-content-center align-items-center mt-3";
      anchor.insertAdjacentElement("afterend", pager);
    }

    if (items.length <= ADMIN_PAGE_SIZE) {
      if (pager.innerHTML) pager.innerHTML = "";
      pager.dataset.paginationHtml = "";
      return;
    }

    let pages = "";
    for (let page = 1; page <= totalPages; page++) {
      pages += `<button type="button" class="pager-btn${page === current ? " active" : ""}" data-page="${page}">${page}</button>`;
    }
    const html = `
      <button type="button" class="pager-btn" data-page="${current - 1}" ${current === 1 ? "disabled" : ""}>Prev</button>
      ${pages}
      <button type="button" class="pager-btn" data-page="${current + 1}" ${current === totalPages ? "disabled" : ""}>Next</button>
      <span class="small text-muted-custom ms-2">${items.length} total</span>
    `;
    if (pager.dataset.paginationHtml !== html) {
      pager.dataset.paginationHtml = html;
      pager.innerHTML = html;
    }
    pager.querySelectorAll("[data-page]").forEach(button => {
      button.addEventListener("click", () => {
        const page = Number(button.dataset.page);
        if (!page || page < 1 || page > totalPages) return;
        container.dataset.adminPage = String(page);
        paginateDomContainer(container, key, itemSelector, anchor);
      });
    });
  }

  function applyAutoPagination() {
    document.querySelectorAll("tbody[id]").forEach(tbody => {
      const key = tbody.id || `table-${Math.random().toString(36).slice(2)}`;
      paginateDomContainer(tbody, key, "tr", tbody.closest(".table-responsive") || tbody.closest("table"));
    });

    ["inquiries-list", "chats-list", "logs-list"].forEach(id => {
      const list = document.getElementById(id);
      if (!list) return;
      paginateDomContainer(list, id, ".admin-card", list);
    });

    ["recent-inquiries", "draft-projects", "upcoming-appointments", "recent-payments"].forEach(id => {
      const list = document.getElementById(id);
      if (!list) return;
      paginateDomContainer(list, id, "div", list);
    });
  }

  function initAutoPagination() {
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        applyAutoPagination();
      }, 0);
    };
    schedule();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }

  initNotifBell();
  initAutoPagination();
  refreshNavBadges();
  setInterval(refreshNavBadges, 60000);
})();
