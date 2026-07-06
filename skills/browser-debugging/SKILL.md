---
name: browser-debugging
description: Reproduce and debug frontend/browser issues using Pi browser tools. Use for JavaScript errors, broken navigation, failed requests, hydration problems, React render issues, and UI behavior bugs.
---

# Browser Debugging

Use the browser as the source of truth. Reproduce first, patch second, retest last.

## Workflow

For broad page health issues, run `browser_qa` first to get screenshots plus console/errors/network/vitals in one pass. Then use targeted tools to reproduce and isolate the bug.

1. Open the target page with `browser_open`.
   - For React apps, reopen with `enableReactDevtools: true` before using React tools.
2. Reproduce the problem using `browser_snapshot` plus refs and interaction tools.
3. Collect evidence:
   - `browser_qa` for page-level screenshot, console/error/network/vitals summary across desktop/tablet/mobile
   - `browser_console` for console messages
   - `browser_errors` for uncaught JavaScript/page errors
   - `browser_network` for failed API calls and request inspection
   - `browser_vitals` for performance/hydration clues
   - `browser_debug { kind: "react_tree" }` for React component structure when useful
4. Map evidence to source files using `rg`, `read`, and normal code tools.
5. Make the smallest safe fix.
6. Retest the exact browser flow.
7. Summarize:
   - repro
   - root cause
   - files changed
   - browser validation results

## Examples

```text
Use browser_qa on http://localhost:3000 with checkNetworkErrors true before debugging the broken dashboard.
```

If `browser_qa` reports 4xx/5xx requests, inspect the exact request with `browser_network` or reproduce the action that caused it.

## Heuristics

- If a click does nothing, re-snapshot and check whether a dialog, overlay, disabled button, or covering element is present.
- If the UI looks stale, check console errors, network failures, and app state before editing.
- For SPA route issues, check current URL with `browser_debug { kind: "url" }`, and use `browser_reload`, `browser_back`, or `browser_forward` to validate navigation state.
- For forms, verify field values through visible snapshot text or targeted `browser_eval` only when necessary.

## Safety

- Use `browser_eval` sparingly; prefer user-level interaction first.
- If users need to see the browser, use `browser_open` with `headed: true` or `/browser-headed on`.
- Screenshots without explicit paths are stored in the configured browser artifact directory.
- Do not submit destructive forms or payment/admin actions unless the user explicitly approves.
