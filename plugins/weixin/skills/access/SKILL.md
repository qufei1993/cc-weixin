---
name: weixin-access
description: Manage WeChat access control (pairing codes and allowlist)
user-invocable: true
argument-hint: "[alias] <pair CODE | allow USER | remove USER | policy MODE | status>"
---

# WeChat Access Control

Manage who can send messages to your Claude Code instance via WeChat.

## Multi-account support

If the current session was started with a named channel (e.g., `server:weixin-zxx`), you must set the `WX` environment variable so that the correct state directory is used.

Detect the channel name from the session context:
- If the channel is `weixin-zxx` → set `WX=zxx`
- If the channel is `weixin-lw` → set `WX=lw`
- If the channel is just `weixin` → no env var needed

**All Bash commands below must be prefixed with `WX=<alias>`** when operating on a named channel. For example:
```bash
cd "${CLAUDE_PLUGIN_ROOT:-...}" && WX=zxx bun -e "import { confirmPairing } from './src/pairing.ts'; ..."
```

## Instructions

**IMPORTANT**: All commands must run from the **plugin root directory** (where `package.json` is), using `bun` (not `node`), with TypeScript imports (`.ts` extension).

Parse the command argument and perform the appropriate action:

### `pair <code>`
Confirm a 6-digit pairing code:
```bash
cd "${CLAUDE_PLUGIN_ROOT:-$(dirname $(dirname $0))}" && WX=<alias> bun -e "
import { confirmPairing } from './src/pairing.ts';
const result = confirmPairing('<code>');
if (result) { console.log('Paired user: ' + result); } else { console.log('Invalid or expired code.'); }
"
```
- If valid: display the confirmed user ID and confirm they've been added to the allowlist.
- If invalid/expired: display an error.

### `allow <userId>`
Manually add a user ID to the allowlist:
```bash
cd "${CLAUDE_PLUGIN_ROOT:-$(dirname $(dirname $0))}" && WX=<alias> bun -e "
import { loadAccessConfig, saveAccessConfig } from './src/pairing.ts';
const config = loadAccessConfig();
if (!config.allowFrom.includes('<userId>')) { config.allowFrom.push('<userId>'); saveAccessConfig(config); }
console.log(JSON.stringify(config, null, 2));
"
```

### `remove <userId>`
Remove a user ID from the allowlist:
```bash
cd "${CLAUDE_PLUGIN_ROOT:-$(dirname $(dirname $0))}" && WX=<alias> bun -e "
import { loadAccessConfig, saveAccessConfig } from './src/pairing.ts';
const config = loadAccessConfig();
config.allowFrom = config.allowFrom.filter(u => u !== '<userId>');
saveAccessConfig(config);
console.log(JSON.stringify(config, null, 2));
"
```

### `policy <mode>`
Set the access policy. Mode must be one of: `pairing`, `allowlist`, `disabled`.

### `status`
Display current access configuration:
```bash
cd "${CLAUDE_PLUGIN_ROOT:-$(dirname $(dirname $0))}" && WX=<alias> bun -e "
import { loadAccessConfig } from './src/pairing.ts';
console.log(JSON.stringify(loadAccessConfig(), null, 2));
"
```

Omit `WX=<alias>` when operating on the default `weixin` channel (no alias).
