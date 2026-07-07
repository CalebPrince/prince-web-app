function showMsg(id, text, ok) {
  const el = document.getElementById(id);
  el.className = `alert py-2 small ${ok ? "alert-success" : "alert-danger"}`;
  el.textContent = text;
}

async function saveEmail(e) {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  try {
    const result = await api.patch("/api/v1/admin/account", { email });
    showMsg("email-msg", `Login email updated to ${result.email}.`, true);
  } catch (err) {
    showMsg("email-msg", err.message, false);
  }
}

function showTwofaView(view) {
  ["disabled", "enabled", "setup", "backup"].forEach(v => {
    document.getElementById(`twofa-${v}-view`).classList.toggle("d-none", v !== view);
  });
}

let pendingTwofaSecret = null;

async function startTwofaSetup() {
  const res = await api.post("/api/v1/admin/2fa/setup", {});
  pendingTwofaSecret = res.secret;
  document.getElementById("twofa-secret").textContent = res.secret;
  document.getElementById("twofa-confirm-form").reset();
  document.getElementById("twofa-setup-msg").classList.add("d-none");
  showTwofaView("setup");
}

async function confirmTwofaSetup(e) {
  e.preventDefault();
  try {
    const res = await api.post("/api/v1/admin/2fa/confirm", {
      secret: pendingTwofaSecret,
      code: document.getElementById("twofa-confirm-code").value.trim(),
    });
    document.getElementById("twofa-backup-codes").innerHTML = res.backup_codes.map(c => `<div>${c}</div>`).join("");
    showTwofaView("backup");
  } catch (err) {
    showMsg("twofa-setup-msg", err.message, false);
  }
}

async function disableTwofa(e) {
  e.preventDefault();
  try {
    await api.post("/api/v1/admin/2fa/disable", {
      password: document.getElementById("twofa-disable-password").value,
    });
    document.getElementById("twofa-disable-form").reset();
    showTwofaView("disabled");
  } catch (err) {
    showMsg("twofa-disable-msg", err.message, false);
  }
}

async function savePassword(e) {
  e.preventDefault();
  const current = document.getElementById("current-password").value;
  const next = document.getElementById("new-password").value;
  const confirm = document.getElementById("confirm-password").value;

  if (next !== confirm) {
    showMsg("password-msg", "New password and confirmation do not match.", false);
    return;
  }

  try {
    await api.post("/api/v1/admin/account/password", {
      current_password: current,
      new_password: next,
    });
    document.getElementById("password-form").reset();
    showMsg("password-msg", "Password updated. Other devices have been signed out.", true);
  } catch (err) {
    showMsg("password-msg", err.message, false);
  }
}

async function saveIntegrations(e) {
  e.preventDefault();
  try {
    await api.put("/api/v1/admin/settings", {
      gemini_api_key: document.getElementById("gemini-key").value.trim(),
      slack_webhook_url: document.getElementById("slack-url").value.trim(),
      notification_email: document.getElementById("notification-email").value.trim(),
    });
    showMsg("integrations-msg", "Saved — Live Chat will use the new keys immediately.", true);
  } catch (err) {
    showMsg("integrations-msg", err.message, false);
  }
}

async function saveHours(e) {
  e.preventDefault();
  const days = [...document.querySelectorAll(".hours-day:checked")].map(el => el.value);
  try {
    await api.put("/api/v1/admin/settings", {
      chat_hours_enabled: document.getElementById("hours-enabled").checked ? "1" : "",
      chat_hours_days: days.join(","),
      chat_hours_start: document.getElementById("hours-start").value,
      chat_hours_end: document.getElementById("hours-end").value,
      chat_timezone: document.getElementById("hours-timezone").value.trim(),
    });
    showMsg("hours-msg", "Saved — Live Chat availability updates immediately.", true);
  } catch (err) {
    showMsg("hours-msg", err.message, false);
  }
}

async function saveBooking(e) {
  e.preventDefault();
  const days = [...document.querySelectorAll(".booking-day:checked")].map(el => el.value);
  try {
    await api.put("/api/v1/admin/settings", {
      booking_enabled: document.getElementById("booking-enabled").checked ? "1" : "0",
      booking_days: days.join(","),
      booking_start_time: document.getElementById("booking-start").value,
      booking_end_time: document.getElementById("booking-end").value,
      booking_timezone: document.getElementById("booking-timezone").value.trim(),
      booking_slot_minutes: document.getElementById("booking-slot-minutes").value.trim(),
      booking_lead_days: document.getElementById("booking-lead-days").value.trim(),
      booking_min_notice_hours: document.getElementById("booking-min-notice").value.trim(),
    });
    showMsg("booking-msg", "Saved — takes effect immediately.", true);
  } catch (err) {
    showMsg("booking-msg", err.message, false);
  }
}

async function saveWidgets(e) {
  e.preventDefault();
  try {
    await api.put("/api/v1/admin/settings", {
      live_chat_enabled: document.getElementById("widget-live-chat-enabled").checked ? "1" : "0",
      whatsapp_button_enabled: document.getElementById("widget-whatsapp-enabled").checked ? "1" : "0",
    });
    showMsg("widgets-msg", "Saved — takes effect immediately for visitors.", true);
  } catch (err) {
    showMsg("widgets-msg", err.message, false);
  }
}

async function savePayments(e) {
  e.preventDefault();
  try {
    await api.put("/api/v1/admin/settings", {
      paystack_public_key: document.getElementById("paystack-public-key").value.trim(),
      paystack_secret_key: document.getElementById("paystack-secret-key").value.trim(),
      pricing_currency: document.getElementById("pricing-currency").value,
      pricing_tier_1_amount: document.getElementById("pricing-tier-1-amount").value.trim(),
    });
    showMsg("payments-msg", "Saved — takes effect immediately.", true);
  } catch (err) {
    showMsg("payments-msg", err.message, false);
  }
}

async function saveMaintenance(e) {
  e.preventDefault();
  try {
    await api.put("/api/v1/admin/settings", {
      maintenance_mode: document.getElementById("maintenance-enabled").checked ? "1" : "",
    });
    showMsg("maintenance-msg", "Saved — takes effect immediately for visitors.", true);
  } catch (err) {
    showMsg("maintenance-msg", err.message, false);
  }
}

async function testAi() {
  const btn = document.getElementById("test-ai-btn");
  btn.disabled = true;
  btn.textContent = "Testing…";
  try {
    const r = await api.get("/api/v1/admin/ai-test");
    if (!r.key_loaded || r.curl_available === false) {
      showMsg("integrations-msg", r.hint, false);
    } else if (r.http_status === 200) {
      showMsg("integrations-msg", "✓ Gemini is working! Live Chat is fully AI-powered.", true);
    } else if (r.curl_error) {
      showMsg("integrations-msg", `Connection problem: ${r.curl_error} — the host may be blocking outbound requests; contact Namecheap support.`, false);
    } else {
      showMsg("integrations-msg", `Gemini rejected the key (HTTP ${r.http_status}): ${r.response_snippet || ""}`, false);
    }
  } catch (err) {
    showMsg("integrations-msg", err.message, false);
  }
  btn.disabled = false;
  btn.textContent = "Test AI connection";
}

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById("email").value = user.email;
  document.getElementById("email-form").addEventListener("submit", saveEmail);
  document.getElementById("password-form").addEventListener("submit", savePassword);

  showTwofaView(user.totp_enabled ? "enabled" : "disabled");
  document.getElementById("twofa-start-btn").addEventListener("click", startTwofaSetup);
  document.getElementById("twofa-confirm-form").addEventListener("submit", confirmTwofaSetup);
  document.getElementById("twofa-disable-form").addEventListener("submit", disableTwofa);
  document.getElementById("twofa-cancel-btn").addEventListener("click", () => showTwofaView("disabled"));
  document.getElementById("twofa-backup-done-btn").addEventListener("click", () => showTwofaView("enabled"));

  document.getElementById("integrations-form").addEventListener("submit", saveIntegrations);
  document.getElementById("test-ai-btn").addEventListener("click", testAi);
  document.getElementById("hours-form").addEventListener("submit", saveHours);
  document.getElementById("maintenance-form").addEventListener("submit", saveMaintenance);
  document.getElementById("payments-form").addEventListener("submit", savePayments);
  document.getElementById("widgets-form").addEventListener("submit", saveWidgets);
  document.getElementById("booking-form").addEventListener("submit", saveBooking);
  try {
    const settings = await api.get("/api/v1/admin/settings");
    document.getElementById("gemini-key").value = settings.gemini_api_key || "";
    document.getElementById("slack-url").value = settings.slack_webhook_url || "";
    document.getElementById("notification-email").value = settings.notification_email || "";
    document.getElementById("maintenance-enabled").checked = !!settings.maintenance_mode;

    document.getElementById("widget-live-chat-enabled").checked = settings.live_chat_enabled !== "0";
    document.getElementById("widget-whatsapp-enabled").checked = settings.whatsapp_button_enabled !== "0";

    document.getElementById("paystack-public-key").value = settings.paystack_public_key || "";
    document.getElementById("paystack-secret-key").value = settings.paystack_secret_key || "";
    document.getElementById("pricing-currency").value = settings.pricing_currency || "GHS";
    document.getElementById("pricing-tier-1-amount").value = settings.pricing_tier_1_amount || "";

    document.getElementById("hours-enabled").checked = !!settings.chat_hours_enabled;
    const days = (settings.chat_hours_days || "").split(",").map(d => d.trim()).filter(Boolean);
    document.querySelectorAll(".hours-day").forEach(el => { el.checked = days.includes(el.value); });
    document.getElementById("hours-start").value = settings.chat_hours_start || "";
    document.getElementById("hours-end").value = settings.chat_hours_end || "";
    document.getElementById("hours-timezone").value = settings.chat_timezone || "";

    document.getElementById("booking-enabled").checked = settings.booking_enabled === "1";
    const bookingDays = (settings.booking_days || "").split(",").map(d => d.trim()).filter(Boolean);
    document.querySelectorAll(".booking-day").forEach(el => { el.checked = bookingDays.includes(el.value); });
    document.getElementById("booking-start").value = settings.booking_start_time || "09:00";
    document.getElementById("booking-end").value = settings.booking_end_time || "17:00";
    document.getElementById("booking-timezone").value = settings.booking_timezone || "Africa/Accra";
    document.getElementById("booking-slot-minutes").value = settings.booking_slot_minutes || "30";
    document.getElementById("booking-lead-days").value = settings.booking_lead_days || "14";
    document.getElementById("booking-min-notice").value = settings.booking_min_notice_hours || "24";
  } catch (_) { /* fields stay empty */ }
})();
