#!/usr/bin/env bash
# Tests, builds and deploys Jensuisla to Cloudflare. Stops at the first failure.
# Only committed code is deployed, so each Cloudflare version maps to a commit: it is tagged with
# the release (v1.2.0) when HEAD is a release, or the release plus the commit (v1.2.0-abc1234).
set -euo pipefail

cd "$(dirname "$0")/.."

[ -z "$(git status --porcelain)" ] || { echo "Commit your changes before deploying." >&2; exit 1; }

version="$(node -p "require('./package.json').version")"
commit="$(git rev-parse --short HEAD)"
if git describe --exact-match --tags HEAD >/dev/null 2>&1; then tag="v$version"; else tag="v$version-$commit"; fi

echo "==> Tests"
npm test --silent

echo "==> Type checks"
npm run check --silent

echo "==> Build"
npm run build --silent

echo "==> Deploy $tag"
cd worker
npx wrangler deploy --tag "$tag" --message "$(git log -1 --format=%s) ($commit)"
