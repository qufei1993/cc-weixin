# cc-weixin

English | [中文](README.zh-CN.md)

> **C**ode **C**hannel — **W**ei**x**in (WeChat)

Connect WeChat to AI coding tools via the official iLink Bot API. Currently supports Claude Code, with plans to support Codex and more.

## Features

- **Official API**: Uses WeChat iLink Bot API, no reverse engineering
- **Full media support**: Send and receive images, videos, voice messages, and files
- **Access control**: Pairing code + allowlist to prevent unauthorized access
- **Local security**: MCP Server runs locally via stdio, no exposed ports
- **Platform decoupled**: WeChat communication layer separated from platform adapter, extensible to more AI tools

## Supported Platforms

| Platform | Status |
|----------|--------|
| Claude Code | ✅ Supported |
| Codex (OpenAI) | 🔜 Planned |

## Prerequisites

- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.ai/code) (with channel support)
- WeChat account

## Installation

Add the marketplace and install the plugin in Claude Code:

```
/plugin marketplace add qufei1993/cc-weixin
/plugin install weixin@cc-weixin
```

Or install from local directory (for development):

```bash
git clone https://github.com/qufei1993/cc-weixin.git
cd cc-weixin
```

In Claude Code, add the local directory as a marketplace and install:

```
/plugin marketplace add /path/to/cc-weixin
/plugin install weixin@cc-weixin
```

Restart Claude Code after installation.

## Configuration

### 1. Connect WeChat Account

```
/weixin:configure
```

Scan the QR code displayed in the terminal with WeChat.

### 2. Start Claude Code with WeChat Channel

After `/weixin:configure` succeeds, the global MCP server is auto-registered. Start from any directory:

```bash
claude --dangerously-load-development-channels server:weixin
```

> **Note**: `--channels plugin:weixin@cc-weixin` requires official allowlist approval (not yet available). Use the command above instead.

### 3. Pair WeChat User

When sending a message from WeChat for the first time, you'll receive a 6-digit pairing code. Confirm in Claude Code:

```
/weixin:access pair 123456
```

### 4. Lock Access (Recommended)

```
/weixin:access policy allowlist
```

This blocks new users from obtaining pairing codes. See [ACCESS.md](plugins/weixin/ACCESS.md).

## Usage

Once connected, messages from WeChat appear in Claude Code. Claude's replies are sent back to WeChat.

### Supported Message Types

| Direction | Text | Image | Video | File | Voice |
|-----------|------|-------|-------|------|-------|
| Receive   | ✓    | ✓     | —     | ✓    | ✓     |
| Send      | ✓    | ✓     | —     | ✓    | ✓     |

### Skills Commands

| Command | Description |
|---------|-------------|
| `/weixin:configure` | Connect WeChat account (QR login) |
| `/weixin:configure clear` | Disconnect WeChat account |
| `/weixin:access` | Manage access control |

## Uninstall

```
/weixin:configure clear
/plugin uninstall weixin@cc-weixin
/plugin marketplace remove cc-weixin
```

Clean up global MCP registration and cache:

```bash
claude mcp remove weixin --scope user
rm -rf ~/.claude/plugins/cache/cc-weixin
```

## Architecture

```
WeChat User ──DM──→ WeChat Server (ilinkai.weixin.qq.com)
                          ↑ Long-poll getUpdates
                 Communication Layer (src/)     ← Platform-agnostic, reusable
                          ↓ onMessage callback
                 Platform Adapter (server.ts)   ← Claude Code / Codex / ...
                          ↓ notifications/channel
                 AI Coding Tool Session (stdio)
```

## Security

- Uses official WeChat iLink Bot API (no reverse engineering)
- Credential files protected with `chmod 0600`
- Pairing code access control enabled by default
- Context Token strictly bound to user sessions
- Random AES key generated per upload
- Runs locally via stdio, no network ports exposed

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
