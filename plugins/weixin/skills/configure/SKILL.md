---
name: weixin-configure
description: Connect or disconnect your WeChat account via QR code scan
user-invocable: true
argument-hint: "[clear]"
---

# WeChat Configure

Manage your WeChat connection.

## Instructions

**IMPORTANT**: All commands must run from the **plugin root directory** (where `package.json` is), NOT from the skills directory.

Run as a single Bash command:
```bash
cd "${CLAUDE_PLUGIN_ROOT:-$(dirname $(dirname $0))}" && bun install --no-summary 1>&2 && bun src/cli-login.ts
```

If the user provides `clear` as an argument, append `clear`:
```bash
cd "${CLAUDE_PLUGIN_ROOT:-$(dirname $(dirname $0))}" && bun install --no-summary 1>&2 && bun src/cli-login.ts clear
```

The script handles everything: checking existing accounts, displaying the QR code, polling for scan result, and saving credentials.

After connecting, tell the user the next step based on their platform:

**Claude Code:**
```
claude --dangerously-load-development-channels plugin:weixin@cc-weixin
```
Do NOT mention `claude --channels plugin:weixin@cc-weixin` (without `--dangerously-load-development-channels`) — this requires an official allowlist and is not yet available.

**Codex:**
```
codex app-server --listen ws://127.0.0.1:4500
```
Note: Codex TUI will not display WeChat conversations directly. Messages are processed in the background. Use `check_messages` to view recent messages.
