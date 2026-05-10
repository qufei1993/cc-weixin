import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
const configPath = fileURLToPath(new URL("../.codex-mcp.json", import.meta.url));

type CodexMcpServer = {
  type: string;
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
};

function loadWeixinServer(): CodexMcpServer {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    mcpServers: { weixin: CodexMcpServer };
  };
  return config.mcpServers.weixin;
}

function runServerStartup(server: CodexMcpServer, options: { cwd: string; env?: Record<string, string> }) {
  return spawnSync(server.command, server.args, {
    cwd: options.cwd,
    env: {
      HOME: process.env.HOME || "",
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      ...(server.env || {}),
      ...(options.env || {}),
    },
    input: "",
    encoding: "utf8",
    timeout: 5000,
  });
}

describe("Codex MCP config", () => {
  test("declares plugin root cwd for Codex plugin launches", () => {
    const server = loadWeixinServer();

    expect(server.cwd).toBe(".");
  });

  test("starts from the plugin root even when Bun is not on the inherited PATH", () => {
    const server = loadWeixinServer();
    const result = runServerStartup(server, { cwd: pluginRoot });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("bun: not found");
    expect(result.stderr).not.toContain("could not find a package.json");
  });

  test("starts from another cwd when CODEX_PLUGIN_ROOT is provided", () => {
    const server = loadWeixinServer();
    const cwd = mkdtempSync(join(tmpdir(), "weixin-codex-mcp-cwd-"));

    try {
      const result = runServerStartup(server, {
        cwd,
        env: { CODEX_PLUGIN_ROOT: pluginRoot },
      });

      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain("bun: not found");
      expect(result.stderr).not.toContain("could not find a package.json");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
