(function () {
  const fields = {
    calls: document.getElementById("roi-calls"),
    missed: document.getElementById("roi-missed"),
    book: document.getElementById("roi-book"),
    value: document.getElementById("roi-value"),
    days: document.getElementById("roi-days"),
  };
  if (Object.values(fields).some(field => !field)) return;

  const whole = value => Math.max(0, Math.round(Number(value) || 0));
  const money = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 });

  function calculate() {
    const calls = whole(fields.calls.value);
    const missedRate = whole(fields.missed.value) / 100;
    const bookingRate = whole(fields.book.value) / 100;
    const appointmentValue = Math.max(0, Number(fields.value.value) || 0);
    const days = Math.min(31, Math.max(1, whole(fields.days.value)));
    const missedCalls = calls * days * missedRate;
    const bookings = missedCalls * bookingRate;

    document.getElementById("roi-missed-output").textContent = `${whole(fields.missed.value)}%`;
    document.getElementById("roi-book-output").textContent = `${whole(fields.book.value)}%`;
    document.getElementById("roi-missed-calls").textContent = Math.round(missedCalls).toLocaleString();
    document.getElementById("roi-bookings").textContent = Math.round(bookings).toLocaleString();
    document.getElementById("roi-total").textContent = money.format(bookings * appointmentValue);
  }

  Object.values(fields).forEach(field => field.addEventListener("input", calculate));
  calculate();
})();
