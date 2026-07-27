(function () {
  const esc = value => { const div = document.createElement("div"); div.textContent = String(value == null ? "" : value); return div.innerHTML; };
  const count = (rows, key) => Number((rows.find(item => item.event_type === key) || {}).count || 0);
  const ago = value => {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value + "Z").getTime()) / 1000));
    if (seconds < 60) return "just now";
    if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
    if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
    return Math.floor(seconds / 86400) + "d ago";
  };
  async function load() {
    try {
      const data = await api.get("/api/v1/admin/voice-demo/stats");
      const s = data.summary || {};
      document.getElementById("voice-summary").innerHTML = [
        ["Sessions", s.sessions || 0, "All demo opens"], ["Engaged", s.engaged || 0, "Asked at least once"],
        ["Web", s.web_sessions || 0, "Browser demo"], ["Phone", s.phone_sessions || 0, "Twilio calls"]
      ].map(item => `<article><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></article>`).join("");
      const events = data.events || [];
      const funnel = [["Demo started", count(events, "demo_started")], ["Question answered", count(events, "answer_received")], ["CTA clicked", count(events, "cta_clicked")]];
      const max = Math.max(1, ...funnel.map(item => item[1]));
      document.getElementById("voice-funnel").innerHTML = funnel.map(item => `<div class="voice-funnel-row"><div><span>${item[0]}</span><strong>${item[1]}</strong></div><i><b style="width:${Math.round(item[1] / max * 100)}%"></b></i></div>`).join("");
      document.getElementById("voice-phone-status").innerHTML = `<div class="voice-phone-state ${data.telephony_enabled ? "is-on" : ""}"><span>${data.telephony_enabled ? "Enabled" : "Not active"}</span><strong>${esc(data.voice_number || "No voice number configured")}</strong></div><p class="small text-muted-custom mt-3 mb-2">Incoming call webhook</p><code class="d-block text-break">${esc(data.webhook_url)}</code><p class="small text-muted-custom mt-3 mb-2">Status callback</p><code class="d-block text-break">${esc(data.status_callback_url)}</code><p class="small text-muted-custom mt-3 mb-0">${data.telephony_enabled ? "Verified inbound calls use Lisa's customer-service prompt." : "Add a Twilio voice number and enable it in Settings after approval."}</p>`;
      const whatsapp = data.whatsapp || {};
      document.getElementById("whatsapp-production-status").innerHTML = `<div class="voice-phone-state ${whatsapp.configured ? "is-on" : ""}"><span>${whatsapp.configured ? "Website configured" : "Setup incomplete"}</span><strong>${esc(whatsapp.number || "No sender number saved")}</strong></div><p class="small text-muted-custom mt-3 mb-2">Incoming message webhook</p><code class="d-block text-break">${esc(whatsapp.webhook_url || "")}</code><p class="small text-muted-custom mt-3 mb-0">Keep using the sandbox while the production sender and Regulatory Bundle are under review.</p>`;
      document.getElementById("twilio-readiness").innerHTML = (data.readiness || []).map(item => `<div class="d-flex align-items-center gap-2 p-2 rounded" style="background:var(--bg-soft)"><i class="bi ${item.complete ? "bi-check-circle-fill text-success" : (item.external ? "bi-hourglass-split text-warning" : "bi-circle text-muted")}"></i><span class="small flex-grow-1">${esc(item.label)}</span>${item.external && !item.complete ? '<span class="badge text-bg-warning">Twilio/Meta</span>' : ""}</div>`).join("");
      const calls = data.marketing_calls || {};
      document.getElementById("marketing-call-status").innerHTML = `<div class="d-flex gap-4 mb-3"><div><span class="small text-muted-custom d-block">Phone-only leads</span><strong class="fs-4">${Number(calls.queued || 0)}</strong></div><div><span class="small text-muted-custom d-block">Lisa calls today</span><strong class="fs-4">${Number(calls.ai_calls_today || 0)} / ${Number(calls.ai_call_daily_cap || 5)}</strong></div><div><span class="small text-muted-custom d-block">Remaining</span><strong class="fs-4">${Number(calls.ai_calls_remaining || 0)}</strong></div></div><div class="alert alert-light border small mb-3"><i class="bi bi-person-check me-1"></i>Each AI call requires your approval and confirmation that the recipient requested or consented to it. Lisa then places that one call; there is no unattended batch dialing.</div><a class="btn btn-outline-secondary btn-sm" href="/admin/marketing-leads.html"><i class="bi bi-bullseye me-1"></i>Open call list</a>`;
      const rows = data.recent || [];
      document.getElementById("voice-session-rows").innerHTML = rows.map(row => `<tr><td><span class="voice-channel"><i class="bi ${row.channel === "phone" ? "bi-telephone" : "bi-browser-chrome"}"></i>${esc(row.channel)}</span></td><td>${esc(row.last_question || "Opened without a question")}</td><td>${Number(row.turn_count || 0)}</td><td>${esc(row.provider || "fallback")}</td><td>${ago(row.updated_at)}</td></tr>`).join("");
      document.getElementById("voice-empty").classList.toggle("d-none", rows.length > 0);
    } catch (error) {
      document.getElementById("voice-summary").innerHTML = `<div class="alert alert-danger">${esc(error.message)}</div>`;
    }
  }
  load();
})();
