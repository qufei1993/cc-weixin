---
name: weixin-access
description: Manage WeChat access control (pairing codes and allowlist)
user-invocable: true
argument-hint: "<pair CODE | allow USER | remove USER | policy MODE | status>"
---

# WeChat Access Control

Manage who can send messages to your Claude Code instance via WeChat.

## Instructions

Parse the command argument and perform the appropriate action:

### `pair <code>`
Confirm a 6-digit pairing code. Call `confirmPairing(code)` from `./src/pairing.js`.
- If valid: display the confirmed user ID and confirm they've been added to the allowlist.
- If invalid/expired: display an error.

### `allow <userId>`
Manually add a user ID to the allowlist:
1. Load access config with `loadAccessConfig()`
2. Add the userId to `allowFrom` if not already present
3. Save with `saveAccessConfig()`
4. Confirm the user was added

### `remove <userId>`
Remove a user ID from the allowlist:
1. Load access config
2. Remove the userId from `allowFrom`
3. Save the config
4. Confirm removal

### `policy <mode>`
Set the access policy. Mode must be one of: `pairing`, `allowlist`, `disabled`.
- `pairing`: New users get a pairing code, must be confirmed (default)
- `allowlist`: Only pre-approved users can message (no new pairing codes)
- `disabled`: Anyone can message (not recommended)

### `status`
Display current access configuration:
- Current policy
- Number of allowed users
- List of allowed user IDs

Import functions from `./src/pairing.js` and `./src/accounts.js`.
