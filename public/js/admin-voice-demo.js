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
  const duration = value => {
    const seconds = Math.max(0, Number(value || 0));
    if (seconds < 60) return seconds + "s";
    return Math.floor(seconds / 60) + "m " + (seconds % 60) + "s";
  };
  const callStatus = value => {
    const status = String(value || "unknown").toLowerCase();
    const tone = ["completed", "in-progress", "ringing"].includes(status)
      ? "success"
      : (["failed", "busy", "no-answer", "canceled"].includes(status) ? "danger" : "secondary");
    return `<span class="badge rounded-pill text-bg-${tone}">${esc(status.replaceAll("-", " "))}</span>`;
  };
  const renderCallLogs = rows => {
    document.getElementById("voice-call-rows").innerHTML = rows.map(row => {
      const outbound = row.direction === "outbound";
      const started = row.created_at || row.updated_at;
      return `<tr>
        <td><span class="voice-call-direction ${outbound ? "is-outbound" : "is-inbound"}"><i class="bi ${outbound ? "bi-telephone-outbound" : "bi-telephone-inbound"}"></i>${outbound ? "Outbound" : "Inbound"}</span></td>
        <td><a class="voice-phone-number" href="tel:${esc(row.from_number || "")}">${esc(row.from_number || "Unknown")}</a></td>
        <td><a class="voice-phone-number" href="tel:${esc(row.to_number || "")}">${esc(row.to_number || "Unknown")}</a></td>
        <td>${callStatus(row.status)}</td>
        <td>${row.email_followup_status && row.email_followup_status !== "not_requested" ? callStatus(row.email_followup_status) : '<span class="text-muted-custom small">Not requested</span>'}</td>
        <td>${row.whatsapp_followup_status ? callStatus(row.whatsapp_followup_status) : '<span class="text-muted-custom small">Not requested</span>'}</td>
        <td>${duration(row.duration_seconds)}</td>
        <td>${esc(row.lead_name || (outbound ? "Manual / unlinked" : "Caller"))}</td>
        <td title="${esc(started || "")}">${started ? ago(started) : "Unknown"}</td>
        <td class="text-end">${row.session_id ? `<button type="button" class="btn btn-sm btn-outline-dark voice-view-conversation" data-session-id="${Number(row.session_id)}"><i class="bi bi-chat-text me-1"></i>View conversation</button>` : '<span class="text-muted-custom small">Unavailable</span>'}</td>
      </tr>`;
    }).join("");
    document.getElementById("voice-call-empty").classList.toggle("d-none", rows.length > 0);
  };
  const sessionActivity = row => {
    if (row.last_question) return row.last_question;
    if (row.call_direction === "outbound") {
      const business = row.call_business_name || "Outbound recipient";
      const status = String(row.call_status || "completed").replaceAll("-", " ");
      return `${business}: call ${status}; no speech captured`;
    }
    if (row.channel === "phone") return "Phone call opened; no speech captured";
    return "Demo opened without a question";
  };
  let voiceSessions = [];
  const renderConversation = row => {
    const transcript = Array.isArray(row.transcript) ? row.transcript : [];
    const direction = row.call_direction === "outbound" ? "Outbound" : (row.channel === "phone" ? "Inbound" : "Browser demo");
    const status = String(row.call_status || (row.channel === "web" ? "completed" : "unknown")).replaceAll("-", " ");
    const durationLabel = row.channel === "phone" ? duration(row.duration_seconds) : "Web session";
    const party = row.call_business_name || (row.channel === "phone" ? (row.call_direction === "outbound" ? row.to_number : row.from_number) : "Website visitor");
    document.getElementById("voice-conversation-title").textContent = party || "Lisa voice conversation";
    document.getElementById("voice-conversation-meta").innerHTML = [
      ["Channel", direction],
      ["Status", status],
      ["Duration", durationLabel],
      ["Provider", row.provider || "fallback"],
      ["From", row.from_number || "Not recorded"],
      ["To", row.to_number || "Not recorded"]
    ].map(item => `<div><span>${esc(item[0])}</span><strong>${esc(item[1])}</strong></div>`).join("");
    document.getElementById("voice-conversation-count").textContent = `${transcript.length} turn${transcript.length === 1 ? "" : "s"}`;
    document.getElementById("voice-conversation-transcript").innerHTML = transcript.length
      ? transcript.map((turn, index) => {
          const lisa = turn.role === "assistant";
          return `<article class="voice-transcript-turn ${lisa ? "is-lisa" : "is-customer"}">
            <div class="voice-transcript-avatar">${lisa ? "L" : "C"}</div>
            <div><header><strong>${lisa ? "Lisa" : "Customer"}</strong><span>Turn ${index + 1}</span></header><p>${esc(turn.text)}</p></div>
          </article>`;
        }).join("")
      : `<div class="voice-transcript-empty"><i class="bi bi-mic-mute"></i><strong>No speech was captured</strong><p>The call connected, but no customer or Lisa speech was stored for this session.</p></div>`;
  };
  async function load() {
    try {
      const data = await api.get("/api/v1/admin/voice-demo/stats");
      const s = data.summary || {};
      document.getElementById("voice-summary").innerHTML = [
        ["Sessions", s.sessions || 0, "All demo opens"], ["Engaged", s.engaged || 0, "Asked at least once"],
        ["Web", s.web_sessions || 0, "Browser demo"], ["Phone", s.phone_sessions || 0, "ElevenLabs calls"]
      ].map(item => `<article><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></article>`).join("");
      const events = data.events || [];
      const funnel = [["Demo started", count(events, "demo_started")], ["Question answered", count(events, "answer_received")], ["CTA clicked", count(events, "cta_clicked")]];
      const max = Math.max(1, ...funnel.map(item => item[1]));
      document.getElementById("voice-funnel").innerHTML = funnel.map(item => `<div class="voice-funnel-row"><div><span>${item[0]}</span><strong>${item[1]}</strong></div><i><b style="width:${Math.round(item[1] / max * 100)}%"></b></i></div>`).join("");
      document.getElementById("voice-phone-status").innerHTML = `<div class="voice-phone-state ${data.telephony_enabled ? "is-on" : ""}"><span>${data.telephony_enabled ? "Enabled" : "Not active"}</span></div><p class="small text-muted-custom mt-3 mb-2">Conversation initiation webhook</p><code class="d-block text-break">${esc(data.webhook_url)}</code><p class="small text-muted-custom mt-3 mb-2">Post-call webhook</p><code class="d-block text-break">${esc(data.post_call_webhook_url)}</code><p class="small text-muted-custom mt-3 mb-0">${data.telephony_enabled ? "Verified inbound calls use Lisa's customer-service prompt." : "Save the ElevenLabs phone agent ID and phone number ID in Settings after connecting a SIP trunk."}</p>`;
      document.getElementById("elevenlabs-phone-readiness").innerHTML = (data.readiness || []).map(item => `<div class="d-flex align-items-center gap-2 p-2 rounded" style="background:var(--bg-soft)"><i class="bi ${item.complete ? "bi-check-circle-fill text-success" : "bi-circle text-muted"}"></i><span class="small flex-grow-1">${esc(item.label)}</span></div>`).join("");
      const calls = data.marketing_calls || {};
      document.getElementById("marketing-call-status").innerHTML = `<div class="d-flex gap-4 mb-3"><div><span class="small text-muted-custom d-block">Phone-only leads</span><strong class="fs-4">${Number(calls.queued || 0)}</strong></div><div><span class="small text-muted-custom d-block">Lisa calls today</span><strong class="fs-4">${Number(calls.ai_calls_today || 0)} / ${Number(calls.ai_call_daily_cap || 5)}</strong></div><div><span class="small text-muted-custom d-block">Remaining</span><strong class="fs-4">${Number(calls.ai_calls_remaining || 0)}</strong></div></div><div class="alert alert-light border small mb-3"><i class="bi bi-person-check me-1"></i>Each AI call requires your approval and confirmation that the recipient requested or consented to it. Lisa then places that one call; there is no unattended batch dialing.</div><a class="btn btn-outline-secondary btn-sm" href="/admin/marketing-leads.html"><i class="bi bi-bullseye me-1"></i>Open call list</a>`;
      voiceSessions = data.recent || [];
      renderCallLogs(data.call_logs || []);
      document.getElementById("voice-session-rows").innerHTML = voiceSessions.map(row => `<tr><td><span class="voice-channel"><i class="bi ${row.channel === "phone" ? "bi-telephone" : "bi-browser-chrome"}"></i>${esc(row.channel)}</span></td><td>${esc(sessionActivity(row))}</td><td>${Number(row.turn_count || 0)}</td><td>${esc(row.provider || "fallback")}</td><td>${ago(row.updated_at)}</td><td class="text-end"><button type="button" class="btn btn-sm btn-outline-dark voice-view-conversation" data-session-id="${Number(row.id)}"><i class="bi bi-chat-text me-1"></i>View conversation</button></td></tr>`).join("");
      document.getElementById("voice-empty").classList.toggle("d-none", voiceSessions.length > 0);
    } catch (error) {
      document.getElementById("voice-summary").innerHTML = `<div class="alert alert-danger">${esc(error.message)}</div>`;
    }
  }
  document.getElementById("refresh-call-logs").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Refreshing';
    await load();
    button.disabled = false;
    button.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i>Refresh logs';
  });
  const openConversation = event => {
    const button = event.target.closest(".voice-view-conversation");
    if (!button) return;
    const row = voiceSessions.find(item => Number(item.id) === Number(button.dataset.sessionId));
    if (!row) return;
    renderConversation(row);
    bootstrap.Modal.getOrCreateInstance(document.getElementById("voice-conversation-modal")).show();
  };
  document.getElementById("voice-session-rows").addEventListener("click", openConversation);
  document.getElementById("voice-call-rows").addEventListener("click", openConversation);
  load();
})();
