// Mobile nav drawer
const navToggle = document.getElementById('navToggle');
const siteHeader = document.getElementById('siteHeader');
const navOverlay = document.getElementById('navOverlay');

const openNav = () => {
  siteHeader.classList.add('nav-open');
  navToggle.setAttribute('aria-expanded', 'true');
  document.body.classList.add('nav-locked');
};

const closeNav = () => {
  siteHeader.classList.remove('nav-open');
  navToggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('nav-locked');
};

navToggle.addEventListener('click', () => {
  siteHeader.classList.contains('nav-open') ? closeNav() : openNav();
});

navOverlay?.addEventListener('click', closeNav);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeNav();
});

document.querySelectorAll('.main-nav a').forEach((link) => {
  link.addEventListener('click', closeNav);
});

// Shrink the header logo once the page scrolls so it stops covering copy below it
const handleHeaderScroll = () => {
  siteHeader.classList.toggle('is-scrolled', window.scrollY > 40);
};
window.addEventListener('scroll', handleHeaderScroll, { passive: true });
handleHeaderScroll();

// Scroll-reveal — items in the same group (grid/list) cascade in with a
// slight stagger instead of all popping in on the same frame.
const revealEls = document.querySelectorAll('[data-reveal]');
const revealGroups = new Map();

revealEls.forEach((el) => {
  const group = el.parentElement;
  const siblings = revealGroups.get(group) || [];
  siblings.push(el);
  revealGroups.set(group, siblings);
});

revealGroups.forEach((siblings) => {
  siblings.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i, 8) * 70}ms`;
  });
});

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  revealEls.forEach((el) => observer.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('is-visible'));
}

// Button click ripple
document.querySelectorAll('.btn').forEach((btn) => {
  btn.addEventListener('click', (event) => {
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.4;
    const ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
});

// Work page gallery filter (category buttons filter the bento grid)
const filterBtns = document.querySelectorAll('.filter-btn');
const bentoItems = document.querySelectorAll('.bento-item');

if (filterBtns.length && bentoItems.length) {
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const filter = btn.dataset.filter;
      bentoItems.forEach((item) => {
        const show = filter === 'all' || item.dataset.category === filter;
        item.classList.toggle('is-hidden', !show);
      });
    });
  });
}

// Contact form (no backend wired up yet — shows a confirmation message)
const contactForm = document.getElementById('contactForm');
const formNote = document.getElementById('formNote');

if (contactForm) {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    formNote.textContent = "Thank you. We'll reply within two business days.";
    contactForm.reset();
  });
}
