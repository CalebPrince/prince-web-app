(function () {
  const grid = document.getElementById("os-agent-grid");
  if (!grid) return;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

  function render(agents) {
    document.getElementById("os-agent-count").textContent = `${agents.length} configured specialists connected`;
    grid.innerHTML = agents.map((agent, index) => `
      <article class="os-agent-node" style="--node-index:${index}">
        <header><span>${esc(agent.key).toUpperCase()}</span><i data-state="${esc(agent.status)}"></i></header>
        <h3>${esc(agent.name)}</h3>
        <p>${esc(agent.role)}</p>
        <div>${(agent.capabilities || []).map(item => `<small>${esc(item)}</small>`).join("")}</div>
        <footer>STATUS: ${esc(agent.status).toUpperCase()}</footer>
      </article>`).join("");
  }

  api.get("/api/v1/builder-os/team").then(data => render(data.agents || [])).catch(() => {
    grid.innerHTML = '<div class="os-loading">The public registry is reconnecting. The customer-service channels remain available.</div>';
    document.getElementById("os-agent-count").textContent = "Registry reconnecting";
  });
})();
