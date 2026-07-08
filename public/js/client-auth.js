async function requireClientAuth() {
  try {
    return await clientApi.get("/api/v1/client/me");
  } catch (_) {
    window.location.href = "/client/login.html";
    return null;
  }
}

function wireClientLogout() {
  const link = document.getElementById("client-logout-link");
  if (!link) return;
  link.addEventListener("click", async (e) => {
    e.preventDefault();
    await clientApi.post("/api/v1/client/auth/logout");
    window.location.href = "/client/login.html";
  });
}
