# Contributing to browser-goblin

Thanks for helping improve browser-goblin. This package gives Pi browser-use tools, so changes should be validated in a real browser whenever possible.

## Local setup

```bash
git clone https://github.com/sagardampba2022w/browser-goblin.git
cd browser-goblin
npm install
agent-browser install
```

Try the package locally with Pi:

```bash
pi -e .
```

Or install it globally from your local checkout:

```bash
pi install .
```

## Development checks

Run these before opening a pull request:

```bash
npm run check
npm run test:smoke
npm pack --dry-run
```

For app-level dogfooding, run Pi and use:

```text
/browser-doctor
/browser-qa http://localhost:3000 --headed
```

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
   npm run test:smoke
   npm pack --dry-run
   ```
4. Commit and push.
5. Create and push a matching git tag, e.g. `v0.4.8`.
6. Create a GitHub release.
7. Publish to npm:
   ```bash
   npm publish --access public
   ```
8. Verify:
   ```bash
   npm dist-tag ls browser-goblin
   pi install npm:browser-goblin
   ```
