# Changelog

本项目遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

## [0.2.1] - 2026-04-16

### 修复

- **MCP 启动**：在启动 MCP server 前补充 macOS 常见 Bun/Volta 安装路径，修复 Claude Code 未加载 shell profile 时可能找不到 `bun` 的问题 ([#14](https://github.com/qufei1993/cc-weixin/pull/14))

## [0.2.0] - 2026-03-28

### 新增

- **Codex 实验性支持**：新增 `server-codex.ts`，以 standalone 桥接模式连接微信与 Codex App Server。微信消息自动注入为 turn，AI 回复自动发回微信，终端实时显示收发内容
- **一键启动脚本**：新增 `start-codex.sh`，同时启动 Codex App Server 和微信桥接进程，`Ctrl+C` 统一停止
- **Codex Plugin 支持**：新增 `.codex-plugin/plugin.json`，提供 `weixin-configure`（扫码登录）和 `weixin-access`（访问控制）两个 skill
- **单实例锁**：`server-codex.ts` 通过锁文件确保同一时刻只有一个实例运行 poll loop，防止多进程重复回复
- **独立安装指南**：文档拆分为 `docs/INSTALL-CLAUDE.md`（Claude Code）和 `docs/INSTALL-CODEX.md`（Codex），各自流程独立清晰

### 变更

- **文档重构**：README 精简为概览，安装使用细节移至独立指南文档
- **Skills 合并**：`skills/configure` 和 `skills/access` 更新为同时覆盖 Claude Code 和 Codex 两个平台
- **删除 `codex-bridge.ts`**：逻辑已并入 `server-codex.ts`

### 已知限制（Codex）

- Codex TUI 不显示外部注入的对话（跟踪：[openai/codex#15320](https://github.com/openai/codex/issues/15320)）
- Codex 插件市场暂不支持远程安装社区插件，需手动 clone 仓库
- 单用户路由，多用户并发可能串消息

待上述 Codex 官方 Issue 解决后，本项目将同步更新。

## [0.1.2] - 2026-03-24

### 修复

- **MCP 启动**：对齐官方插件 `.mcp.json` 写法，修复插件 MCP 启动失败（显示 `✗ failed`）的问题
- **启动命令**：改用 `plugin:weixin@cc-weixin` 替代 `server:weixin`，无需再手动注册全局 MCP
- **简化登录流程**：移除 `/weixin:configure` 中的全局 MCP 注册步骤，升级插件后不再需要重新运行 `/weixin:configure`

### ⚠️ 从 v0.1.1 升级注意

1. **清除旧的全局 MCP 注册**（否则可能导致消息无法接收，详见 [#10](https://github.com/qufei1993/cc-weixin/issues/10)）：
   ```bash
   claude mcp remove weixin --scope user
   ```
2. **使用新的启动命令**：
   ```bash
   # 旧（不再使用）
   claude --dangerously-load-development-channels server:weixin
   # 新
   claude --dangerously-load-development-channels plugin:weixin@cc-weixin
   ```

## [0.1.1] - 2026-03-24

### 修复

- **媒体发送**：修正 `aes_key` 编码格式、添加 `encrypt_type` 字段、补充缺失的 size 字段，修复图片/视频/文件发送后微信端无法显示的问题 ([#7](https://github.com/qufei1993/cc-weixin/pull/7))
- **媒体发送**：每个消息项单独发送一个 `sendMessage` 请求（`item_list` 仅含一个元素），与官方实现对齐，修复图片/视频/文件在微信端不显示的问题
- **进程退出**：修复关闭终端后 `bun server.ts` 进程不退出的问题，新增 `SIGHUP` 信号监听、stdin 关闭检测和父进程存活检查

## [0.1.0] - 2026-03-23

### 新增

- 首次发布
- 通过微信官方 iLink Bot API 连接微信到 Claude Code
- 支持文本、图片、语音、文件消息的接收
- 支持文本消息的发送
- 配对码 + 白名单访问控制
- QR 扫码登录
