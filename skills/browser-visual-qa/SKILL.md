---
name: browser-visual-qa
description: Review UI visual quality in a real browser using snapshots and screenshots. Use for layout polish, responsive checks, accessibility structure, spacing, typography, and before/after visual validation.
---

# Browser Visual QA

Use real browser evidence for UI review and polish.

## Workflow

1. For a whole-page responsive pass, start with `browser_qa`:
   - URL required.
   - Defaults to desktop, tablet, and mobile screenshots.
   - Reports console messages, page errors, 4xx/5xx requests, and Web Vitals.
   - Use `headed: true` or `/browser-qa <url> --headed` when the user wants to watch.
2. Open the page with `browser_open` when targeted interaction or state setup is needed.
3. Capture structure with `browser_snapshot`.
4. Capture visuals with `browser_screenshot` when layout, spacing, imagery, canvas, charts, or responsive design matter. If no path is provided, screenshots are saved under `~/.pi/agent/browser-artifacts/<session-id>/` by default. Use `browser_artifacts_list` or `browser_artifacts_latest` to review saved screenshots.
5. Check responsive states with `browser_set_viewport` presets: `desktop`, `tablet`, and `mobile` when doing manual viewport-by-viewport inspection.
6. Check important states:
   - empty/loading/error states
   - hover/focus if relevant
   - narrow and wide viewport via `browser_eval` or `extraArgs` only when needed
   - modals, dropdowns, and form validation
7. Inspect console/errors with `browser_console` and `browser_errors` so visual changes did not introduce runtime issues.
8. If editing code:
   - Make a focused visual improvement.
   - Reopen/reload and retest.
   - Take a final screenshot or snapshot.

## Examples

```text
Use browser_qa on http://localhost:3000 with headed true and annotate false.
```

```text
/browser-qa http://localhost:3000 --viewports=desktop,tablet,mobile --headed
/browser-artifacts latest
```

After a code change, rerun `browser_qa` on the same URL and compare the new artifact paths against the previous run.

## Standards

- Validate hierarchy, alignment, spacing rhythm, contrast, focus states, and copy clarity.
- Do not rely only on source code inspection for UI changes.
- Prefer snapshots for accessibility semantics and screenshots for visual composition.
- Use `/browser-headed on` or `browser_qa` with `headed: true` when the user wants to watch the visual QA run.
- Use `browser_artifacts_latest` to find the newest screenshot quickly.
- Use `browser_artifacts_clean` only when the user asks to clean up artifacts; run it as a dry run first.
- Mention any visual issue with a concrete location and suggested fix.
