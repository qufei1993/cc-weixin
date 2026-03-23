# cc-weixin

> **C**ode **C**hannel — **W**ei**x**in（微信）

通过微信官方 iLink Bot API，将微信连接到 AI 编程工具。当前支持 Claude Code，后续计划支持 Codex 等更多平台。

<p align="center">
  <img src="docs/assets/wechat-chat.png" width="300" alt="微信聊天" />
  <img src="docs/assets/claude-code-terminal.png" width="500" alt="Claude Code 终端" />
</p>

**👉 [新手图文教程：如何用微信连接 Claude Code](https://mp.weixin.qq.com/s/745V4wfyihsm6irqT0PABQ)**

## 特性

- **官方 API**：使用微信 iLink Bot API，非逆向工程
- **完整媒体支持**：收发图片、视频、语音消息和文件
- **访问控制**：配对码 + 白名单，防止未授权访问
- **本地安全**：MCP Server 通过 stdio 本地运行，无暴露端口
- **平台解耦**：微信通信层与平台适配层分离，便于扩展到更多 AI 编程工具

## 支持平台

| 平台 | 状态 |
|------|------|
| Claude Code | ✅ 已支持 |
| Codex (OpenAI) | 🔜 计划中 |

## 前置要求

- [Bun](https://bun.sh) 运行时
- [Claude Code](https://claude.ai/code)（需支持 channel 功能）
- 微信账号
  - iOS：微信 8.0.70 或更高版本，路径：**我 → 设置 → 插件 → ClawBot（如果支持了，能看到这个插件）**
  - Android：微信 8.0.70 或更高版本
  - 该插件目前仍在灰度测试阶段，部分用户可能暂时无法开通

## 安装

在 Claude Code 中添加市场并安装插件：

```
/plugin marketplace add qufei1993/cc-weixin
/plugin install weixin@cc-weixin
```

或从本地目录安装（开发用）：

```bash
git clone https://github.com/qufei1993/cc-weixin.git
cd cc-weixin
```

在 Claude Code 中，将当前目录添加为本地 marketplace 并安装插件：

```
/plugin marketplace add /path/to/cc-weixin
/plugin install weixin@cc-weixin
```

安装之后需要重启 Claude Code

## 配置

### 1. 连接微信账号

```
/weixin:configure
```

用微信扫描终端中显示的二维码。

### 2. 启动 Claude Code 并启用微信 channel

`/weixin:configure` 连接成功后会自动注册全局 MCP 服务器，之后在任意目录启动：

```bash
claude --dangerously-load-development-channels server:weixin
```

> **注意**：`--channels plugin:weixin@cc-weixin` 需要官方 allowlist 批准，目前尚未开放，请使用上述方式启动。

### 3. 配对微信用户

首次从微信发送消息时，会收到一个 6 位配对码。在 Claude Code 中确认：

```
/weixin:access pair 123456
```

### 4. 锁定访问（推荐）

```
/weixin:access policy allowlist
```

这将阻止新用户获取配对码。详见 [ACCESS.md](plugins/weixin/ACCESS.md)。

## 使用

连接后，从微信发送的消息将出现在 Claude Code 中。Claude 的回复会发送回微信。

### 支持的消息类型

| 方向 | 文本 | 图片 | 视频 | 文件 | 语音 |
|------|------|------|------|------|------|
| 接收 | ✓    | ✓    | —    | ✓    | ✓    |
| 发送 | ✓    | ✓    | —    | ✓    | ✓    |

### Skills 命令

| 命令 | 说明 |
|------|------|
| `/weixin:configure` | 连接微信账号（扫码登录） |
| `/weixin:configure clear` | 断开微信账号 |
| `/weixin:access` | 管理访问控制 |

## 卸载

```
/weixin:configure clear
/plugin uninstall weixin@cc-weixin
/plugin marketplace remove cc-weixin
```

清理全局 MCP 注册和缓存：

```bash
claude mcp remove weixin --scope user
rm -rf ~/.claude/plugins/cache/cc-weixin
```

## 架构

```
微信用户 ──DM──→ 微信服务器 (ilinkai.weixin.qq.com)
                       ↑ 长轮询 getUpdates
              微信通信层 (src/)          ← 平台无关，可复用
                       ↓ onMessage 回调
              平台适配层 (server.ts)     ← Claude Code / Codex / ...
                       ↓ notifications/channel
              AI 编程工具 Session (stdio)
```

## 安全设计

- 使用微信官方 iLink Bot API（非逆向工程）
- 凭证文件 `chmod 0600` 保护
- 默认启用配对码访问控制
- Context Token 严格按会话回传
- 每次上传随机生成 AES 密钥
- 通过 stdio 本地运行，无网络端口暴露

## 许可证

MIT
