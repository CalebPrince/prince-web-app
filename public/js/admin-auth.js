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

function showAdminToast(message, type = 'success', options = {}) {
  const text = String(message || '').trim();
  if (!text) return;

  let container = document.getElementById('admin-toast-region');
  if (!container) {
    container = document.createElement('div');
    container.id = 'admin-toast-region';
    container.className = 'admin-toast-region';
    container.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(container);
  }

  const tone = ['success', 'error', 'info'].includes(type) ? type : 'info';
  const icon = { success: 'bi-check2', error: 'bi-exclamation-lg', info: 'bi-info-lg' }[tone];
  const toast = document.createElement('div');
  toast.className = `admin-toast admin-toast-${tone}`;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  toast.innerHTML = `<span class="admin-toast-icon" aria-hidden="true"><i class="bi ${icon}"></i></span><span class="admin-toast-message"></span><button type="button" class="admin-toast-close" aria-label="Dismiss notification"><i class="bi bi-x-lg" aria-hidden="true"></i></button>`;
  toast.querySelector('.admin-toast-message').textContent = text;
  container.appendChild(toast);

  while (container.children.length > 4) container.firstElementChild.remove();
  requestAnimationFrame(() => toast.classList.add('show'));

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    window.setTimeout(() => toast.remove(), 300);
  };
  const schedule = () => { timer = window.setTimeout(dismiss, options.duration || (tone === 'error' ? 6500 : 4200)); };
  toast.querySelector('.admin-toast-close').addEventListener('click', dismiss);
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  toast.addEventListener('mouseleave', schedule);
  schedule();
}

function enhanceAdminToasts() {
  window.adminToast = showAdminToast;
  let queued = false;

  const promoteAlerts = () => {
    queued = false;
    document.querySelectorAll('.alert-success, .alert-danger').forEach(alert => {
      if (alert.classList.contains('d-none') || !alert.textContent.trim()) {
        delete alert.dataset.adminToastText;
        return;
      }
      const type = alert.classList.contains('alert-danger') ? 'error' : 'success';
      const key = `${type}:${alert.textContent.trim()}`;
      if (alert.dataset.adminToastText === key) return;
      alert.dataset.adminToastText = key;
      showAdminToast(alert.textContent, type);
    });
  };

  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(promoteAlerts);
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  promoteAlerts();
}

function enhanceAdminInterface() {
  enhanceAdminPageHeaders();
  enhanceAdminTables();
  enhanceAdminSidebar();
  enhanceAdminCardHeaders();
  enhanceAdminEmptyStates();
  enhanceAdminToasts();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceAdminInterface, { once: true });
} else {
  enhanceAdminInterface();
}
