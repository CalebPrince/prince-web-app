# princecaleb.dev — Next.js frontend

Next.js (App Router) frontend for [princecaleb.dev](https://princecaleb.dev): the public
marketing site, the AI chat widget ("Lisa"), and the admin dashboard. This is a rebuild of
an earlier PHP-served site — the frontend here is a restyled, full-parity port of the
legacy widget (`public/js/ai-widget.js`, `agent-face.js`, `elevenlabs-tts.js`), not a
fresh implementation.

This app has **no backend of its own**. It's a thin client over the existing backend at
the repo root (`../`, a Laravel-style PHP app — see its own `database/`, `storage/`,
`config/`), reached through `/api/v1/*`:

- Dev: `http://localhost:8017`
- Production: `https://princecaleb.dev` (same origin — proxied/rewritten, not CORS)

See `src/lib/api.ts` for the exact base-URL logic.

## What's actually here

- **Public site** — marketing pages, pricing, case studies.
- **Chat widget** (`src/components/ChatWidget.tsx`) — "Lisa," with typed and voice input,
  ElevenLabs text-to-speech read-aloud, and an idle-timeout goodbye sequence. Talks to
  `/api/v1/chat/*` on the backend above; carries no AI provider logic itself.
- **Live avatar / voice agent** (`src/components/LisaVideoAgent.tsx`, `VoiceDemo.tsx`) —
  real-time video/voice agent via LiveAvatar and LiveKit.
- **Admin dashboard** (`src/app/admin/`) — settings, WhatsApp template management (Twilio/
  Meta), Composio account connections, and an AI provider test/configuration panel
  (`AiTestResult` in `SettingsClient.tsx`) covering multiple configured providers.

## Where the AI provider keys live

**Not in this repo, and not in any local `.env` file.** They're stored in the backend's
production database and managed through the admin dashboard above, the same pattern
jdlcore uses (a settings table, not environment variables). Grepping this codebase for key
names or provider URLs will not find them — that's expected, not a misconfiguration.

## Getting started

```bash
npm install
npm run dev
```

Runs on [http://localhost:3000](http://localhost:3000). The backend (`../`) needs to be
running separately on `:8017` for anything that calls `/api/v1/*` to work — the chat
widget, the admin dashboard, and auth all depend on it.

## Deployment

Deployed to the same LiteSpeed-hosted infrastructure as the backend, **not Vercel** —
despite this being a stock `create-next-app` scaffold originally, the default Vercel
deploy path in the old boilerplate README did not apply here and has been removed.
