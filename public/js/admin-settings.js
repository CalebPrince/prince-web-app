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
      gemini_model: document.getElementById("gemini-model").value.trim(),
      openrouter_api_key: document.getElementById("openrouter-key").value.trim(),
      openrouter_model: document.getElementById("openrouter-model").value.trim(),
      groq_api_key: document.getElementById("groq-key").value.trim(),
      groq_model: document.getElementById("groq-model").value.trim(),
      twilio_auth_token: document.getElementById("twilio-auth-token").value.trim(),
      twilio_account_sid: document.getElementById("twilio-account-sid").value.trim(),
      twilio_whatsapp_number: document.getElementById("twilio-whatsapp-number").value.trim(),
      owner_whatsapp_number: document.getElementById("owner-whatsapp-number").value.trim(),
      serper_api_key: document.getElementById("serper-key").value.trim(),
      slack_webhook_url: document.getElementById("slack-url").value.trim(),
      integration_api_key: document.getElementById("integration-api-key").value.trim(),
      notification_email: document.getElementById("notification-email").value.trim(),
      composio_api_key: document.getElementById("composio-api-key").value.trim(),
      composio_google_calendar_auth_config_id: document.getElementById("composio-google-calendar-auth-config-id").value.trim(),
      composio_gmail_auth_config_id: document.getElementById("composio-gmail-auth-config-id").value.trim(),
      composio_slack_auth_config_id: document.getElementById("composio-slack-auth-config-id").value.trim(),
      composio_linkedin_auth_config_id: document.getElementById("composio-linkedin-auth-config-id").value.trim(),
      composio_google_calendar_booking_tool: document.getElementById("composio-google-calendar-booking-tool").value.trim(),
      composio_google_calendar_id: document.getElementById("composio-google-calendar-id").value.trim(),
      composio_gmail_booking_tool: document.getElementById("composio-gmail-booking-tool").value.trim(),
      composio_gmail_booking_to: document.getElementById("composio-gmail-booking-to").value.trim(),
      composio_slack_booking_tool: document.getElementById("composio-slack-booking-tool").value.trim(),
      composio_slack_channel: document.getElementById("composio-slack-channel").value.trim(),
      composio_linkedin_post_tool: document.getElementById("composio-linkedin-post-tool").value.trim(),
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

async function saveAppearance(e) {
  e.preventDefault();
  try {
    await api.put("/api/v1/admin/settings", {
      default_theme: document.getElementById("default_theme").value,
      splash_screen_enabled: document.getElementById("splash_screen_enabled").value,
      animation_style: document.getElementById("animation_style").value,
    });
    showMsg("appearance-msg", "Saved — the public site reflects your changes immediately.", true);
  } catch (err) {
    showMsg("appearance-msg", err.message, false);
  }
}

// Grey out the day/time controls when the "Restrict to specific hours" master
// toggle is off — otherwise it looks like unticking a day takes the chat
// offline, when in fact the day/time settings only apply once restriction is on.
function syncHoursEnabledState() {
  const enabled = document.getElementById("hours-enabled").checked;
  document.querySelectorAll(".hours-day, #hours-start, #hours-end, #hours-timezone")
    .forEach(el => { el.disabled = !enabled; });
  const note = document.getElementById("hours-disabled-note");
  if (note) note.classList.toggle("d-none", enabled);
}

function wireHoursControls() {
  const toggle = document.getElementById("hours-enabled");
  if (toggle) toggle.addEventListener("change", syncHoursEnabledState);
  syncHoursEnabledState();
}

async function saveChatHours(e) {
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
    showMsg("chat-hours-msg", "Saved — takes effect immediately.", true);
    const settings = await api.get("/api/v1/admin/settings");
    await renderChatLiveStatus(settings);
  } catch (err) {
    showMsg("chat-hours-msg", err.message, false);
  }
}

// Show whether Live Chat is online *right now* and, when it's not, the actual
// reason — the #1 gotcha is that the chat stays offline until an AI provider
// key is set, regardless of the schedule. The authoritative online flag comes
// from the public /chat/status endpoint; the settings we already loaded tell us
// why it's off (no key vs. outside scheduled hours).
async function renderChatLiveStatus(settings) {
  const el = document.getElementById("chat-live-status");
  if (!el) return;
  const hasKey = !!(settings.gemini_api_key || settings.openrouter_api_key || settings.groq_api_key);

  let online = false;
  try { online = !!(await api.get("/api/v1/chat/status")).online; } catch (_) { /* treat as offline */ }

  el.classList.remove("d-none", "alert-success", "alert-warning");
  if (online) {
    el.classList.add("alert-success");
    el.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i>Live Chat is <strong>online</strong> right now — visitors can chat.';
    return;
  }

  let reason;
  if (!hasKey) {
    reason = "no AI provider key is set — add a Gemini, OpenRouter, or Groq key above under Integrations.";
  } else if (settings.chat_hours_enabled) {
    reason = "the current day/time is outside the scheduled hours set below.";
  } else {
    reason = "the assistant is currently unavailable.";
  }
  el.classList.add("alert-warning");
  el.innerHTML = '<i class="bi bi-exclamation-triangle-fill me-1"></i>Live Chat is <strong>offline</strong> right now — ' + reason;
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

async function sendTestEmail(btn) {
  const { key, id } = btn.dataset;
  const status = btn.parentElement.querySelector(".test-email-status");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Sending…";
  status.className = "test-email-status small text-muted-custom";
  status.textContent = "";
  try {
    const r = await api.post("/api/v1/admin/settings/test-email", {
      key,
      subject: document.getElementById(`email-tpl-${id}-subject`).value.trim(),
      html: document.getElementById(`email-tpl-${id}-html`).value.trim(),
      text: document.getElementById(`email-tpl-${id}-text`).value.trim(),
    });
    status.className = "test-email-status small text-success";
    status.textContent = `✓ Sent to ${r.to}`;
  } catch (err) {
    status.className = "test-email-status small text-danger";
    status.textContent = err.message;
  }
  btn.disabled = false;
  btn.textContent = original;
}

// Add a "Send test to my inbox" button to each template's accordion body,
// injected from the shared field list so the 15 accordions stay untouched.
function wireTestEmailButtons() {
  EMAIL_TEMPLATE_FIELDS.forEach(([key, id]) => {
    const subject = document.getElementById(`email-tpl-${id}-subject`);
    const body = subject && subject.closest(".accordion-body");
    if (!body) return;
    const row = document.createElement("div");
    row.className = "d-flex align-items-center gap-2 mt-2";
    row.innerHTML = '<button type="button" class="btn btn-sm btn-outline-secondary test-email-btn">Send test to my inbox</button>'
      + '<span class="test-email-status small text-muted-custom"></span>';
    const btn = row.querySelector("button");
    btn.dataset.key = key;
    btn.dataset.id = id;
    btn.addEventListener("click", () => sendTestEmail(btn));
    body.appendChild(row);
  });
}

async function saveSmtp(e) {
  e.preventDefault();
  try {
    await api.put("/api/v1/admin/settings", {
      smtp_gmail_address: document.getElementById("smtp-gmail-address").value.trim(),
      smtp_app_password: document.getElementById("smtp-app-password").value.replace(/\s+/g, ""),
      mail_from: document.getElementById("mail-from-address").value.trim(),
      mail_from_name: document.getElementById("mail-from-name").value.trim(),
    });
    showMsg("smtp-msg", "Saved. New emails will use Gmail SMTP immediately.", true);
  } catch (err) {
    showMsg("smtp-msg", err.message, false);
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
  wireTestEmailButtons();
  document.getElementById("smtp-form").addEventListener("submit", saveSmtp);
  document.getElementById("google-signin-form").addEventListener("submit", saveGoogleSignin);
  document.getElementById("widgets-form").addEventListener("submit", saveWidgets);
  document.getElementById("booking-form").addEventListener("submit", saveBooking);
  document.getElementById("chat-hours-form").addEventListener("submit", saveChatHours);
  document.getElementById("appearance-form").addEventListener("submit", saveAppearance);
  document.getElementById("social-draft-form").addEventListener("submit", saveSocialDraft);
  try {
    const settings = await api.get("/api/v1/admin/settings");
    document.getElementById("gemini-key").value = settings.gemini_api_key || "";
    document.getElementById("gemini-model").value = settings.gemini_model || "";
    document.getElementById("openrouter-key").value = settings.openrouter_api_key || "";
    document.getElementById("openrouter-model").value = settings.openrouter_model || "";
    document.getElementById("groq-key").value = settings.groq_api_key || "";
    document.getElementById("groq-model").value = settings.groq_model || "";
    document.getElementById("twilio-auth-token").value = settings.twilio_auth_token || "";
    document.getElementById("twilio-account-sid").value = settings.twilio_account_sid || "";
    document.getElementById("twilio-whatsapp-number").value = settings.twilio_whatsapp_number || "";
    document.getElementById("owner-whatsapp-number").value = settings.owner_whatsapp_number || "";
    document.getElementById("serper-key").value = settings.serper_api_key || "";
    document.getElementById("slack-url").value = settings.slack_webhook_url || "";
    document.getElementById("integration-api-key").value = settings.integration_api_key || "";
    document.getElementById("notification-email").value = settings.notification_email || "";
    document.getElementById("smtp-gmail-address").value = settings.smtp_gmail_address || "";
    document.getElementById("smtp-app-password").value = settings.smtp_app_password || "";
    document.getElementById("mail-from-address").value = settings.mail_from || "no-reply@princecaleb.dev";
    document.getElementById("mail-from-name").value = settings.mail_from_name || "Prince Caleb";
    document.getElementById("composio-api-key").value = settings.composio_api_key || "";
    document.getElementById("composio-google-calendar-auth-config-id").value = settings.composio_google_calendar_auth_config_id || "";
    document.getElementById("composio-gmail-auth-config-id").value = settings.composio_gmail_auth_config_id || "";
    document.getElementById("composio-slack-auth-config-id").value = settings.composio_slack_auth_config_id || "";
    document.getElementById("composio-linkedin-auth-config-id").value = settings.composio_linkedin_auth_config_id || "";
    document.getElementById("composio-google-calendar-booking-tool").value = settings.composio_google_calendar_booking_tool || "";
    document.getElementById("composio-google-calendar-id").value = settings.composio_google_calendar_id || "";
    document.getElementById("composio-gmail-booking-tool").value = settings.composio_gmail_booking_tool || "";
    document.getElementById("composio-gmail-booking-to").value = settings.composio_gmail_booking_to || "";
    document.getElementById("composio-slack-booking-tool").value = settings.composio_slack_booking_tool || "";
    document.getElementById("composio-slack-channel").value = settings.composio_slack_channel || "";
    document.getElementById("composio-linkedin-post-tool").value = settings.composio_linkedin_post_tool || "";
    document.getElementById("maintenance-enabled").checked = !!settings.maintenance_mode;

    document.getElementById("widget-live-chat-enabled").checked = settings.live_chat_enabled !== "0";
    document.getElementById("widget-whatsapp-enabled").checked = settings.whatsapp_button_enabled !== "0";

    document.getElementById("google-client-id").value = settings.google_client_id || "";
    document.getElementById("paystack-public-key").value = settings.paystack_public_key || "";
    document.getElementById("paystack-secret-key").value = settings.paystack_secret_key || "";
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

    document.getElementById("hours-enabled").checked = !!settings.chat_hours_enabled;
    const hoursDays = (settings.chat_hours_days || "").split(",").map(d => d.trim()).filter(Boolean);
    document.querySelectorAll(".hours-day").forEach(el => { el.checked = hoursDays.includes(el.value); });
    document.getElementById("hours-start").value = settings.chat_hours_start || "";
    document.getElementById("hours-end").value = settings.chat_hours_end || "";
    document.getElementById("hours-timezone").value = settings.chat_timezone || "";
    wireHoursControls();
    await renderChatLiveStatus(settings);

    document.getElementById("default_theme").value = settings.default_theme || "";
    document.getElementById("splash_screen_enabled").value = settings.splash_screen_enabled || "1";
    document.getElementById("animation_style").value = settings.animation_style || "slide-up";
  } catch (_) { /* fields stay empty */ }

  await loadComposioAccounts();
})();
