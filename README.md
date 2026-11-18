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

## Releases and deploys

The version lives in the root `package.json` and is shown in the app footer with the commit it was
built from. Changes are listed in [CHANGELOG.md](CHANGELOG.md):

1. Add entries under "Unreleased" in `CHANGELOG.md` as you go.
2. `bash scripts/release.sh patch|minor|major` bumps the version, dates the changelog, commits,
   tags `vX.Y.Z`, pushes and publishes the GitHub release.
3. `bash scripts/deploy.sh` deploys committed code only; the Cloudflare version is tagged `vX.Y.Z`
   (or `vX.Y.Z-<commit>` between releases) with the commit message, so any deploy can be traced
   and rolled back from the Cloudflare dashboard.

## Brand

`brand/` holds the app icon and the Activity cover: SVG sources and the PNG exports uploaded to
the Discord Developer Portal (icon 1024×1024, Activity cover and background 1920×1080, bot profile banner 1360×480,
Activity video preview 640×360). The video is rendered from `activity-preview.html` (one frame per
`?t=` second, e.g. with a headless browser) and encoded with ffmpeg. `activity/public/favicon.svg` is a
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
