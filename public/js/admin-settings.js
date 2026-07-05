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

(async function init() {
  const user = await requireAdminAuth();
  if (!user) return;
  wireLogout();

  document.getElementById("email").value = user.email;
  document.getElementById("email-form").addEventListener("submit", saveEmail);
  document.getElementById("password-form").addEventListener("submit", savePassword);
})();
