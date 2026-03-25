---
name: weixin-configure
description: Connect or disconnect your WeChat account via QR code scan
user-invocable: true
argument-hint: "[alias] [clear]"
---

# WeChat Configure

Manage your WeChat connection. Supports multi-account via alias.

## Instructions

**IMPORTANT**: All commands must run from the **plugin root directory** (where `package.json` is), NOT from the skills directory.

### Multi-account support

The user can provide an **alias** (e.g., `work`, `personal`, `zxx`) to create a named channel instance. Each alias gets its own isolated state directory and MCP server registration.

**With alias** (e.g., `/weixin:configure zxx`):
```bash
cd "${CLAUDE_PLUGIN_ROOT:-$(dirname $(dirname $0))}" && bun install --no-summary 1>&2 && bun src/cli-login.ts zxx
```

**Without alias** (default, backward compatible):
```bash
cd "${CLAUDE_PLUGIN_ROOT:-$(dirname $(dirname $0))}" && bun install --no-summary 1>&2 && bun src/cli-login.ts
```

**Clear with alias** (e.g., `/weixin:configure zxx clear`):
```bash
cd "${CLAUDE_PLUGIN_ROOT:-$(dirname $(dirname $0))}" && bun install --no-summary 1>&2 && bun src/cli-login.ts zxx clear
```

**Clear without alias**:
```bash
cd "${CLAUDE_PLUGIN_ROOT:-$(dirname $(dirname $0))}" && bun install --no-summary 1>&2 && bun src/cli-login.ts clear
```

Pass ALL user-provided arguments directly to `cli-login.ts`.

The script handles everything: checking existing accounts, displaying the QR code, polling for scan result, and saving credentials.

- With alias `zxx`: registers as `weixin-zxx`, state in `~/.claude/channels/weixin-zxx/`
- Without alias: uses default `weixin`, state in `~/.claude/channels/weixin/`

After connecting, tell the user to restart Claude Code:

**Without alias** (default):
```
claude --dangerously-load-development-channels plugin:weixin@cc-weixin
```

**With alias** (multi-account):
```
claude --dangerously-load-development-channels server:weixin-zxx
```

**Multiple accounts simultaneously:**
```
claude --dangerously-load-development-channels server:weixin-zxx server:weixin-lw
```

**Do NOT mention** `claude --channels plugin:weixin@cc-weixin` (without `--dangerously-load-development-channels`) — this requires an official allowlist and is not yet available.
