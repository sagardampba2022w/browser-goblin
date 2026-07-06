---
name: browser-auth
description: Use browser sessions, profiles, and state files safely when authenticated browser access is required. Use for login-required testing, reused Chrome profile auth, saved state, cookies, and session isolation.
---

# Browser Auth

Use authenticated browser state carefully. Treat cookies, localStorage, and state files as secrets.

## Options

1. Stable Pi browser session
   - Browser tools default to a worktree-scoped `agent-browser` session with restore enabled.
   - This is best for local development after a one-time login.

2. Explicit session
   - Use `/browser-session <id>` to set a default session for the current Pi run.
   - Or pass `session` in each browser tool call.

3. Chrome profile snapshot
   - `browser_open` supports `profile`, e.g. `Default`.
   - This snapshots an existing Chrome profile for auth reuse.
   - Ask before using it; only use on trusted machines.

4. State file
   - `browser_open` supports `state` for an agent-browser auth state file.
   - Never commit state files.

## Rules

- Use `browser_qa` carefully on authenticated pages because it saves screenshots to the artifact directory and may capture sensitive account data.
- Never print, save, or commit tokens/cookies intentionally.
- Add generated auth state files to `.gitignore` if they live under a repo.
- Ask before using real production accounts.
- Avoid destructive actions while authenticated unless the user explicitly requests them.
- Prefer test/staging accounts for automated flows.

## Useful commands

```text
/browser-session my-project-login
/browser-tools core
/browser-headed on
/browser-artifacts
```

Then open the authenticated app with `browser_open` and continue with snapshots/interactions. Use `browser_qa` only when saved screenshots of the authenticated UI are acceptable.

Browser artifacts such as screenshots are stored under `~/.pi/agent/browser-artifacts/<session-id>/` by default. Do not store auth state files or screenshots containing sensitive data in git-tracked directories.
