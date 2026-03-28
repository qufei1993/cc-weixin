# cc-weixin Development Guide

## Project Overview

WeChat channel plugin for Claude Code and Codex, connecting WeChat via the official iLink Bot API.
Monorepo structure — the plugin source lives under `plugins/weixin/`.

## Code Style

- TypeScript strict mode, ES module syntax (`import`/`export`)
- 2-space indentation, LF line endings
- No semicolons omission — always use semicolons
- Prefer `const`, use `let` only when reassignment is needed
- All source files should have a JSDoc module comment at the top

## Build & Test

All commands run from `plugins/weixin/`:

```bash
bun install          # install dependencies
bun run typecheck    # tsc --noEmit
bun test             # run all tests
bun test src/media.test.ts  # run a single test file
```

- Prefer running single test files over the full suite during development
- Always run `typecheck` after code changes before committing

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `refactor:` code restructuring
- `test:` add/modify tests
- `chore:` build/tooling changes

## Project Structure

```
plugins/weixin/
├── server.ts          # MCP Server entry (Claude Code adapter)
├── server-codex.ts    # MCP Server + WebSocket bridge (Codex adapter, experimental)
├── src/
│   ├── types.ts       # iLink Bot API type definitions
│   ├── api.ts         # HTTP API wrapper
│   ├── accounts.ts    # Credential storage (~/.claude/channels/weixin/)
│   ├── login.ts       # QR code login flow
│   ├── monitor.ts     # Long-poll message receiver (platform-agnostic)
│   ├── send.ts        # Message sending + markdown-to-plaintext
│   ├── media.ts       # CDN upload/download with AES-128-ECB encryption
│   ├── pairing.ts     # Pairing code + allowlist access control
│   ├── codex-client.ts # Codex App Server WebSocket client
│   └── cli-login.ts   # Standalone login script
├── skills/            # Skill definitions (shared by Claude Code and Codex)
├── .claude-plugin/    # Claude Code plugin metadata
└── .codex-plugin/     # Codex plugin metadata
```

## Architecture Decisions

- **Two-layer design**: `src/` is platform-agnostic WeChat communication;
  `server.ts` is the Claude Code adapter; `server-codex.ts` is the Codex adapter. Keep them separated.
- **No reverse engineering**: Only use the official iLink Bot API.
- **Credentials**: Always `chmod 0600` for account files.
  State dir: `~/.claude/channels/weixin/` (overridable via `WEIXIN_STATE_DIR`).
- **Media encryption**: AES-128-ECB with random key per upload.
  Two aes_key encodings exist — see `parseAesKey()` in `media.ts`.

## Common Pitfalls

- `qrcode-terminal` has no types — use `src/qrcode-terminal.d.ts`
- `fetch` body requires `Uint8Array` not `Buffer` for TypeScript compatibility
- Long-poll timeout in `getUpdates` is expected — handle `AbortError` gracefully
- Version numbers must stay in sync across 5 files:
  `package.json`, `server.ts`, `server-codex.ts`, `.claude-plugin/plugin.json`,
  `.codex-plugin/plugin.json`, and root `.claude-plugin/marketplace.json`
- Test files use `WEIXIN_STATE_DIR` env var to isolate from real credentials

## Security Rules

- Never log or expose tokens, aes_keys, or account credentials
- Never commit `.env`, `account.json`, or any credential files
- Validate all user input at MCP tool boundaries (`server.ts`, `server-codex.ts`)

## References

- API protocol: @docs/API-REFERENCE.md
- Architecture design: @docs/DESIGN.md
- Access control: @plugins/weixin/ACCESS.md
- Contributing: @CONTRIBUTING.md
