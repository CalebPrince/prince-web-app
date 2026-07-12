function showMsg(id, text, ok) {
  const el = document.getElementById(id);
  el.className = `alert py-2 small ${ok ? "alert-success" : "alert-danger"}`;
  el.textContent = text;
}

const EMAIL_TEMPLATE_FIELDS = [
  ["payment_success", "payment-success"],
  ["invoice_send", "invoice-send"],
  ["invoice_receipt", "invoice-receipt"],
  ["subscription_receipt", "subscription-receipt"],
  ["proposal_send", "proposal-send"],
  ["booking_client_confirmation", "booking-client-confirmation"],
  ["booking_internal_notification", "booking-internal-notification"],
  ["appointment_reminder", "appointment-reminder"],
  ["client_invite", "client-invite"],
  ["client_password_reset", "client-password-reset"],
  ["client_portal_message", "client-portal-message"],
  ["project_request_confirmation", "project-request-confirmation"],
  ["testimonial_request", "testimonial-request"],
  ["milestone_reminder", "milestone-reminder"],
  ["inquiry_internal_notification", "inquiry-internal-notification"],
];

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
      openrouter_api_key: document.getElementById("openrouter-key").value.trim(),
      openrouter_model: document.getElementById("openrouter-model").value.trim(),
      groq_api_key: document.getElementById("groq-key").value.trim(),
      groq_model: document.getElementById("groq-model").value.trim(),
      serper_api_key: document.getElementById("serper-key").value.trim(),
      slack_webhook_url: document.getElementById("slack-url").value.trim(),
      makecom_webhook_url: document.getElementById("makecom-url").value.trim(),
      integration_api_key: document.getElementById("integration-api-key").value.trim(),
      notification_email: document.getElementById("notification-email").value.trim(),
      composio_api_key: document.getElementById("composio-api-key").value.trim(),
      composio_google_calendar_auth_config_id: document.getElementById("composio-google-calendar-auth-config-id").value.trim(),
      composio_gmail_auth_config_id: document.getElementById("composio-gmail-auth-config-id").value.trim(),
      composio_slack_auth_config_id: document.getElementById("composio-slack-auth-config-id").value.trim(),
      composio_whatsapp_auth_config_id: document.getElementById("composio-whatsapp-auth-config-id").value.trim(),
      composio_google_calendar_booking_tool: document.getElementById("composio-google-calendar-booking-tool").value.trim(),
      composio_google_calendar_id: document.getElementById("composio-google-calendar-id").value.trim(),
      composio_gmail_booking_tool: document.getElementById("composio-gmail-booking-tool").value.trim(),
      composio_gmail_booking_to: document.getElementById("composio-gmail-booking-to").value.trim(),
      composio_slack_booking_tool: document.getElementById("composio-slack-booking-tool").value.trim(),
      composio_slack_channel: document.getElementById("composio-slack-channel").value.trim(),
      composio_whatsapp_booking_tool: document.getElementById("composio-whatsapp-booking-tool").value.trim(),
      composio_whatsapp_booking_to: document.getElementById("composio-whatsapp-booking-to").value.trim(),
    });
    showMsg("integrations-msg", "Saved — Live Chat will use the new keys immediately.", true);
    await loadComposioAccounts();
  } catch (err) {
    showMsg("integrations-msg", err.message, false);
  }
}

async function saveSocialDraft(e) {
  e.preventDefault();
  try {
    await api.put("/api/v1/admin/settings", {
      social_draft_enabled: document.getElementById("social-draft-enabled").checked ? "1" : "",
      social_draft_frequency: document.getElementById("social-draft-frequency").value,
    });
    showMsg("social-draft-msg", "Saved.", true);
  } catch (err) {
    showMsg("social-draft-msg", err.message, false);
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

async function saveEmailTemplates(e) {
  e.preventDefault();
  const payload = {
    email_brand_logo_url: document.getElementById("email-brand-logo-url").value.trim(),
    email_site_url: document.getElementById("email-site-url").value.trim(),
  };
  EMAIL_TEMPLATE_FIELDS.forEach(([key, id]) => {
    payload[`email_tpl_${key}_subject`] = document.getElementById(`email-tpl-${id}-subject`).value.trim();
    payload[`email_tpl_${key}_html`] = document.getElementById(`email-tpl-${id}-html`).value.trim();
    payload[`email_tpl_${key}_text`] = document.getElementById(`email-tpl-${id}-text`).value.trim();
  });

  try {
    await api.put("/api/v1/admin/settings", payload);
    showMsg("email-templates-msg", "Saved. New client emails will use these templates immediately.", true);
  } catch (err) {
    showMsg("email-templates-msg", err.message, false);
  }
}

async function saveGoogleSignin(e) {
  e.preventDefault();
  try {
    await api.put("/api/v1/admin/settings", {
      google_client_id: document.getElementById("google-client-id").value.trim(),
    });
    showMsg("google-signin-msg", "Saved — the login page picks it up immediately.", true);
  } catch (err) {
    showMsg("google-signin-msg", err.message, false);
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

const COMPOSIO_STATUS_DISPLAY = {
  ACTIVE: { text: "Connected", cls: "approved" },
  INITIATED: { text: "Pending authorization", cls: "pending" },
};

async function loadComposioAccounts() {
  const list = document.getElementById("composio-accounts-list");
  try {
    const accounts = await api.get("/api/v1/admin/composio/status");
    list.innerHTML = Object.entries(accounts).map(([slug, acct]) => {
      const display = acct.status
        ? (COMPOSIO_STATUS_DISPLAY[acct.status] || { text: acct.status, cls: "rejected" })
        : { text: "Not connected", cls: "pending" };
      const canConnect = !!acct.auth_config_id;
      return `
        <div class="py-2 border-bottom">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <div class="fw-semibold">${escapeHtml(acct.label)}</div>
              <span class="status-pill ${display.cls}">${escapeHtml(display.text)}</span>
            </div>
            <div class="d-flex gap-2">
              ${acct.account_id
                ? `<button type="button" class="btn btn-sm btn-outline-danger composio-disconnect-btn" data-toolkit="${slug}">Disconnect</button>`
                : `<button type="button" class="btn btn-sm btn-outline-secondary composio-connect-btn" data-toolkit="${slug}" ${canConnect ? "" : "disabled"} title="${canConnect ? "" : "Add an Auth Config ID above first"}">Connect</button>`}
            </div>
          </div>
          ${acct.last_error ? `<div class="alert alert-warning py-2 small mt-2 mb-0"><strong>Last booking action error:</strong> ${escapeHtml(acct.last_error)}</div>` : ""}
        </div>
      `;
    }).join("");

    list.querySelectorAll(".composio-connect-btn").forEach(btn => {
      btn.addEventListener("click", () => connectComposio(btn.dataset.toolkit));
    });
    list.querySelectorAll(".composio-disconnect-btn").forEach(btn => {
      btn.addEventListener("click", () => disconnectComposio(btn.dataset.toolkit));
    });
  } catch (err) {
    list.innerHTML = "";
    showMsg("composio-msg", err.message, false);
  }
}

async function connectComposio(toolkit) {
  try {
    const result = await api.post("/api/v1/admin/composio/connect", { toolkit });
    if (result.redirect_url) {
      window.open(result.redirect_url, "_blank", "noopener");
      showMsg("composio-msg", "Complete the authorization in the new tab, then come back and refresh this page to see the updated status.", true);
    } else {
      showMsg("composio-msg", "Connection started, but no authorization link was returned — check Composio's dashboard.", false);
    }
    await loadComposioAccounts();
  } catch (err) {
    showMsg("composio-msg", err.message, false);
    await loadComposioAccounts();
  }
}

async function disconnectComposio(toolkit) {
  if (!confirm("Disconnect this account? The app will no longer be able to act on it.")) return;
  try {
    await api.post("/api/v1/admin/composio/disconnect", { toolkit });
    await loadComposioAccounts();
  } catch (err) {
    showMsg("composio-msg", err.message, false);
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
  document.getElementById("generate-api-key-btn").addEventListener("click", () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const input = document.getElementById("integration-api-key");
    input.type = "text";
    input.value = key;
  });
  document.getElementById("maintenance-form").addEventListener("submit", saveMaintenance);
  document.getElementById("payments-form").addEventListener("submit", savePayments);
  document.getElementById("email-templates-form").addEventListener("submit", saveEmailTemplates);
  document.getElementById("google-signin-form").addEventListener("submit", saveGoogleSignin);
  document.getElementById("widgets-form").addEventListener("submit", saveWidgets);
  document.getElementById("booking-form").addEventListener("submit", saveBooking);
  document.getElementById("social-draft-form").addEventListener("submit", saveSocialDraft);
  try {
    const settings = await api.get("/api/v1/admin/settings");
    document.getElementById("gemini-key").value = settings.gemini_api_key || "";
    document.getElementById("openrouter-key").value = settings.openrouter_api_key || "";
    document.getElementById("openrouter-model").value = settings.openrouter_model || "";
    document.getElementById("groq-key").value = settings.groq_api_key || "";
    document.getElementById("groq-model").value = settings.groq_model || "";
    document.getElementById("serper-key").value = settings.serper_api_key || "";
    document.getElementById("slack-url").value = settings.slack_webhook_url || "";
    document.getElementById("makecom-url").value = settings.makecom_webhook_url || "";
    document.getElementById("integration-api-key").value = settings.integration_api_key || "";
    document.getElementById("notification-email").value = settings.notification_email || "";
    document.getElementById("composio-api-key").value = settings.composio_api_key || "";
    document.getElementById("composio-google-calendar-auth-config-id").value = settings.composio_google_calendar_auth_config_id || "";
    document.getElementById("composio-gmail-auth-config-id").value = settings.composio_gmail_auth_config_id || "";
    document.getElementById("composio-slack-auth-config-id").value = settings.composio_slack_auth_config_id || "";
    document.getElementById("composio-whatsapp-auth-config-id").value = settings.composio_whatsapp_auth_config_id || "";
    document.getElementById("composio-google-calendar-booking-tool").value = settings.composio_google_calendar_booking_tool || "";
    document.getElementById("composio-google-calendar-id").value = settings.composio_google_calendar_id || "";
    document.getElementById("composio-gmail-booking-tool").value = settings.composio_gmail_booking_tool || "";
    document.getElementById("composio-gmail-booking-to").value = settings.composio_gmail_booking_to || "";
    document.getElementById("composio-slack-booking-tool").value = settings.composio_slack_booking_tool || "";
    document.getElementById("composio-slack-channel").value = settings.composio_slack_channel || "";
    document.getElementById("composio-whatsapp-booking-tool").value = settings.composio_whatsapp_booking_tool || "";
    document.getElementById("composio-whatsapp-booking-to").value = settings.composio_whatsapp_booking_to || "";
    document.getElementById("maintenance-enabled").checked = !!settings.maintenance_mode;

    document.getElementById("widget-live-chat-enabled").checked = settings.live_chat_enabled !== "0";
    document.getElementById("widget-whatsapp-enabled").checked = settings.whatsapp_button_enabled !== "0";

    document.getElementById("google-client-id").value = settings.google_client_id || "";
    document.getElementById("paystack-public-key").value = settings.paystack_public_key || "";
    document.getElementById("paystack-secret-key").value = settings.paystack_secret_key || "";
    document.getElementById("pricing-currency").value = settings.pricing_currency || "GHS";
    document.getElementById("pricing-tier-1-amount").value = settings.pricing_tier_1_amount || "";
    document.getElementById("email-brand-logo-url").value = settings.email_brand_logo_url || "";
    document.getElementById("email-site-url").value = settings.email_site_url || "https://princecaleb.dev";
    EMAIL_TEMPLATE_FIELDS.forEach(([key, id]) => {
      document.getElementById(`email-tpl-${id}-subject`).value = settings[`email_tpl_${key}_subject`] || "";
      document.getElementById(`email-tpl-${id}-html`).value = settings[`email_tpl_${key}_html`] || "";
      document.getElementById(`email-tpl-${id}-text`).value = settings[`email_tpl_${key}_text`] || "";
    });

    document.getElementById("social-draft-enabled").checked = settings.social_draft_enabled === "1";
    document.getElementById("social-draft-frequency").value = settings.social_draft_frequency || "daily";

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

  await loadComposioAccounts();
})();
