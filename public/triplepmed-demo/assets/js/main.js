document.addEventListener('DOMContentLoaded', function () {
  // Mobile nav drawer
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');
  var backdrop = document.querySelector('#nav-backdrop');
  var closeBtn = document.querySelector('#nav-close');

  var closeDrawer = function () {
    if (!nav) return;
    nav.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  var openDrawer = function () {
    if (!nav) return;
    nav.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.contains('open') ? closeDrawer() : openDrawer();
    });
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeDrawer);
    });
    if (backdrop) backdrop.addEventListener('click', closeDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  // Scroll reveal
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { observer.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in-view'); });
  }

  // FAQ accordion
  document.querySelectorAll('.accordion-trigger').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var item = trigger.closest('.accordion-item');
      var wasOpen = item.classList.contains('open');
      item.parentElement.querySelectorAll('.accordion-item').forEach(function (el) {
        el.classList.remove('open');
        el.querySelector('.accordion-trigger').setAttribute('aria-expanded', 'false');
      });
      if (!wasOpen) {
        item.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Appointment form: in-person vs. virtual/telehealth toggle
  var visitToggle = document.querySelector('.visit-type-toggle');
  if (visitToggle) {
    var visitInput = document.querySelector('#visit-type-input');
    var serviceSelect = document.querySelector('#appointment-service');
    var telehealthServiceId = visitToggle.dataset.telehealthServiceId || '';
    var notes = document.querySelectorAll('[data-visit-note]');

    var setVisitType = function (value, changeService) {
      visitInput.value = value;
      visitToggle.querySelectorAll('.visit-type-option').forEach(function (btn) {
        var active = btn.dataset.value === value;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      notes.forEach(function (note) {
        note.style.display = note.dataset.visitNote === value ? 'flex' : 'none';
      });
      if (changeService && serviceSelect && value === 'virtual' && telehealthServiceId) {
        serviceSelect.value = telehealthServiceId;
      }
    };

    visitToggle.querySelectorAll('.visit-type-option').forEach(function (btn) {
      btn.addEventListener('click', function () { setVisitType(btn.dataset.value, true); });
    });

    setVisitType(visitInput.value || 'in_person', false);
  }

  // Disable submit buttons on submit to avoid duplicate bookings
  document.querySelectorAll('form[data-once]').forEach(function (form) {
    form.addEventListener('submit', function () {
      var btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = btn.dataset.loadingText || 'Sending...';
      }
    });
  });
});
