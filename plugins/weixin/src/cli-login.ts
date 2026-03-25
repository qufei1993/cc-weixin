#!/usr/bin/env bun
/**
 * Standalone login script: bun src/cli-login.ts [alias] [clear]
 */

import { startLogin, waitForLogin } from "./login.js";
import { loadAccount, saveAccount, clearAccount, DEFAULT_BASE_URL, getChannelName } from "./accounts.js";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { readdirSync } from "node:fs";
import { execSync } from "node:child_process";

// Parse args: bun src/cli-login.ts [alias] [clear]
// Examples: bun src/cli-login.ts work       → WX=work, register as weixin-work
//           bun src/cli-login.ts work clear  → WX=work, clear weixin-work account
//           bun src/cli-login.ts clear       → clear default weixin account
const args = process.argv.slice(2);
const alias = args.find((a) => a !== "clear");
const isClear = args.includes("clear");

// Set WX env so getStateDir() / getChannelName() pick it up
if (alias) {
  process.env.WX = alias;
}

const channelName = getChannelName();

if (isClear) {
  clearAccount();
  console.log(`Account cleared: ${channelName}`);
  process.exit(0);
}

/**
 * Resolve the plugin directory (cache or local dev).
 */
function resolvePluginDir(): string {
  const cacheBase = join(homedir(), ".claude", "plugins", "cache", "cc-weixin", "weixin");
  if (existsSync(cacheBase)) {
    try {
      const versions = readdirSync(cacheBase).sort();
      if (versions.length > 0) {
        return join(cacheBase, versions[versions.length - 1]);
      }
    } catch {}
  }
  return resolve(dirname(import.meta.dir), ".");
}

/**
 * Register aliased MCP server globally using `claude mcp add --scope user`.
 * Only used for multi-tenant (when alias is provided).
 */
function registerMcpServer(): void {
  const pluginDir = resolvePluginDir();
  const wxEnv = alias ? `WX=${alias} ` : "";
  const cmd = `cd "${pluginDir}" && bun install --no-summary 1>&2 && ${wxEnv}exec bun server.ts`;

  try {
    try {
      execSync(`claude mcp remove ${channelName} --scope user`, { stdio: "ignore" });
    } catch {}

    execSync(`claude mcp add ${channelName} --scope user -- bash -c '${cmd}'`, {
      stdio: "inherit",
    });
    console.log(`\nMCP server registered globally (user scope): ${channelName}`);
    console.log(`  Plugin directory: ${pluginDir}`);
  } catch (err) {
    console.error(`\nFailed to register MCP server: ${err}`);
    console.log("You can manually register with:");
    console.log(`  claude mcp add ${channelName} --scope user -- bash -c '${cmd}'`);
  }
}

function printStartupHint(): void {
  if (alias) {
    registerMcpServer();
    console.log("\nRestart Claude Code with:");
    console.log(`  claude --dangerously-load-development-channels server:${channelName}`);
  } else {
    console.log("\nRestart Claude Code with:");
    console.log("  claude --dangerously-load-development-channels plugin:weixin@cc-weixin");
  }
}

// Check existing account
const existing = loadAccount();
if (existing) {
  console.log(`Already connected (${channelName}):`);
  console.log(`  User ID: ${existing.userId || "unknown"}`);
  console.log(`  Connected since: ${existing.savedAt}`);
  console.log(`\nRun "bun src/cli-login.ts ${alias ? alias + " " : ""}clear" to disconnect.`);
  printStartupHint();
  process.exit(0);
}

// Start login
console.log("Starting WeChat QR login...\n");
const qr = await startLogin(DEFAULT_BASE_URL);
console.log(`\nScan the QR code above with WeChat, or open this URL:\n${qr.qrcodeUrl}\n`);

const result = await waitForLogin({
  qrcodeId: qr.qrcodeId,
  apiBaseUrl: DEFAULT_BASE_URL,
});

if (result.connected && result.token) {
  saveAccount({
    token: result.token,
    baseUrl: result.baseUrl || DEFAULT_BASE_URL,
    userId: result.userId,
    savedAt: new Date().toISOString(),
  });
  console.log(`\nConnected successfully (${channelName})!`);
  console.log(`  User ID: ${result.userId}`);
  console.log(`  Base URL: ${result.baseUrl || DEFAULT_BASE_URL}`);
  printStartupHint();
} else {
  console.log(`\nLogin failed: ${result.message}`);
  process.exit(1);
}
