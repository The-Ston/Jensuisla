# Changelog

All notable changes to Jensuisla. Versions follow [Semantic Versioning](https://semver.org):
MAJOR for changes that break existing readings or data, MINOR for new features, PATCH for fixes.
Write new entries under "Unreleased"; `scripts/release.sh` turns that section into the next version.

## [Unreleased]

## [1.0.0] - 2026-11-18

First numbered release, covering everything built since the project started.

### Readings and timeline
- Create a reading (organizers): book search on Open Library with French titles and covers,
  progress in chapters, pages or percent, invite-only or open to everyone.
- Continuous timeline: comment points above the line, readers below; each reader's position is
  shown, and their latest visible comment opens from their face.
- Your own position is a bookmark ribbon with your picture, and the timeline opens centered on it.
- Comments, replies, reactions (any emoji, including the server's), GIFs and photos are only shown
  to readers who reached that position; opt into spoilers per reading.
- Page, chapter and percent mentions in comments become tags; every reader sees pages in their own
  edition.
- Unread badges on book covers, notifications by DM or channel mention.

### Look and feel
- Themes and accent colors per reader, comment colors chosen by each author.
- New identity: bookmark icon, bookshelf behind the home greeting, Activity cover, background,
  video preview and bot banner.

### Project
- MIT license, third-party licenses bundled as `licenses.txt`, credits footer linking to other
  projects.
- Terms of use and privacy policy pages at `/conditions` and `/confidentialite`.
- Version and commit shown in the app footer; tagged releases and versioned deploys.

[Unreleased]: https://github.com/The-Ston/Jensuisla/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/The-Ston/Jensuisla/releases/tag/v1.0.0
