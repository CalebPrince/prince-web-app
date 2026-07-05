async function requireAdminAuth() {
  try {
    return await api.get("/api/v1/auth/me");
  } catch (_) {
    window.location.href = "/admin/login.html";
    return null;
  }
}

function wireLogout() {
  const link = document.getElementById("logout-link");
  if (!link) return;
  link.addEventListener("click", async (e) => {
    e.preventDefault();
    await api.post("/api/v1/auth/logout");
    window.location.href = "/admin/login.html";
  });
}
