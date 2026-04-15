/**
 * Credential storage for WeChat account.
 * Stores account data in ~/.claude/channels/weixin/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

export interface AccountData {
  token: string;
  baseUrl: string;
  userId?: string;
  savedAt: string;
}

export function getStateDir(): string {
  const dir = process.env.WEIXIN_STATE_DIR || join(homedir(), ".claude", "channels", "weixin");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function accountPath(): string {
  return join(getStateDir(), "account.json");
}

export function loadAccount(): AccountData | null {
  const p = accountPath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as AccountData;
  } catch {
    return null;
  }
}

export function saveAccount(data: AccountData): void {
  const p = accountPath();
  writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
  chmodSync(p, 0o600);
}

export function clearAccount(): void {
  const p = accountPath();
  if (existsSync(p)) {
    unlinkSync(p);
  }
}

/** Load Anthropic API credentials from ~/.claude/settings.json */
export function loadAnthropicCredentials(): { token: string; baseUrl: string; model: string } | null {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  if (!existsSync(settingsPath)) return null;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    const token = settings.env?.ANTHROPIC_AUTH_TOKEN;
    const baseUrl = settings.env?.ANTHROPIC_BASE_URL || "https://api.minimaxi.com/anthropic";
    const model = settings.env?.ANTHROPIC_MODEL || "MiniMax-M2.7";
    if (!token) return null;
    return { token, baseUrl, model };
  } catch {
    return null;
  }
}
