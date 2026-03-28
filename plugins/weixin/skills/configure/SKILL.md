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

**IMPORTANT — QR Code display**: The script outputs a line like:
```
Scan the QR code above with WeChat, or open this URL:
https://....
```
Always extract and show this URL to the user explicitly. In environments where the terminal QR code is not visible (e.g. Codex TUI background terminal), this URL is the only way for the user to scan. Tell the user to open the URL in a browser and scan the QR code with WeChat.

After connecting, tell the user the next step based on their platform:

**Claude Code:**
```
claude --dangerously-load-development-channels plugin:weixin@cc-weixin
```
Do NOT mention `claude --channels plugin:weixin@cc-weixin` (without `--dangerously-load-development-channels`) — this requires an official allowlist and is not yet available.

**Codex:**
```
~/cc-weixin/plugins/weixin/start-codex.sh
```
This starts both the Codex App Server and the WeChat bridge in one command. Run it in a terminal and keep it running. WeChat conversations are processed in the background — Codex TUI does not display them directly.
