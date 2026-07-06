# Changelog

## 0.4.6 - 2026-07-06

Release tag: `v0.4.6`

- Clarified README attribution: browser-goblin uses Vercel Labs' `agent-browser` CLI as its backend and adds the Pi-native integration layer.

## 0.4.5 - 2026-07-06

Release tag: `v0.4.5`

- Added a package preview image for README and pi.dev package gallery metadata.
- Included `assets/preview.png` in the npm package and exposed it through `pi.image`.

## 0.4.4 - 2026-07-06

Release tag: `v0.4.4`

- Fixed `agent-browser` binary resolution for npm-installed Pi packages when npm hoists dependencies to the shared `node_modules/.bin` directory.

## 0.4.3 - 2026-07-06

Release tag: `v0.4.3`

- Corrected Pi npm install instructions to use `pi install npm:browser-goblin`.

## 0.4.2 - 2026-07-06

Release tag: `v0.4.2`

- Updated GitHub repository metadata and README install examples after renaming the repo to `browser-goblin`.

## 0.4.1 - 2026-07-06

Release tag: `v0.4.1`

- Renamed npm package to `browser-goblin` because `pi-browser-tools` was already taken on npm.
- Updated README and package metadata for npm publishing under the new name.

## 0.4.0 - 2026-07-06

Release tag: `v0.4.0`

- Added persistent defaults in `~/.pi/agent/browser-tools.json` for headed mode, default session, default viewport, and artifact directory.
- Added `/browser-config` for viewing/updating persistent browser defaults.
- Added `browser_artifacts_latest` and `/browser-artifacts latest`.
- Added artifact manifest metadata at `<artifact-session>/manifest.json`.
- Added `browser_qa` and `/browser-qa` for one-command desktop/tablet/mobile visual QA with console/errors/network/vitals checks.
- Added `browser_qa` usage examples to bundled testing, debugging, visual QA, and auth skills.

## 0.3.0

- Added `browser_artifacts_list` and `browser_artifacts_clean` tools.
- Expanded `/browser-artifacts` command with `list`, `clean`, `--all`, and `--confirm` support.
- `browser_artifacts_clean` defaults to dry run unless `confirm: true` is set.

## 0.2.0

- Added headed browser preference command: `/browser-headed on|off|auto`.
- Added artifact directory management under `~/.pi/agent/browser-artifacts/<session>/` by default.
- Added `/browser-artifacts` command to show the current artifact directory.
- Added dedicated tools: `browser_console`, `browser_errors`, `browser_network`, `browser_tabs`, `browser_vitals`, `browser_set_viewport`, `browser_reload`, `browser_back`, and `browser_forward`.
- Improved screenshots with automatic timestamped filenames when no path is provided.
- Added viewport presets for desktop, tablet, and mobile.
- Added snapshot retry for temporarily empty pages.
- Added clearer hints for stale refs and unreachable dev servers.
- Added localhost guidance when opening `0.0.0.0` URLs.
- Added smoke test script.

## 0.1.0

- Initial Pi package with browser tools backed by `agent-browser`.
- Added browser testing, debugging, visual QA, and auth skills.
