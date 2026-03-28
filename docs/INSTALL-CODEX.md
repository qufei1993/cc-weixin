# Codex 安装与使用指南（实验性）

> **实验性支持**：Codex 集成存在已知平台限制，体验与 Claude Code 版本不同，请阅读下方说明再决定是否使用。

## 已知限制

| 限制 | 说明 |
|------|------|
| TUI 不显示对话 | Codex TUI 不渲染外部注入的 turn，AI 仍会处理并回复，但你在终端看不到对话内容（[Issue #15320](https://github.com/openai/codex/issues/15320)） |
| 无远程安装 | Codex 目前仅支持本地路径安装社区插件，不支持从 GitHub 等远程源直接安装（官方社区市场尚未开放） |
| 单用户路由 | 多用户同时发消息时可能出现回复串号 |
| Plugin 职责有限 | Plugin 仅提供 `weixin-configure` 和 `weixin-access` 两个配置命令，运行时桥接由独立脚本负责 |

## 工作原理

```
微信用户 → 微信服务器 → server-codex.ts → Codex App Server → AI → 回复微信
```

`server-codex.ts` 以 standalone 桥接模式运行：持续轮询微信消息，注入 Codex App Server 作为 turn，AI 处理后自动将回复发回微信。整个过程在终端后台完成，无需操作。


## 安装

### 第一步：Clone 仓库

```bash
git clone https://github.com/qufei1993/cc-weixin.git ~/cc-weixin
```

> 可以 clone 到任意位置，后续配置中替换路径即可。

### 第二步：配置本地 Marketplace

创建或编辑 `~/.agents/plugins/marketplace.json`：

```json
{
  "name": "personal",
  "plugins": [{
    "name": "weixin",
    "source": { "source": "local", "path": "./cc-weixin/plugins/weixin" },
    "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
    "category": "messaging"
  }]
}
```

> `path` 相对于 `~`（home 目录）。如果 clone 到了其他位置，对应修改。

### 第三步：在 Codex 中安装插件

打开 Codex TUI：

```bash
codex
```

输入 `/plugins`，搜索 `weixin` 并安装。安装成功后可以看到 `weixin-configure` 和 `weixin-access` 两个 skill。

## 配置

### 第四步：扫码登录微信

在 Codex TUI 中运行（只需一次）：

```
$weixin-configure
```

用微信扫描终端中显示的二维码，扫码成功后凭证自动保存到 `~/.claude/channels/weixin/`。

### 第五步：启动桥接服务

```bash
~/cc-weixin/plugins/weixin/start-codex.sh
```

这会同时启动 Codex App Server 和微信桥接进程，日志实时显示在终端。按 `Ctrl+C` 停止。

```
[weixin] Starting Codex App Server at ws://127.0.0.1:4500...
[weixin] App Server ready.
[weixin] Starting Weixin bridge...
[weixin-codex] Standalone bridge mode.
[weixin-codex] Thread created: ...
[weixin-codex] Starting WeChat poll loop...
```

看到 `Starting WeChat poll loop` 表示桥接已就绪，可以从微信发消息了。

### 第六步：配对微信用户

首次从微信发消息后，会收到一个 6 位配对码。打开 Codex TUI，运行：

```
$weixin-access pair 123456
```

### 第七步（推荐）：锁定白名单

```
$weixin-access policy allowlist
```

配对完所有授权用户后执行，阻止新用户获取配对码。详见 [ACCESS.md](../plugins/weixin/ACCESS.md)。

## 日常使用

桥接服务启动后，日常只需：

1. 运行 `~/cc-weixin/plugins/weixin/start-codex.sh`
2. 从微信发消息，AI 自动处理并回复

无需打开 Codex TUI（TUI 也看不到对话内容）。

## 卸载

停止桥接服务（`Ctrl+C`），然后在 Codex TUI 中：

```
/plugins  # 找到 weixin，卸载
```

清理凭证：

```bash
rm -rf ~/.claude/channels/weixin/
```

删除 `~/.agents/plugins/marketplace.json` 中对应的插件条目。
