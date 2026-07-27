# Lisa ConversationRelay companion

This small persistent Node service bridges Twilio ConversationRelay WebSockets
to the main PHP application's secure relay-turn endpoint. The PHP application
continues to own prompts, AI calls, transcripts, opt-outs, callbacks, and lead
outcomes.

## Deploy

Deploy this directory to a host that supports always-on Node processes and
WebSockets (for example Railway or Render). Namecheap shared PHP hosting cannot
host this persistent connection.

Set:

- `APP_BASE_URL=https://princecaleb.dev`
- `TWILIO_AUTH_TOKEN` to the same Twilio Auth Token used by the main site
- `RELAY_SHARED_SECRET` to a new long random value

The start command is `npm start`. Confirm `https://YOUR-HOST/health` returns
`{"ok":true,...}`. The WebSocket endpoint is:

`wss://YOUR-HOST/conversation`

In the website admin Settings, save that endpoint and the same relay secret,
then enable **Use natural ConversationRelay calls**. Until all three values are
present and valid, the PHP application automatically keeps using the existing
Twilio `<Gather>` call flow.
