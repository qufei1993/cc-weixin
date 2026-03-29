# Codex CLI 微信集成研究

> 状态：**实验性实现** — Plugin 已打包（`server-codex.ts`），核心体验限制已知并文档化

## 目标

评估 OpenAI Codex CLI 的技术能力，确定与 Claude Code Channel 体验对等的微信集成方案。

核心需求：
1. 微信用户发消息 → 自动收到回复（无需操作者手动触发）
2. **操作者在 Codex 终端能看到对话并参与**（与 Claude Code Channel 体验一致）

---

## 结论

**rust-v0.117.0 新增了 Plugin 系统，但未解决核心问题。**

Codex Plugin 是 Skills + MCP Server + App 的打包分发机制，本质是静态安装单元。Plugin 无法：
- 向运行中的 Codex 会话推送消息
- 在 TUI 中显示外部事件
- 触发非用户发起的 turn

与上次调研相比，**两个核心阻塞不变**：

| | Claude Code | Codex (v0.117.0) |
|--|------------|-------------------|
| 微信消息 → 自动回复 | ✅ | ✅ 可实现（App Server） |
| 终端显示对话 | ✅ 消息直接出现在会话中 | ❌ TUI 不渲染外部 turn |
| 操作者参与对话 | ✅ 可在终端中交互 | ❌ 两个独立的会话 |
| Plugin 分发 | ✅ marketplace | ✅ marketplace（新增） |
| Plugin 推送消息 | ✅ `notifications/claude/channel` | ❌ 无等效机制 |

**已实现实验性支持**（`server-codex.ts` + Codex Plugin 打包），体验限制已知并文档化，等 Issue #15299/#15320 解决后优化。

## 当前实现

### 架构分工

| 组件 | 职责 | 运行方式 |
|------|------|----------|
| Codex Plugin（`weixin-configure`、`weixin-access`） | 扫码登录、配对码/白名单管理 | 在 Codex TUI 中调用（一次性配置） |
| `start-codex.sh` | 启动 App Server + 微信桥接 | 用户手动运行，长期驻留后台 |
| `server-codex.ts`（standalone 模式） | 轮询微信消息 → 注入 Codex turn → 回复 | 由 `start-codex.sh` 启动 |

### 实际使用流程

> **安装限制**：Codex 当前仅支持本地路径安装插件，社区远程安装（类似 Claude Code marketplace URL）尚未开放。用户需手动 clone 仓库并配置本地 marketplace。

```bash
# 1. Clone 仓库到本地
git clone https://github.com/qufei1993/cc-weixin.git ~/cc-weixin

# 2. 配置本地 marketplace（~/.agents/plugins/marketplace.json）
# path 相对于 ~，替换为实际路径
{
  "name": "personal",
  "plugins": [{
    "name": "weixin",
    "source": { "source": "local", "path": "./cc-weixin/plugins/weixin" },
    "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
    "category": "messaging"
  }]
}

# 3. 在 Codex 中安装插件（用于 configure/access 命令，只需一次）
/plugins  # 搜索 weixin，安装

# 4. 扫码登录微信（在 Codex TUI 中，只需一次）
$weixin-configure

# 5. 启动桥接服务（长期运行，日志实时可见）
~/cc-weixin/plugins/weixin/start-codex.sh

# 6. 从微信发消息，在 Codex TUI 中确认配对码
$weixin-access pair 123456
```

### 为什么不用 Plugin 做运行时？

Codex Plugin 的 MCP Server 依附于 TUI session 生命周期：
- TUI 必须保持打开才能 spawn MCP 进程
- TUI 无法显示外部注入的对话（Issue #15320）
- 导致：需要一个「空的 TUI 窗口」只是为了维持进程存活

`server-codex.ts` 检测 stdin 是否为 TTY：
- **standalone 模式**（TTY）：跳过 MCP server，直接跑桥接，日志打到终端
- **plugin 模式**（pipe，由 Codex 启动）：作为 MCP server，提供工具，但进入 passive 模式（不跑 poll loop，避免与 standalone 实例冲突）

### 已知限制（已接受）

1. Codex TUI 不显示微信对话（Issue #15320）
2. 单用户路由（多用户并发可能串消息）
3. 需要手动运行 `./start-codex.sh`，无法完全自动化

---

## v0.117.0 新增内容评估

### Plugin 系统（新增）

Codex 现在支持 Plugin 作为一等公民：
- `/plugins` 命令浏览、安装、卸载
- 插件结构：`.codex-plugin/plugin.json` + `skills/` + `.mcp.json` + `.app.json`
- 三级 Marketplace：官方仓库、Repo 级 (`$REPO_ROOT/.agents/plugins/marketplace.json`)、用户级 (`~/.agents/plugins/marketplace.json`)
- 相关 PR：#15041, #15042, #15195, #15215, #15264, #15275, #15342, #15580, #15606, #15802

**对微信集成的影响**：Plugin 解决了分发问题（我们可以把微信 MCP Server 打包为 Codex Plugin），但**不解决运行时消息推送问题**。Plugin 中的 MCP Server 仍然只能被动等待 Codex 调用工具，无法主动向会话推送消息。

### 其他值得关注的变化

| 特性 | 说明 | 对集成的影响 |
|------|------|-------------|
| Multi-Agent 路径寻址 | Sub-agent 使用 `/root/agent_a` 路径 | 无直接影响 |
| App Server 增强 | Shell 执行、文件监控、远程 WebSocket + Bearer Auth | 方案 F 更成熟，但 TUI 同步仍未修复 |
| MCP HTTP header 转发 | 自定义请求头 | 小改进，不改变架构限制 |

---

## 排除的方案

### 方案 A：MCP Channel 推送

`claude/channel` 是 Claude Code 的**私有扩展**（非 MCP 标准）。Codex 不支持类似机制。

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

- `codex app-server --listen ws://127.0.0.1:4500` 启动 WebSocket
- v0.117.0 新增远程 WebSocket 连接 + Bearer Auth（[PR #14533](https://github.com/openai/codex/pull/14533)）
- `turn/start` 发起新 turn，`turn/steer` 追加输入，`turn/interrupt` 取消
- 监听 `item/completed`（type=agentMessage）获取回复
- **但 Codex TUI 不渲染其他客户端的 turn** — 操作者看不到对话

### 方案 G：Codex Plugin（v0.117.0 新增 — 已排除）

Plugin 是 Skills + MCP + App 的打包分发格式，不提供运行时消息推送能力：
- Skills 只能通过用户主动调用或 agent 隐式匹配触发，无法被外部事件触发
- Plugin 中的 MCP Server 能力与独立 MCP Server 相同 — 仍是请求-响应模式
- 文档明确无 notification/channel/push 相关 API

---

## 社区动态

[Issue #15299](https://github.com/openai/codex/issues/15299)（2026-03-20 提交）明确请求了与我们需求完全一致的功能：

> "Support inbound MCP notifications routed into an active Codex CLI session"

提议了三个解决方向：
1. MCP Server 发出的通知被 Codex CLI 转为 thread item
2. 本地 IPC 端点向活跃会话发送消息
3. 文档化的 channel/inbox 类 MCP 服务器扩展点

社区评论进一步扩展为更通用的诉求：**为交互式 Codex CLI/TUI 会话提供 opt-in 的本地 ingress**，复用现有 thread/turn 语义。该 Issue 仍为 Open 状态，OpenAI 尚未回应。

[Issue #15320](https://github.com/openai/codex/issues/15320)（TUI 多客户端同步）同样仍为 Open。OpenAI 协作者于 3 月 20 日回复："This use case isn't currently supported, but it's something we'd like to get to eventually."

---

## 其他发现

- **MCP 协议本身支持双向通信**，但 Codex 作为客户端选择了纯请求-响应模式
- **Codex Plugin 与 Claude Code Plugin 的关键差异**：Claude Code Plugin 的 MCP Server 可通过 `notifications/claude/channel` 推送消息到会话；Codex Plugin 的 MCP Server 只能被动提供工具
- `codex/event/*` 通知是 Codex 自身内部事件，非外部 MCP 服务器可用的扩展点
- Codex App Server 事件格式：`item/started`、`item/completed`、`item/agentMessage/delta`、`turn/started`、`turn/completed`、`thread/status/changed`

## 未来可能的转机

当以下任一条件满足时，可重新评估 Codex 支持：

| 条件 | 追踪 | 状态 |
|------|------|------|
| Codex TUI 支持多客户端实时同步 | [Issue #15320](https://github.com/openai/codex/issues/15320) | Open — "we'd like to get to eventually" |
| Codex 支持 MCP 通知路由到会话 | [Issue #15299](https://github.com/openai/codex/issues/15299) | Open — 无官方回应 |
| Codex 添加本地 IPC ingress | [Issue #15299](https://github.com/openai/codex/issues/15299) | 同上 |
| Codex 实现 MCP Resource Subscribe | [Issue #4956](https://github.com/openai/codex/issues/4956) | Open |
| Codex 实现 MCP Sampling | [Issue #4929](https://github.com/openai/codex/issues/4929) | Open |

**最有希望的方向**：Issue #15299 如果被采纳，将直接解决我们的核心需求。建议持续关注。

## 参考资料

- [Codex rust-v0.117.0 Release](https://github.com/openai/codex/releases/tag/rust-v0.117.0)
- [Codex Plugin 文档](https://developers.openai.com/codex/plugins)
- [Codex Skills 文档](https://developers.openai.com/codex/skills)
- [App Server – Codex](https://developers.openai.com/codex/app-server)
- [Codex MCP 文档](https://developers.openai.com/codex/mcp)
- [Codex SDK](https://developers.openai.com/codex/sdk)
- [MCP 规范 - Resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [Claude Code Channels 参考](https://code.claude.com/docs/en/channels-reference)
