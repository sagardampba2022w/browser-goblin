---
name: browser-testing
description: Test local or deployed web apps through a real browser using Pi browser tools. Use for end-to-end checks, regression testing, reproducing UI bugs, validating forms/navigation, and checking console/network errors.
---

# Browser Testing

Use Pi's browser tools to test web applications the way a user would.

## Fast path

For broad regression or smoke coverage of a single page, prefer the one-command QA pass first:

```text
Use browser_qa with url http://localhost:3000, headed true if the user wants to watch, and default desktop/tablet/mobile viewports.
```

This captures screenshots, checks console/errors/network 4xx/5xx, and reports Web Vitals. Follow up with targeted `browser_snapshot`/interaction tools for flows that need clicks, forms, auth, or assertions across multiple pages.

## Default workflow

1. Start or identify the app server.
   - If needed, use `bash` to run the dev server.
   - Prefer an existing local URL when the user provides one.
2. Open the app:
   - `browser_open` with the URL.
   - Use `headed: true` or `/browser-headed on` when the user wants to watch the browser.
   - Prefer `http://localhost` over `http://0.0.0.0` when browser APIs, service workers, or cookies matter.
   - If React introspection is needed, set `enableReactDevtools: true` on first open.
3. Inspect the page:
   - Use `browser_snapshot` first. Accessibility refs like `@e1` are preferred over CSS selectors.
   - Re-snapshot after navigation or DOM changes; refs are only valid for the latest page state.
4. Interact:
   - Use `browser_click`, `browser_fill`, `browser_press`, and `browser_wait`.
   - After each meaningful action, use the fresh snapshot returned by the tool.
5. Validate:
   - Use `browser_qa` for a quick desktop/tablet/mobile health and screenshot pass on important pages.
   - Use dedicated tools: `browser_console`, `browser_errors`, `browser_network`, and `browser_vitals` for targeted checks.
   - Use `browser_debug` only for legacy combined debug access or URL/title/React tree checks.
   - Use `browser_screenshot` only when visual layout matters. If no path is provided, screenshots are saved under the browser artifact directory.
6. If a bug is found:
   - Record exact repro steps.
   - Identify likely source files.
   - Patch the code.
   - Retest the same flow.

## Tool profile

If browser tools are disabled or too limited, run:

```text
/browser-tools core
```

For debugging, run:

```text
/browser-tools debug
```

For visible browser testing, run:

```text
/browser-headed on
```

To run page-level QA and inspect artifacts:

```text
/browser-qa http://localhost:3000 --headed
/browser-artifacts latest
```

## Rules

- Prefer `browser_snapshot` over screenshots for interaction.
- Prefer snapshot refs (`@e3`) over selectors.
- Check browser console and page errors before claiming the app works.
- Do not interact with production accounts or destructive actions unless the user explicitly asks.
- Do not commit auth state, screenshots, HAR files, or downloaded artifacts unless explicitly requested.
