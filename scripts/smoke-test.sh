#!/usr/bin/env bash
set -euo pipefail

SESSION="pi-browser-smoke-$(date +%s)"
BIN="${PI_BROWSER_AGENT_BROWSER_BIN:-./node_modules/.bin/agent-browser}"

"$BIN" --session "$SESSION" --restore open https://example.com >/tmp/pi-browser-smoke-open.txt
"$BIN" --session "$SESSION" --restore snapshot >/tmp/pi-browser-smoke-snapshot.txt
grep -q "Example Domain" /tmp/pi-browser-smoke-snapshot.txt
"$BIN" --session "$SESSION" --restore console >/tmp/pi-browser-smoke-console.txt || true
"$BIN" --session "$SESSION" --restore close >/tmp/pi-browser-smoke-close.txt

echo "Smoke test passed for session $SESSION"
