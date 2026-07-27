import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";

const port = Number(process.env.PORT || 8080);
const appBaseUrl = (process.env.APP_BASE_URL || "https://princecaleb.dev").replace(/\/+$/, "");
const relaySecret = process.env.RELAY_SHARED_SECRET || "";
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || "";
const allowUnsignedLocal = process.env.ALLOW_UNSIGNED_LOCAL === "1";

if (!relaySecret) throw new Error("RELAY_SHARED_SECRET is required.");
if (!twilioAuthToken && !allowUnsignedLocal) throw new Error("TWILIO_AUTH_TOKEN is required.");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "lisa-voice-relay" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const protocol = forwardedProto === "http" ? "ws" : "wss";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const requestUrl = `${protocol}://${host}${req.url}`;
  const signature = String(req.headers["x-twilio-signature"] || "");
  const valid = allowUnsignedLocal
    || (signature !== "" && twilio.validateRequest(twilioAuthToken, signature, requestUrl, {}));

  if (!valid || !req.url?.startsWith("/conversation")) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws));
});

wss.on("connection", ws => {
  let callSid = "";
  let processing = false;

  ws.on("message", async raw => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "setup") {
      callSid = String(message.callSid || "");
      return;
    }
    if (message.type !== "prompt" || message.last !== true || processing || !callSid) return;

    const speech = String(message.voicePrompt || "").trim();
    if (!speech) return;
    processing = true;
    try {
      const response = await fetch(`${appBaseUrl}/api/v1/voice/twilio/relay-turn`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-relay-secret": relaySecret
        },
        body: JSON.stringify({ call_sid: callSid, speech }),
        signal: AbortSignal.timeout(85000)
      });
      const data = await response.json();
      if (!response.ok || typeof data.reply !== "string" || !data.reply.trim()) {
        throw new Error(data.error || `Application returned HTTP ${response.status}`);
      }
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({
        type: "text",
        token: data.reply.trim(),
        last: true,
        interruptible: true,
        preemptible: true
      }));
      if (data.end === true) {
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "end",
              handoffData: JSON.stringify({ reason: "conversation-complete" })
            }));
          }
        }, 2500);
      }
    } catch (error) {
      console.error("relay turn failed", { callSid, error: error.message });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "text",
          token: "I'm sorry, I'm having trouble responding right now. Please try again shortly.",
          last: true,
          interruptible: true
        }));
      }
    } finally {
      processing = false;
    }
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Lisa voice relay listening on port ${port}`);
});
