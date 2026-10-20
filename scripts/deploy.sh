#!/usr/bin/env bash
# Tests, builds and deploys Jensuisla to Cloudflare. Stops at the first failure.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Tests"
npm test --silent

echo "==> Type checks"
npm run check --silent

echo "==> Build + deploy"
npm run deploy
