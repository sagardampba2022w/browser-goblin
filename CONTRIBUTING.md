# Contributing to browser-goblin

Thanks for helping improve browser-goblin. This package gives Pi browser-use tools, so changes should be validated in a real browser whenever possible.

## Local setup

Use Pi and Node.js 24 or newer, matching the backend requirement and CI. The GitHub repository is the canonical source; npm releases are published from its tagged commits. Normal users should follow the npm installation instructions in [README.md](./README.md).

```bash
git clone https://github.com/sagardampba2022w/browser-goblin.git
cd browser-goblin
npm install
npx --no-install agent-browser install
```

Try the source checkout in an isolated Pi run:

```bash
pi --no-extensions -e .
```

This loads the checkout without also loading a configured npm copy of Goblin or other discovered extensions. Do not register the checkout and the npm package at the same time. Keep your normal installation on `npm:browser-goblin` and use the command above for development.

## Development checks

Run these from the source checkout after `npm install`, before opening a pull request. These development checks are not intended to run from Pi's installed `node_modules` package.

```bash
npm run check
npm run check:package
npm run test:smoke
```

`check:package` inspects npm's dry-run file list and fails if required docs or images are missing or a packaged Markdown file has a broken relative link. It does not publish anything.

The smoke test starts its own local fixture and isolated browser session, exercises Goblin's wrapper tools, and removes its generated screenshots afterward. It does not use personal Chrome profiles or external websites.

For app-level dogfooding, run Pi and use:

```text
/browser-doctor
/browser-qa http://localhost:3000 --headed
```

## Brand assets

- Square logo: [SVG](./assets/logo.svg) or [512px PNG](./assets/logo.png).
- Package banner: [SVG](./assets/preview.svg) or [1200×630 PNG](./assets/preview.png).

The editable mark is `assets/logo.svg`. The banner layout and typography live in `scripts/render-brand.mjs`; it embeds the same mark so both formats stay consistent. To regenerate the banner SVG and both PNG exports from the source checkout:

```bash
npm run assets:render
npm run check:package
```

The renderer uses the installed browser backend and an isolated local session. No image service, personal browser profile, or additional rendering dependency is needed. The committed PNG exports are used for package previews to keep their appearance consistent across sites.

## Coding guidelines

- Prefer small, focused changes.
- Keep browser tool output concise but actionable.
- Preserve safe defaults: artifact cleanup must stay dry-run unless explicitly confirmed.
- Prefer accessibility snapshots and stable refs for interaction workflows.
- Add clear hints for common failure modes, especially stale refs, unreachable dev servers, and missing browser binaries.
- Update README or skill docs when adding user-facing tools, slash commands, or workflow changes.

## Security and privacy

browser-goblin can touch authenticated browser sessions, screenshots, cookies, local storage, profile snapshots, and state files.

- Never commit browser state, cookies, auth files, screenshots containing secrets, or local artifacts.
- Keep generated artifacts under the configured artifact directory, not inside source-controlled app repos.
- Treat `PI_BROWSER_AGENT_BROWSER_BIN`, browser profile paths, and state files as local-machine configuration.

## Release checklist

1. Update `package.json` version.
2. Update `CHANGELOG.md`.
3. Run:
   ```bash
   npm run check
   npm run check:package
   npm run test:smoke
   ```
4. Commit and push.
5. Create and push a git tag matching `package.json`, such as `v0.5.1`.
6. Create a GitHub release.
7. Publish from that clean, tagged checkout in an interactive terminal:
   ```bash
   npm publish --access public --tag latest
   ```
   Complete npm's publish-time 2FA/passkey prompt. Logging in alone does not publish the package. Never put credentials or recovery codes in source control or release notes.
8. Verify npm shows the new version (registry processing may take a few minutes), then update the installed Pi package:
   ```bash
   npm view browser-goblin@latest version
   pi update npm:browser-goblin
   ```
   For a first-time installation, use `pi install npm:browser-goblin` instead. Run `/reload` in Pi, check `/browser-doctor`, and test the npm-installed extension. Check the direct pi.dev package page and its documentation/image links; catalog search indexing may lag.
