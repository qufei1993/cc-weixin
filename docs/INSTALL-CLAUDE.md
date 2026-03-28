# Claude Code 安装与使用指南

通过微信官方 iLink Bot API，将微信连接到 Claude Code。

## 安装

在 Claude Code 中添加市场并安装插件：

```
/plugin marketplace add qufei1993/cc-weixin
/plugin install weixin@cc-weixin
```

安装完成后重启 Claude Code。

**开发者本地安装：**

```bash
git clone https://github.com/qufei1993/cc-weixin.git
```

在 Claude Code 中：

```
/plugin marketplace add /path/to/cc-weixin
/plugin install weixin@cc-weixin
```

## 配置

### 第一步：连接微信账号

```
/weixin:configure
```

用微信扫描终端中显示的二维码，扫码成功后凭证自动保存。

### 第二步：启动 Claude Code 并启用微信 channel

```bash
claude --dangerously-load-development-channels plugin:weixin@cc-weixin
```

> `--channels plugin:weixin@cc-weixin`（不带 `--dangerously-load-development-channels`）需要官方 allowlist 批准，目前尚未开放。

### 第三步：配对微信用户

首次从微信发送消息时，会收到一个 6 位配对码。在 Claude Code 中确认：

```
/weixin:access pair 123456
```

### 第四步：锁定访问（推荐）

```
/weixin:access policy allowlist
```

这将阻止新用户获取配对码。详见 [ACCESS.md](../plugins/weixin/ACCESS.md)。

## 使用

连接后，从微信发送的消息将直接出现在 Claude Code 会话中，Claude 的回复会自动发送回微信。

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
| `/weixin:access pair <code>` | 确认配对码 |
| `/weixin:access policy <mode>` | 设置访问策略（pairing/allowlist/disabled） |
| `/weixin:access status` | 查看当前访问配置 |

## 升级

```
/plugin update weixin@cc-weixin
```

如果更新后仍使用旧版本，清除缓存后重新安装：

```bash
rm -rf ~/.claude/plugins/cache/cc-weixin
```

```
/plugin install weixin@cc-weixin
```

版本变更记录详见 [CHANGELOG.md](../CHANGELOG.md)。

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
