#!/usr/bin/env bash
# Cuts a release: bumps the version in package.json, turns the changelog's "Unreleased" section
# into the new version, commits, tags, pushes and publishes the GitHub release. Does not deploy.
# Usage: scripts/release.sh patch|minor|major
set -euo pipefail

cd "$(dirname "$0")/.."

level="${1:-}"
case "$level" in
  patch | minor | major) ;;
  *) echo "usage: $0 patch|minor|major" >&2; exit 1 ;;
esac

[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes before releasing." >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "Releases are cut from main." >&2; exit 1; }

echo "==> Tests"
npm test --silent
echo "==> Type checks"
npm run check --silent

# Bumps package.json and dates the changelog; prints the new version, then the release notes.
out="$(LEVEL="$level" node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
const next = { major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` }[process.env.LEVEL];

const log = readFileSync('CHANGELOG.md', 'utf8');
const head = '## [Unreleased]';
const start = log.indexOf(head);
const end = log.indexOf('\n## [', start + head.length);
const notes = log.slice(start + head.length, end).trim();
if (!notes) { console.error('CHANGELOG.md has nothing under "Unreleased".'); process.exit(1); }

const date = new Date().toISOString().slice(0, 10);
let updated = `${log.slice(0, start)}${head}\n\n## [${next}] - ${date}\n\n${notes}\n${log.slice(end)}`;
updated = updated.replace(/^\[Unreleased\]: .*$/m,
  `[Unreleased]: https://github.com/The-Ston/Jensuisla/compare/v${next}...HEAD\n[${next}]: https://github.com/The-Ston/Jensuisla/releases/tag/v${next}`);
writeFileSync('CHANGELOG.md', updated);

pkg.version = next;
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log(next);
console.log(notes);
EOF
)"
version="$(head -n1 <<<"$out")"
notes="$(tail -n +2 <<<"$out")"

echo "==> Release v$version"
git commit -q -am "Release v$version"
git tag -a "v$version" -m "v$version"
git push --follow-tags
gh release create "v$version" --title "v$version" --notes "$notes"
echo "Released v$version. Deploy it with scripts/deploy.sh."
