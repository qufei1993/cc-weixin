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

## Post-connect: Register MCP server (ALWAYS do this)

**ALWAYS** perform this step after running the login script, whether it's a new connection or already connected. Skip ONLY when the user passes `clear`.

Register the weixin MCP server in `~/.claude/.mcp.json` so it can be used from any directory. Run this bash script:

```bash
PLUGIN_DIR=$(ls -d ~/.claude/plugins/cache/cc-weixin/weixin/*/ 2>/dev/null | sort -V | tail -1)
if [ -z "$PLUGIN_DIR" ]; then
  PLUGIN_DIR="$(pwd)"
fi
# Remove trailing slash
PLUGIN_DIR="${PLUGIN_DIR%/}"

# Read existing or create new
MCP_FILE="$HOME/.claude/.mcp.json"
if [ -f "$MCP_FILE" ]; then
  EXISTING=$(cat "$MCP_FILE")
else
  EXISTING='{"mcpServers":{}}'
fi

# Merge weixin server using bun/node
bun -e "
const existing = JSON.parse(\`$EXISTING\`);
existing.mcpServers = existing.mcpServers || {};
existing.mcpServers.weixin = {
  command: 'bash',
  args: ['-c', 'cd \"$PLUGIN_DIR\" && exec bun server.ts']
};
require('fs').writeFileSync('$MCP_FILE', JSON.stringify(existing, null, 2));
console.log('MCP server registered at $MCP_FILE');
"
```

After registering, tell the user to restart Claude Code with:
```
claude --dangerously-load-development-channels server:weixin
```

**Do NOT mention** `claude --channels plugin:weixin@cc-weixin` — this requires an official allowlist and is not yet available.
