# Codex CLI 微信集成研究

> 研究日期：2026-03-23
> 状态：**暂不实现** — Codex 当前无法实现与 Claude Code Channel 对等的终端交互体验

## 目标

评估 OpenAI Codex CLI 的技术能力，确定与 Claude Code Channel 体验对等的微信集成方案。

核心需求：
1. 微信用户发消息 → 自动收到回复（无需操作者手动触发）
2. **操作者在 Codex 终端能看到对话并参与**（与 Claude Code Channel 体验一致）

---

## 结论

**需求 1 已验证可行**（通过 App Server + WebSocket + turn API），但**需求 2 无法实现** — Codex TUI 不显示其他客户端发起的 turn（[Issue #15320](https://github.com/openai/codex/issues/15320)）。

这意味着微信消息能被 Codex 后台处理并回复，但操作者的 Codex 终端完全看不到这些对话。与 Claude Code Channel 的体验有根本差异：

| | Claude Code | Codex |
|--|------------|-------|
| 微信消息 → 自动回复 | ✅ | ✅ 可实现 |
| 终端显示对话 | ✅ 消息直接出现在会话中 | ❌ TUI 不渲染外部 turn |
| 操作者参与对话 | ✅ 可在终端中交互 | ❌ 两个独立的会话 |

**因此决定暂不实现 Codex 支持**，等待 Codex 修复 TUI 多客户端同步问题。

---

## 排除的方案

### 方案 A：MCP Channel 推送

`claude/channel` 是 Claude Code 的**私有扩展**（非 MCP 标准）。Codex、Cursor、Windsurf、Cline 等都不支持类似机制。

### 方案 B：MCP 通知

Codex 的 `on_resource_updated()` 只打日志（源码验证 `logging_client_handler.rs`），不重读资源、不更新上下文、不通知 agent。

### 方案 C：MCP Pull 模型（check_messages 工具）

需要操作者手动让 agent 检查消息。微信用户发完消息后会一直等着没人回 — 实际不可用。

### 方案 D：Resource Subscribe / Sampling

- `resources/subscribe` 未实现（[Issue #4956](https://github.com/openai/codex/issues/4956)）
- `sampling/createMessage` 未实现（[Issue #4929](https://github.com/openai/codex/issues/4929)）

### 方案 E：Codex SDK 独立实例

SDK 会 spawn 新的 Codex 进程，与开发者终端不共享会话上下文。

### 方案 F：App Server + WebSocket + turn API（已验证）

**技术上可行**，但 TUI 不显示外部对话：

- `codex app-server --listen ws://127.0.0.1:4500` 启动 WebSocket（[PR #11370](https://github.com/openai/codex/pull/11370)，实验性）
- 多客户端可同时连接（[Issue #15320](https://github.com/openai/codex/issues/15320)）
- `turn/start` 发起新 turn，`turn/steer` 追加输入（[PR #10821](https://github.com/openai/codex/pull/10821)）
- 监听 `item/completed`（type=agentMessage）获取回复
- **但 Codex TUI 不渲染其他客户端的 turn** — 操作者看不到对话

验证代码保留在 `codex-bridge.ts` 和 `src/codex-client.ts`（实验性，暂不作为正式功能）。

---

## 其他发现

- **MCP 协议本身支持双向通信**，但 Codex 作为客户端选择了纯请求-响应模式
- **Codex 2026 路线图**无 Channel 计划，重点在 `@plugin mentions`、`request_permissions`、`fast mode`
- `codex/event/*` 通知是 Codex 自身内部事件，非外部 MCP 服务器可用的扩展点
- Codex App Server 事件格式：`item/started`、`item/completed`、`item/agentMessage/delta`、`turn/started`、`turn/completed`、`thread/status/changed`

## 未来可能的转机

当以下任一条件满足时，可重新评估 Codex 支持：

| 条件 | 追踪 |
|------|------|
| Codex TUI 支持多客户端实时同步 | [Issue #15320](https://github.com/openai/codex/issues/15320) |
| Codex 添加 Channel/消息推送机制 | 暂无 Issue |
| Codex 实现 MCP Resource Subscribe | [Issue #4956](https://github.com/openai/codex/issues/4956) |
| Codex 实现 MCP Sampling | [Issue #4929](https://github.com/openai/codex/issues/4929) |

## 参考资料

- [App Server – Codex](https://developers.openai.com/codex/app-server)
- [Codex MCP 文档](https://developers.openai.com/codex/mcp)
- [Codex SDK](https://developers.openai.com/codex/sdk)
- [MCP 规范 - Resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [Claude Code Channels 参考](https://code.claude.com/docs/en/channels-reference)
