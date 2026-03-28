# cc-weixin 架构设计

> **C**ode **C**hannel — **W**ei**x**in（微信）
>
> 通过微信官方 iLink Bot API，将微信连接到 AI 编程工具。当前支持 Claude Code，后续计划支持 Codex 等更多平台。

## 背景

微信官方发布了 ClawBot（`@tencent-weixin/openclaw-weixin`），提供了完整的微信 iLink Bot API 协议。本项目基于该协议文档（见 `docs/API-REFERENCE.md`），从零实现一个微信 Channel 插件，可对接不同的 AI 编程工具。

### 核心原则

- **官方合规**：使用微信官方 iLink Bot API（`ilinkai.weixin.qq.com`），非逆向工程
- **平台解耦**：微信通信层与平台适配层分离，通过回调模式对接不同 AI 编程工具
- **代码独立**：基于 API 文档自主实现，不复制上游代码，零维护负担
- **开源友好**：MIT 许可证

### 平台支持计划

| 平台 | 状态 | 适配层 |
|------|------|--------|
| Claude Code | ✅ 已支持 | `server.ts`（MCP Channel，Plugin 全集成） |
| Codex (OpenAI) | ⚗️ 实验性支持 | `server-codex.ts`（standalone 桥接），Plugin 仅用于 configure/access，TUI 不显示对话，详见 `docs/CODEX-RESEARCH.md` |

### 架构

```
微信用户 ──DM──→ 微信服务器 (ilinkai.weixin.qq.com)
                       ↑ 长轮询 getUpdates
                 MCP Server (server.ts)
                       ↓ onMessage 回调 → notifications/claude/channel
                  Claude Code Session (stdio)
```

---

## 项目结构

```
cc-weixin/
├── .claude-plugin/
│   └── marketplace.json          # Claude Code 市场索引（根目录）
├── .agents/
│   └── plugins/
│       └── marketplace.json      # Codex 市场索引（根目录）
├── plugins/
│   └── weixin/                   # 插件代码（子目录）
│       ├── .claude-plugin/
│       │   └── plugin.json       # Claude Code 插件元数据
│       ├── .codex-plugin/
│       │   └── plugin.json       # Codex 插件元数据
│       ├── .claude/
│       │   └── skills/           # 项目级 skills
│       │       ├── weixin-configure/SKILL.md
│       │       └── weixin-access/SKILL.md
│       ├── .mcp.json             # MCP 服务器启动配置（Claude Code）
│       ├── server.ts             # MCP Server 主入口（Claude Code 适配层）
│       ├── server-codex.ts       # MCP Server（Codex 适配层，混合 WebSocket 桥接）
│       ├── skills/               # Skills（Claude Code 和 Codex 共用）
│       │   ├── configure/SKILL.md
│       │   └── access/SKILL.md
│       ├── src/
│       │   ├── types.ts          # 微信协议类型定义
│       │   ├── api.ts            # HTTP API 封装
│       │   ├── login.ts          # QR 扫码登录
│       │   ├── cli-login.ts      # 独立登录 CLI 脚本
│       │   ├── monitor.ts        # 长轮询 → onMessage 回调（平台无关）
│       │   ├── send.ts           # 发送文本/图片/视频/文件
│       │   ├── media.ts          # CDN 上传下载 + AES 加解密
│       │   ├── accounts.ts       # 凭证存储
│       │   ├── pairing.ts        # 配对码 + allowlist（磁盘持久化）
│       │   └── codex-client.ts   # Codex App Server WebSocket 客户端
│       ├── package.json
│       ├── tsconfig.json
│       └── ACCESS.md             # 访问控制文档
├── docs/
│   ├── PLAN.md                   # 本计划
│   ├── API-REFERENCE.md          # iLink Bot API 协议参考
│   └── REUSE-ANALYSIS.md         # 上游代码分析记录
├── README.md                     # 英文文档
├── README.zh_CN.md               # 中文文档
├── .gitignore
└── LICENSE                       # MIT
```

### 分层设计

| 层 | 文件 | 职责 | 可复用 |
|----|------|------|--------|
| 微信通信层 | `types.ts`, `api.ts`, `login.ts`, `media.ts`, `send.ts`, `accounts.ts`, `pairing.ts` | 微信 API 交互、CDN 媒体处理、凭证管理 | 通用 |
| 消息轮询层 | `monitor.ts` | 长轮询 + 消息解析 + 访问控制，通过 `onMessage` 回调输出 | 通用 |
| 平台适配层 | `server.ts` | MCP Server，将回调转为 `notifications/claude/channel` | Claude Code 专用 |
| 平台适配层 | `server-codex.ts` | Standalone 桥接：轮询微信 → 注入 Codex App Server turn → 回复。Plugin 模式下仅提供 MCP 工具（reply/check_messages），不运行桥接 | Codex 专用（实验性） |

---

## 关键实现细节

### 消息轮询（monitor.ts）

- `startPollLoop({ onMessage })` — 平台无关的回调模式
- `ParsedMessage` 接口：`{ fromUserId, messageId, text, attachmentPath?, attachmentType? }`
- 错误重试：3 次失败 backoff 30s
- Session expired (errcode -14) 暂停 30s
- 同步游标 `get_updates_buf` 持久化到 `cursor.txt`
- `context_token` 内存缓存（reply 时取用）

### 配对码（pairing.ts）

- 持久化到 `~/.claude/channels/weixin/pending-pairings.json`（跨进程共享）
- 6 位随机码，10 分钟过期
- 三种策略：pairing（默认）→ allowlist → disabled

### CDN 媒体（media.ts）

- 下载 URL：`${cdnBaseUrl}/download?encrypted_query_param=<encoded>`
- 上传 URL：`${cdnBaseUrl}/upload?encrypted_query_param=<encoded>&filekey=<key>`
- AES key 解析：支持 `base64(raw 16 bytes)` 和 `base64(hex string)` 两种编码

### Skills

- `/weixin-configure` — 调用 `bun src/cli-login.ts` 完成扫码登录
- `/weixin-access` — 配对确认、白名单管理

---

## 用户使用流程

### Claude Code

```bash
# 1. 添加市场并安装插件
/plugin marketplace add qufei1993/cc-weixin
/plugin install weixin@cc-weixin

# 2. 扫码连接微信
/weixin:configure

# 3. 启动 Claude Code，启用 channel
claude --channels plugin:weixin@cc-weixin

# 4. 微信发消息 → 收到 6 位配对码 → 确认配对
/weixin:access pair 123456

# 5. 锁定白名单（推荐）
/weixin:access policy allowlist
```

开发模式：
```bash
cd plugins/weixin
claude --dangerously-load-development-channels server:weixin
```

### Codex（实验性）

> Codex 目前仅支持本地路径安装插件，需先 clone 仓库并手动配置 `~/.agents/plugins/marketplace.json`。

```bash
# 1. Clone 仓库并配置本地 marketplace（只需一次）
git clone https://github.com/qufei1993/cc-weixin.git ~/cc-weixin
# 编辑 ~/.agents/plugins/marketplace.json，path 指向 ~/cc-weixin/plugins/weixin

# 2. 在 Codex 中安装插件（只需一次）
/plugins  # 搜索 weixin，安装

# 3. 扫码登录微信（在 Codex TUI 中，只需一次）
$weixin-configure

# 4. 启动桥接服务（长期运行，日志实时可见）
~/cc-weixin/plugins/weixin/start-codex.sh

# 5. 从微信发消息，在 Codex TUI 中确认配对码
$weixin-access pair 123456

# 6. 锁定白名单（推荐）
$weixin-access policy allowlist
```

> Plugin 仅提供 configure/access 命令入口，运行时桥接由 `start-codex.sh` 负责。
> TUI 不显示微信对话，AI 回复直接发回微信（[Issue #15320](https://github.com/openai/codex/issues/15320)）。

---

## 安全设计

| 措施 | 说明 |
|------|------|
| 官方 API | 微信 iLink Bot API，非逆向工程 |
| 凭证保护 | account.json chmod 0o600 |
| Sender Gating | pairing → allowlist，防 prompt injection |
| 配对码持久化 | 磁盘存储，跨进程共享，10 分钟过期 |
| Context Token | 严格回传，确保会话关联 |
| AES Key | 每次上传随机生成 |
| 本地运行 | stdio 通信，无暴露端口 |

---

## 验证清单

- [x] `bun run server.ts` → stderr 提示需要配置
- [x] `/weixin-configure` → QR 码 → 扫码 → token 保存
- [x] `claude --dangerously-load-development-channels server:weixin`
- [x] 微信发文本 → Claude Code 收到 notification
- [x] Claude reply → 微信收到回复
- [ ] 微信发图片 → CDN 下载解密 → Claude 看到
- [ ] Claude reply 带 files → CDN 上传 → 微信收到
- [x] 未授权用户 → 配对码 → 确认 → allowlist
- [ ] session expired → 暂停 → 恢复

---

## 参考资料

- 微信 API 协议：`docs/API-REFERENCE.md`（整理自 `@tencent-weixin/openclaw-weixin@1.0.2`）
- Claude Code Channel 规范：https://code.claude.com/docs/en/channels-reference
- Claude Code 插件规范：https://code.claude.com/docs/en/plugins
