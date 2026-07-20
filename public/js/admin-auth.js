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

function enhanceAdminTables() {
  document.querySelectorAll('.admin-sidebar ~ .flex-grow-1 table.table, main.flex-grow-1 table.table').forEach(table => {
    if (table.closest('.modal')) return;
    table.classList.add('admin-data-table');

    let scroller = table.closest('.admin-table-scroll, .table-responsive');
    if (!scroller) {
      scroller = document.createElement('div');
      scroller.className = 'admin-table-scroll';
      table.parentNode.insertBefore(scroller, table);
      scroller.appendChild(table);
    } else {
      scroller.classList.add('admin-table-scroll');
    }
  });
}

function enhanceAdminSidebar() {
  const sidebar = document.querySelector('.admin-sidebar');
  if (!sidebar || sidebar.querySelector('.admin-sidebar-collapse')) return;

  const headerActions = sidebar.querySelector(':scope > .d-flex:first-child > .d-flex:last-child');
  if (!headerActions) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'admin-sidebar-collapse';
  button.setAttribute('aria-label', 'Use compact sidebar');
  button.setAttribute('aria-expanded', 'true');
  button.innerHTML = '<i class="bi bi-layout-sidebar-inset" aria-hidden="true"></i>';
  headerActions.appendChild(button);

  sidebar.querySelectorAll('a.nav-link').forEach(link => {
    const label = link.querySelector('.nav-label')?.textContent.trim();
    if (label && !link.title) link.title = label;
  });

  const apply = compact => {
    document.body.classList.toggle('admin-sidebar-compact', compact);
    button.setAttribute('aria-expanded', compact ? 'false' : 'true');
    button.setAttribute('aria-label', compact ? 'Expand sidebar' : 'Use compact sidebar');
  };

  apply(localStorage.getItem('admin_sidebar_compact') === '1');
  button.addEventListener('click', () => {
    const compact = !document.body.classList.contains('admin-sidebar-compact');
    localStorage.setItem('admin_sidebar_compact', compact ? '1' : '0');
    apply(compact);
  });
}

function enhanceAdminCardHeaders() {
  document.querySelectorAll('.admin-card > header, .admin-card > .d-flex').forEach(header => {
    if (!header.querySelector(':scope > h4, :scope > h5, :scope > h6, :scope > div > h4, :scope > div > h5, :scope > div > h6')) return;
    header.classList.add('admin-card-header');
  });
}

function enhanceAdminEmptyStates() {
  document.querySelectorAll('[id$="-empty"], [id$="-empty-state"]').forEach(empty => {
    if (empty.closest('.modal') || empty.querySelector('.admin-empty-mark')) return;
    empty.classList.add('admin-empty-state');
    if (empty.closest('.dashboard-mode-section')) empty.classList.add('is-compact');

    const mark = document.createElement('span');
    mark.className = 'admin-empty-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = '<i class="bi bi-inbox"></i>';
    empty.prepend(mark);
  });
}

function enhanceAdminInterface() {
  enhanceAdminPageHeaders();
  enhanceAdminTables();
  enhanceAdminSidebar();
  enhanceAdminCardHeaders();
  enhanceAdminEmptyStates();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceAdminInterface, { once: true });
} else {
  enhanceAdminInterface();
}
