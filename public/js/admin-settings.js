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
    });
    showMsg("integrations-msg", "Saved — Live Chat will use the new keys immediately.", true);
  } catch (err) {
    showMsg("integrations-msg", err.message, false);
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

  document.getElementById("integrations-form").addEventListener("submit", saveIntegrations);
  document.getElementById("test-ai-btn").addEventListener("click", testAi);
  try {
    const settings = await api.get("/api/v1/admin/settings");
    document.getElementById("gemini-key").value = settings.gemini_api_key || "";
    document.getElementById("slack-url").value = settings.slack_webhook_url || "";
  } catch (_) { /* fields stay empty */ }
})();
