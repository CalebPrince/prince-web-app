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
  let activeCurrency = "GHS";

  function money(value) {
    return new Intl.NumberFormat(activeCurrency === "GHS" ? "en-GH" : "en-US", {
      style: "currency",
      currency: activeCurrency,
      maximumFractionDigits: activeCurrency === "GHS" ? 0 : 2,
    }).format(value);
  }

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
    document.getElementById("roi-total").textContent = money(bookings * appointmentValue);
  }

  Object.values(fields).forEach(field => field.addEventListener("input", calculate));
  document.addEventListener("sitecurrencychange", event => {
    const nextCurrency = event.detail?.currency || "GHS";
    if (nextCurrency !== activeCurrency && window.SiteCurrency?.rate) {
      fields.value.value = window.SiteCurrency.convert(fields.value.value, activeCurrency, nextCurrency)
        .toFixed(nextCurrency === "GHS" ? 0 : 2);
    }
    activeCurrency = nextCurrency;
    document.getElementById("roi-value-currency").textContent = activeCurrency;
    calculate();
  });
  calculate();
})();
