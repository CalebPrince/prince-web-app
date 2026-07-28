(function () {
  const zones = [...document.querySelectorAll("[data-currency-zone]")];
  if (!zones.length || typeof api === "undefined") return;

  const selector = [
    ".pricing-price",
    "[data-currency-price]",
    '[data-content="pricing_tier_4_tagline"]',
    '[data-content-list^="pricing_tier_"] li',
  ].join(",");
  let rate = 0;
  let targetCurrency = localStorage.getItem("site_price_currency") === "USD" ? "USD" : "GHS";

  function convertValue(value, from, to) {
    if (from === to) return value;
    if (from === "GHS" && to === "USD") return value / rate;
    if (from === "USD" && to === "GHS") return value * rate;
    return value;
  }

  window.SiteCurrency = {
    get currency() { return targetCurrency; },
    get rate() { return rate; },
    convert(value, from, to = targetCurrency) {
      return rate ? convertValue(Number(value || 0), from, to) : Number(value || 0);
    },
  };

  function formatValue(value, currency) {
    const decimals = value >= 1000 ? 0 : 2;
    return `${currency} ${value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }

  function convertText(source) {
    if (!rate) return source;
    return source.replace(/\b(GHS|USD)\s*([\d,]+(?:\.\d+)?)/gi, (match, from, number) => {
      const originalCurrency = from.toUpperCase();
      const value = Number(number.replace(/,/g, ""));
      if (!Number.isFinite(value)) return match;
      return formatValue(convertValue(value, originalCurrency, targetCurrency), targetCurrency);
    });
  }

  function renderElement(element) {
    if (!element.dataset.currencySource) {
      element.dataset.currencySource = element.textContent.trim();
    }
    const output = convertText(element.dataset.currencySource);
    element.dataset.currencyOutput = output;
    if (element.textContent.trim() !== output) element.textContent = output;
  }

  function renderAll() {
    zones.forEach(zone => zone.querySelectorAll(selector).forEach(renderElement));
    document.querySelectorAll("[data-site-currency-button]").forEach(button => {
      const active = button.dataset.siteCurrencyButton === targetCurrency;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function addControls(fx) {
    zones.forEach((zone, index) => {
      if (zone.querySelector(".site-currency-control")) return;
      const control = document.createElement("div");
      control.className = "container site-currency-control";
      control.innerHTML = `<div class="site-currency-control-inner">
        <div><strong>Display prices in</strong><span>Live planning estimate · checkout remains in its stated currency</span></div>
        <div class="site-currency-actions" role="group" aria-label="Display currency">
          <button type="button" data-site-currency-button="GHS">GHS</button>
          <button type="button" data-site-currency-button="USD">USD</button>
        </div>
        <small>${Number(fx.rate).toFixed(4)} GHS per USD · ${fx.provider || "cached rate"}</small>
      </div>`;
      zone.insertBefore(control, zone.firstChild);
      if (index > 0) control.classList.add("d-none");
    });
    document.querySelectorAll("[data-site-currency-button]").forEach(button => {
      button.addEventListener("click", () => {
        targetCurrency = button.dataset.siteCurrencyButton;
        localStorage.setItem("site_price_currency", targetCurrency);
        renderAll();
        document.dispatchEvent(new CustomEvent("sitecurrencychange", {
          detail: { currency: targetCurrency, rate, provider: fx.provider },
        }));
      });
    });
  }

  zones.forEach(zone => {
    new MutationObserver(() => {
      zone.querySelectorAll(selector).forEach(element => {
        const current = element.textContent.trim();
        if (element.dataset.currencyOutput && current !== element.dataset.currencyOutput) {
          element.dataset.currencySource = current;
        }
        renderElement(element);
      });
    }).observe(zone, { childList: true, subtree: true, characterData: true });
  });

  api.get("/api/v1/exchange-rate").then(fx => {
    rate = Number(fx.rate || 0);
    if (!rate) return;
    addControls(fx);
    renderAll();
    document.dispatchEvent(new CustomEvent("sitecurrencychange", {
      detail: { currency: targetCurrency, rate, provider: fx.provider },
    }));
  }).catch(() => {
    // Prices stay in their authored currency if both providers and cache fail.
  });
})();
