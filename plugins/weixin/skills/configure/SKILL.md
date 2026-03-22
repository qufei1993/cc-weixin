---
name: weixin-configure
description: Connect or disconnect your WeChat account via QR code scan
user-invocable: true
argument-hint: "[clear]"
---

# WeChat Configure

Manage your WeChat connection.

## Instructions

Run the login CLI script directly using Bash:

```bash
# Connect (show QR code and wait for scan)
bun src/cli-login.ts

# Disconnect
bun src/cli-login.ts clear
```

If the user provides `clear` as an argument, run `bun src/cli-login.ts clear`.
Otherwise, run `bun src/cli-login.ts` and wait for the script to complete.

The script handles everything: checking existing accounts, displaying the QR code, polling for scan result, and saving credentials.

The script automatically registers the weixin MCP server globally using `claude mcp add --scope user`, so `server:weixin` works from any directory.

After connecting, tell the user to restart Claude Code with:
```
claude --dangerously-load-development-channels server:weixin
```

**Do NOT mention** `claude --channels plugin:weixin@cc-weixin` — this requires an official allowlist and is not yet available.
