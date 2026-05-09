#!/usr/bin/env node
/**
 * Cross-platform launcher for the WeChat MCP server.
 *
 * Why this file exists:
 *   Claude Code spawns MCP servers with a minimal environment. The previous
 *   `.mcp.json` used a `bash -c "..."` wrapper to prepend `~/.bun/bin` and
 *   `~/.volta/bin` to PATH (PR #14, then extended), which fixed macOS GUI
 *   launches where the user's shell profile is not sourced. Windows, however,
 *   typically has no POSIX shell on PATH, so that wrapper makes the plugin
 *   fail to start on Windows entirely.
 *
 *   `.mcp.json` cannot conditionally branch on OS, so we centralize the
 *   "find bun and start the server" logic here. Node.js is used as the
 *   launcher runtime because it is the most widely available stable runtime
 *   on developer machines across all three OSes.
 */

"use strict";

const { spawn, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { constants, homedir, platform } = require("node:os");
const { join } = require("node:path");

const isWindows = platform() === "win32";
const bunExe = isWindows ? "bun.exe" : "bun";

/** Locate the bun executable across PATH and common install locations. */
function findBun() {
  const home = homedir();
  const candidates = [
    join(home, ".bun", "bin", bunExe),
    join(home, ".volta", "bin", bunExe),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Fall through to PATH lookup; spawn will report ENOENT if it is missing.
  return bunExe;
}

const bun = findBun();
const root = __dirname;

// Step 1: install dependencies (idempotent, near-instant on no-op).
//
// stdout is redirected to our stderr (fd 2): MCP speaks JSON-RPC over the
// launcher's stdout, and bun may print non-protocol lines like "Saved lockfile"
// even with --no-summary, which would corrupt the stream.
const install = spawnSync(bun, ["install", "--no-summary"], {
  cwd: root,
  stdio: ["ignore", 2, "inherit"],
});
if (install.error || install.status !== 0) {
  const detail = install.error ? `: ${install.error.message}` : "";
  process.stderr.write(
    `[weixin] bun install failed (exit ${install.status ?? "?"})${detail}\n`,
  );
  process.exit(install.status ?? 1);
}

// Step 2: launch the MCP server with stdio inherited so the host can speak
// MCP over stdin/stdout.
const child = spawn(bun, ["server.ts"], {
  cwd: root,
  stdio: "inherit",
});

const forward = (sig) => {
  if (!child.killed) child.kill(sig);
};
process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));
process.on("SIGHUP", () => forward("SIGHUP"));

child.on("exit", (code, signal) => {
  if (signal) {
    // Don't re-raise the signal: we have SIGINT/SIGTERM/SIGHUP listeners
    // installed, which override Node's default exit behavior and would leave
    // the launcher hanging. Convey cause via the conventional 128+signum code.
    const signum = constants.signals[signal] ?? 0;
    process.exit(128 + signum);
  }
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  process.stderr.write(`[weixin] failed to spawn bun: ${err.message}\n`);
  process.exit(1);
});
