# Lisa ConversationRelay companion

This small persistent Node service bridges Twilio ConversationRelay WebSockets
to the main PHP application's secure relay-turn endpoint. The PHP application
continues to own prompts, AI calls, transcripts, opt-outs, callbacks, and lead
outcomes.

## Deploy

Deploy this directory as a cPanel Node.js application mounted at
`https://princecaleb.dev/voice-relay`. The application remains separate from
the PHP document root even though it uses the existing domain and certificate.

Set:

- `APP_BASE_URL=https://princecaleb.dev`
- `PUBLIC_WEBSOCKET_URL=wss://princecaleb.dev/voice-relay/conversation`
- `TWILIO_AUTH_TOKEN` to the same Twilio Auth Token used by the main site
- `RELAY_SHARED_SECRET` to a new long random value

The start command is `npm start`. Confirm
`https://princecaleb.dev/voice-relay/health` returns
`{"ok":true,...}`. The WebSocket endpoint is:

`wss://princecaleb.dev/voice-relay/conversation`

The application root also returns JSON with an explicit content type. This is
intentional: CloudLinux's Node Selector checks the base application URL after
`npm install` and can crash while comparing a missing MIME type.

In the website admin Settings, save that endpoint and the same relay secret,
then enable **Use natural ConversationRelay calls**. Until all three values are
present and valid, the PHP application automatically keeps using the existing
Twilio `<Gather>` call flow.
