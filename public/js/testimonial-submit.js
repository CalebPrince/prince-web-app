(async function () {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const unavailable = document.getElementById('review-unavailable');
  const formWrap = document.getElementById('review-form-wrap');

  if (!token) {
    unavailable.classList.remove('d-none');
    return;
  }

  try {
    const info = await api.get(`/api/v1/testimonials/${encodeURIComponent(token)}`);
    document.getElementById('review-name').value = info.client_name || '';
    formWrap.classList.remove('d-none');
  } catch (err) {
    document.getElementById('unavailable-message').textContent = err.message || 'It may have already been used, or the link is incorrect.';
    unavailable.classList.remove('d-none');
    return;
  }

  let selectedRating = 0;
  const stars = document.querySelectorAll('.star-btn');

  function paintStars(value) {
    stars.forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.value) <= value);
    });
  }

  stars.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedRating = Number(btn.dataset.value);
      document.getElementById('review-rating').value = String(selectedRating);
      paintStars(selectedRating);
    });
    btn.addEventListener('mouseenter', () => paintStars(Number(btn.dataset.value)));
  });
  document.getElementById('star-picker').addEventListener('mouseleave', () => paintStars(selectedRating));

  document.getElementById('review-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('review-msg');
    const btn = document.getElementById('review-submit-btn');
    msg.classList.add('d-none');

    if (!selectedRating) {
      msg.className = 'alert alert-danger py-2 small';
      msg.textContent = 'Please choose a rating.';
      msg.classList.remove('d-none');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      await api.post(`/api/v1/testimonials/${encodeURIComponent(token)}`, {
        client_name: document.getElementById('review-name').value,
        rating: selectedRating,
        quote: document.getElementById('review-quote').value,
      });
      formWrap.classList.add('d-none');
      document.getElementById('review-thanks').classList.remove('d-none');
    } catch (err) {
      msg.className = 'alert alert-danger py-2 small';
      msg.textContent = err.message || 'Something went wrong — please try again.';
      msg.classList.remove('d-none');
      btn.disabled = false;
      btn.textContent = 'Submit review';
    }
  });
})();
