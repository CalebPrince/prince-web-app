document.addEventListener('DOMContentLoaded', function () {
  // Confirm before destructive actions
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.dataset.confirm)) {
        e.preventDefault();
      }
    });
  });

  // Auto-slugify name/title fields into a slug field
  document.querySelectorAll('[data-slug-source]').forEach(function (source) {
    var targetSelector = source.getAttribute('data-slug-source');
    var target = document.querySelector(targetSelector);
    if (!target) return;

    var userEdited = false;
    target.addEventListener('input', function () { userEdited = true; });

    source.addEventListener('input', function () {
      if (userEdited) return;
      target.value = source.value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    });
  });

  // Image upload preview
  document.querySelectorAll('input[type="file"][data-preview]').forEach(function (input) {
    var previewEl = document.querySelector(input.getAttribute('data-preview'));
    if (!previewEl) return;

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) { previewEl.src = e.target.result; };
      reader.readAsDataURL(file);
    });
  });

  // Submit status-change dropdowns immediately
  document.querySelectorAll('select[data-auto-submit]').forEach(function (select) {
    select.addEventListener('change', function () {
      select.form.submit();
    });
  });
});
