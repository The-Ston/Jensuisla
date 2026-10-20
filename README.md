# Jensuisla

Discord Activity for reading a book together with friends. Each reader declares their progress
(chapter, page or percent); comments, emoji reactions and GIFs are anchored to a position in the
book and only shown to readers who already reached it.

- `activity/` — the Activity UI (Svelte + Vite + Discord Embedded App SDK).
- `worker/` — Cloudflare Worker: serves the Activity, its API and Discord interactions.
  Data has no database: it is stored as bot messages in hidden Discord channels, and a single
  Durable Object serializes writes.

## Development

```sh
npm install
npm test                 # worker unit tests
npm run dev:activity     # rebuilds the Activity on change
npm run dev:worker       # wrangler dev on http://localhost:8787
cloudflared tunnel --url http://localhost:8787
```

Secrets go in `worker/.dev.vars` locally and `wrangler secret put` in production:
`DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_SECRET`, `GIPHY_API_KEY` (optional).
