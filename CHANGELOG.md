# Changelog

本项目遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

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
