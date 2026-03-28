# cc-weixin

> **C**ode **C**hannel — **W**ei**x**in（微信）

通过微信官方 iLink Bot API，将微信连接到 AI 编程工具。

<p align="center">
  <img src="docs/assets/wechat-chat.png" width="300" alt="微信聊天" />
  <img src="docs/assets/claude-code-terminal.png" width="500" alt="Claude Code 终端" />
</p>

**👉 [新手图文教程：如何用微信连接 Claude Code](https://mp.weixin.qq.com/s/745V4wfyihsm6irqT0PABQ)**

## 特性

- **官方 API**：使用微信 iLink Bot API，非逆向工程
- **完整媒体支持**：收发图片、语音消息和文件
- **访问控制**：配对码 + 白名单，防止未授权访问
- **本地安全**：MCP Server 通过 stdio 本地运行，无暴露端口
- **平台解耦**：微信通信层与平台适配层分离，便于扩展

## 支持平台

| 平台 | 状态 | 安装指南 |
|------|------|----------|
| Claude Code | ✅ 已支持 | [docs/INSTALL-CLAUDE.md](docs/INSTALL-CLAUDE.md) |
| Codex (OpenAI) | ⚗️ 实验性 | [docs/INSTALL-CODEX.md](docs/INSTALL-CODEX.md) |

## 微信前置要求

支持微信 iLink Bot（ClawBot）功能的版本：

- iOS：微信 8.0.70+
- Android：微信 8.0.69+
- MacOS：微信 4.1.8.67

## 架构

```
微信用户 ──DM──→ 微信服务器 (ilinkai.weixin.qq.com)
                       ↑ 长轮询 getUpdates
              微信通信层 (src/)          ← 平台无关，可复用
                       ↓ onMessage 回调
              平台适配层                 ← Claude Code / Codex / ...
                       ↓
              AI 编程工具 Session
```

| 平台 | 适配层 | 机制 |
|------|--------|------|
| Claude Code | `server.ts` | MCP Channel，消息出现在会话中 |
| Codex | `server-codex.ts` | App Server WebSocket 桥接，自动回复 |

## 安全设计

- 使用微信官方 iLink Bot API（非逆向工程）
- 凭证文件 `chmod 0600` 保护
- 默认启用配对码访问控制，支持白名单模式
- Context Token 严格按会话回传
- 每次上传随机生成 AES 密钥
- 通过 stdio 本地运行，无网络端口暴露

## 许可证

MIT
