// Sidebar notification badges (Inquiries / Chat Leads), shared by every admin
// page. Polls periodically so a badge clears soon after the admin reads the
// section on another tab, without needing a full page reload.
(function () {
  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  const explanationRules = [
    {
      pattern: /published projects/i,
      text: "Count of portfolio projects currently visible on your public website."
    },
    {
      pattern: /unread inquiries/i,
      text: "Messages from the contact form that still need your response."
    },
    {
      pattern: /inquiries.*30 days/i,
      text: "Total contact-form submissions received in the past 30 days."
    },
    {
      pattern: /tags in use/i,
      text: "How many unique tags are currently attached to portfolio projects."
    },
    {
      pattern: /revenue \(successful\)/i,
      text: "Money from payments that completed successfully. Pending and failed payments are excluded."
    },
    {
      pattern: /recent inquiries/i,
      text: "Latest incoming messages so you can triage and reply quickly."
    },
    {
      pattern: /draft projects/i,
      text: "Projects saved internally but not yet published to the public site."
    },
    {
      pattern: /upcoming bookings/i,
      text: "Upcoming scheduled calls from your booking form."
    },
    {
      pattern: /recent payments/i,
      text: "Most recent payment records and their latest status."
    },
    {
      pattern: /total page views/i,
      text: "Total tracked page visits within the selected date range."
    },
    {
      pattern: /calculator runs/i,
      text: "How many visitors used the pricing estimator on the frontend."
    },
    {
      pattern: /request step 3 reached/i,
      text: "Visitors who progressed to step 3 in the request wizard."
    },
    {
      pattern: /successful requests/i,
      text: "Project request submissions that reached a successful completion event."
    },
    {
      pattern: /checkout open failures/i,
      text: "Attempts where payment checkout did not open successfully."
    },
    {
      pattern: /views over time/i,
      text: "Traffic trend by day for the selected date range."
    },
    {
      pattern: /top pages/i,
      text: "Pages with the highest number of tracked views."
    },
    {
      pattern: /top funnel events/i,
      text: "Most frequent conversion events across the request and payment flow."
    },
    {
      pattern: /top referrers/i,
      text: "External websites or sources sending visitors to your site."
    },
    {
      pattern: /^pending$/i,
      text: "Payments created but not yet confirmed as successful."
    },
    {
      pattern: /^failed$/i,
      text: "Payments that were attempted but did not complete."
    },
    {
      pattern: /^transactions$/i,
      text: "Total number of recorded payment attempts across all statuses."
    }
  ];

  function getSectionLabel(card) {
    return normalizeText(
      card.querySelector(".stat-label")?.textContent ||
      card.querySelector("h5, h6")?.textContent ||
      card.querySelector(".text-muted-custom.small")?.textContent
    );
  }

  function getSectionExplanation(label) {
    if (!label) return "";
    const rule = explanationRules.find((item) => item.pattern.test(label));
    if (rule) return rule.text;
    return `What this section means: ${label}. Use this block to monitor performance and quickly take the next admin action.`;
  }

  function createHelpIcon(card) {
    if (typeof bootstrap === "undefined" || !bootstrap.Tooltip) return;
    if (card.querySelector(":scope > .admin-help-toggle")) return;

    let explanationElement = card.querySelector("h5 + p.text-muted-custom.small, h6 + p.text-muted-custom.small");
    
    let explanationText = "";
    if (explanationElement) {
        explanationText = normalizeText(explanationElement.textContent);
        explanationElement.classList.add("d-none");
    } else {
        const label = getSectionLabel(card);
        explanationText = getSectionExplanation(label);
        if (!explanationText) return;
    }

    const helpBtn = document.createElement("span");
    helpBtn.className = "admin-help-toggle";
    helpBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;
    helpBtn.setAttribute("data-bs-toggle", "tooltip");
    helpBtn.setAttribute("data-bs-placement", "top");
    helpBtn.setAttribute("title", explanationText);
    helpBtn.dataset.helpReady = "1";

    card.classList.add("has-help-icon");
    card.appendChild(helpBtn);

    new bootstrap.Tooltip(helpBtn);
  }

  function initAdminSectionHelp() {
    document.querySelectorAll(".admin-card").forEach((card) => {
      createHelpIcon(card);
    });

    const observer = new MutationObserver(() => {
      document.querySelectorAll(".admin-card").forEach((card) => {
        createHelpIcon(card);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
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

  function notifItem(href, title, snippet, meta) {
    return `
      <a class="notif-item" href="${href}">
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
      const [inquiries, chats] = await Promise.all([
        api.get("/api/v1/admin/inquiries?status=unread"),
        api.get("/api/v1/admin/chats"),
      ]);

      const unseenChats = (Array.isArray(chats) ? chats : []).filter(c => !c.admin_seen);

      const inquiryItems = inquiries
        .slice(0, 5)
        .map(i => notifItem(
          i.type === "project_request" ? "/admin/quote-requests.html" : "/admin/inquiries.html",
          i.name || i.email,
          i.message,
          timeAgo(i.created_at)
        ));

      const chatItems = unseenChats
        .slice(0, 5)
        .map(c => notifItem(
          "/admin/chats.html",
          c.client_name || c.client_email || `Chat #${c.id}`,
          "New live chat activity",
          timeAgo(c.updated_at || c.created_at)
        ));

      const items = [...inquiryItems, ...chatItems];
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
    } catch (_) {
      body.innerHTML = '<div class="notif-dropdown-empty">Could not load notifications.</div>';
    }
  }

  function initNotifBell() {
    const btn = document.getElementById("notif-bell-btn");
    const dropdown = document.getElementById("notif-dropdown");
    if (!btn || !dropdown) return;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = dropdown.classList.contains("d-none");
      dropdown.classList.toggle("d-none", !opening);
      if (opening) loadNotificationDetails();
    });

    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.classList.add("d-none");
      }
    });
  }

  async function refreshNavBadges() {
    try {
      const counts = await api.get("/api/v1/admin/notifications");
      const unread = counts.unread_inquiries || 0;
      const unseen = counts.unseen_chats || 0;
      setBadge("nav-badge-inquiries", unread);
      setBadge("nav-badge-chats", unseen);
      setBadge("notif-bell-badge", unread + unseen);
    } catch (_) { /* leave badges as-is on failure */ }
  }

  initNotifBell();
  refreshNavBadges();
  setInterval(refreshNavBadges, 60000);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminSectionHelp, { once: true });
  } else {
    initAdminSectionHelp();
  }
})();
