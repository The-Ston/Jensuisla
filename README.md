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

## Brand

`brand/` holds the app icon and the Activity cover: SVG sources and the PNG exports uploaded to
the Discord Developer Portal (icon 1024×1024, cover 1920×1080). `activity/public/favicon.svg` is a
copy of the icon.

## License and credits

Jensuisla is released under the [MIT License](LICENSE).

- Emoji graphics: [Twemoji](https://github.com/jdecked/twemoji), licensed under
  [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- GIFs: Powered by [GIPHY](https://giphy.com).
- Book data and covers: [Open Library](https://openlibrary.org).
- Fonts: IBM Plex Sans and Literata, under the SIL Open Font License 1.1.

The build writes `licenses.txt` next to the Activity with the license of every bundled package
(`activity/licenses-plugin.ts`); the Activity links to it from its home screen footer.
