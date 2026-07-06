# Security Policy

browser-goblin gives Pi access to a real browser. That makes it useful for testing and debugging, but it also means it can interact with sensitive browser state.

## Supported versions

Security fixes are currently provided for the latest published npm version.

## Sensitive data guidance

Treat the following as sensitive:

- browser cookies and local/session storage
- agent-browser state files
- Chrome profile snapshots
- screenshots of authenticated or private pages
- downloaded files and browser artifacts
- environment variables and local config paths

Do not commit these files to git. Do not include tokens, cookies, or private screenshots in bug reports.

## Reporting a vulnerability

Please report security issues through GitHub issues only if the report does not contain secrets or exploit details that should remain private:

https://github.com/sagardampba2022w/browser-goblin/issues

If a report includes sensitive details, create a minimal public issue asking for a private disclosure channel, or contact the maintainer through an appropriate private channel.

## Safe defaults

browser-goblin is designed with conservative defaults:

- artifact cleanup is dry-run unless explicitly confirmed
- auth/profile/state features require explicit paths or sessions
- screenshots default to a global Pi artifact directory, not the current project repo
- browser interaction should avoid destructive production actions unless explicitly requested

Users should still review installed Pi packages before enabling them. Pi extensions execute local code with user-level system access.
