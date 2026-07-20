// Escape user-supplied strings before injecting into innerHTML — inquiry
// names/emails/messages come straight from the public contact form.
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function requireAdminAuth() {
  try {
    return await api.get("/api/v1/auth/me");
  } catch (_) {
    window.location.href = "/admin/login.html";
    return null;
  }
}

function wireLogout() {
  const link = document.getElementById("logout-link");
  if (!link) return;
  link.addEventListener("click", async (e) => {
    e.preventDefault();
    await api.post("/api/v1/auth/logout");
    window.location.href = "/admin/login.html";
  });
}

// Give every admin workspace page the same command-centre masthead while
// preserving each page's existing title, description, controls, and actions.
function enhanceAdminPageHeaders() {
  const selectors = [
    '.flex-grow-1.p-4 > .d-flex.mb-4',
    'main.flex-grow-1.p-4 > .tasks-page > header:first-child',
    '.client-page > .d-flex.mb-4:first-child',
    '#automations-view > .d-flex.mb-4:first-child',
    '.inquiry-page-header',
    '.pipeline-header',
    '.unified-inbox-header',
    '.notification-center-header'
  ];

  document.querySelectorAll(selectors.join(',')).forEach(header => {
    if (header.classList.contains('dashboard-welcome') || !header.querySelector('h2, h3')) return;
    header.classList.add('admin-page-header');

    const copy = [...header.children].find(child => child.matches('h2, h3') || child.querySelector('h2, h3'));
    if (copy) copy.classList.add('admin-page-header-copy');

    [...header.children].forEach(child => {
      if (child !== copy && !child.classList.contains('icon-chip')) child.classList.add('admin-page-header-actions');
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceAdminPageHeaders, { once: true });
} else {
  enhanceAdminPageHeaders();
}
