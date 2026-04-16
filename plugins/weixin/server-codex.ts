#!/usr/bin/env bun
/**
 * WeChat Bridge MCP Server for Codex.
 *
 * Hybrid server: acts as a stdio MCP Server (providing tools to Codex agent)
 * while internally connecting to Codex App Server via WebSocket to inject
 * WeChat messages as turns.
 *
 * Requires Codex running with: codex app-server --listen ws://127.0.0.1:4500
 * Configure via CODEX_WS_URL env var (default: ws://127.0.0.1:4500).
 *
 * Known limitations:
 * - Codex TUI does not display turns injected by this bridge (Issue #15320)
 * - Must start Codex with --listen flag (no auto-discovery)
 * - Single-user routing: only the last active WeChat user gets responses
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { loadAccount, DEFAULT_BASE_URL, CDN_BASE_URL } from "./src/accounts.js";
import { startPollLoop, getContextToken, type ParsedMessage } from "./src/monitor.js";
import { sendText, sendMediaFile } from "./src/send.js";
import { getConfig, sendTyping } from "./src/api.js";
import { TypingStatus } from "./src/types.js";
import { CodexClient, type CodexEvent } from "./src/codex-client.js";

const CODEX_WS_URL = process.env.CODEX_WS_URL || "ws://127.0.0.1:4500";
const VERSION = "0.2.1";

// --- Single-instance lock ---

const STATE_DIR = process.env.WEIXIN_STATE_DIR || join(process.env.HOME || "~", ".claude", "channels", "weixin");
const LOCK_FILE = join(STATE_DIR, "server-codex.lock");

function acquireLock(): boolean {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    if (existsSync(LOCK_FILE)) {
      const pid = parseInt(readFileSync(LOCK_FILE, "utf8").trim(), 10);
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 0); // throws if process not alive
          process.stderr.write(
            `[weixin-codex] Another instance is already running (PID ${pid}). Exiting.\n`,
          );
          return false;
        } catch {
          // Stale lock — previous process is dead
        }
      }
    }
    writeFileSync(LOCK_FILE, String(process.pid), "utf8");
    return true;
  } catch {
    return true; // If we can't write the lock, proceed anyway
  }
}

function releaseLock(): void {
  try {
    if (existsSync(LOCK_FILE)) {
      const pid = parseInt(readFileSync(LOCK_FILE, "utf8").trim(), 10);
      if (pid === process.pid) {
        unlinkSync(LOCK_FILE);
      }
    }
  } catch {
    // ignore
  }
}

// --- Recent messages queue (for check_messages tool) ---

interface RecentMessage {
  fromUserId: string;
  messageId: string;
  text: string;
  attachmentPath?: string;
  attachmentType?: string;
  receivedAt: string;
}

const recentMessages: RecentMessage[] = [];
const MAX_RECENT = 50;

function enqueueMessage(msg: ParsedMessage): void {
  recentMessages.push({
    fromUserId: msg.fromUserId,
    messageId: msg.messageId,
    text: msg.text,
    attachmentPath: msg.attachmentPath,
    attachmentType: msg.attachmentType,
    receivedAt: new Date().toISOString(),
  });
  if (recentMessages.length > MAX_RECENT) {
    recentMessages.shift();
  }
}

// --- Response collector: accumulates Codex turn events and flushes on completion ---

class ResponseCollector {
  private pendingText: string[] = [];
  private onResponse: (text: string) => void;

  constructor(onResponse: (text: string) => void) {
    this.onResponse = onResponse;
  }

  handleEvent(event: CodexEvent): void {
    switch (event.method) {
      case "turn/started": {
        this.pendingText = [];
        break;
      }
      case "item/completed": {
        const item = event.params?.item as Record<string, unknown> | undefined;
        if (!item || item.type !== "agentMessage") break;
        const text = item.text as string | undefined;
        if (text) this.pendingText.push(text);
        break;
      }
      case "turn/completed": {
        if (this.pendingText.length > 0) {
          const fullText = this.pendingText.join("\n");
          this.pendingText = [];
          this.onResponse(fullText);
        }
        break;
      }
    }
  }
}

// --- MCP Server ---

const server = new Server(
  { name: "weixin-codex", version: VERSION },
  {
    capabilities: { tools: {} },
    instructions: `WeChat bridge for Codex. WeChat messages are automatically injected as turns via the Codex App Server WebSocket.

Use the reply tool to manually send a message back to a WeChat user.
Use check_messages to view recently received WeChat messages.`,
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "reply",
      description: "Send a reply to a WeChat user.",
      inputSchema: {
        type: "object" as const,
        properties: {
          chat_id: { type: "string", description: "The WeChat user ID to reply to" },
          text: { type: "string", description: "The reply text" },
          files: {
            type: "array",
            items: { type: "string" },
            description: "Optional absolute file paths to attach",
          },
        },
        required: ["chat_id", "text"],
      },
    },
    {
      name: "send_typing",
      description: "Send a typing indicator to a WeChat user.",
      inputSchema: {
        type: "object" as const,
        properties: {
          chat_id: { type: "string", description: "The WeChat user ID" },
        },
        required: ["chat_id"],
      },
    },
    {
      name: "check_messages",
      description: "View recently received WeChat messages (up to 50).",
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of messages to return (default: 10)",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const account = loadAccount();
  if (!account) {
    return {
      content: [{ type: "text", text: "WeChat not connected. Run $weixin-configure first." }],
      isError: true,
    };
  }

  const baseUrl = account.baseUrl || DEFAULT_BASE_URL;
  const cdnBaseUrl = CDN_BASE_URL;

  switch (name) {
    case "reply": {
      const chatId = args?.chat_id as string;
      const text = args?.text as string;
      const files = args?.files as string[] | undefined;

      if (!chatId || !text) {
        return {
          content: [{ type: "text", text: "Missing chat_id or text parameter." }],
          isError: true,
        };
      }

      const contextToken = getContextToken(chatId) || "";

      try {
        if (files && files.length > 0) {
          for (const filePath of files) {
            if (!existsSync(filePath)) {
              return {
                content: [{ type: "text", text: `File not found: ${filePath}` }],
                isError: true,
              };
            }
            await sendMediaFile({
              filePath,
              to: chatId,
              text: files.indexOf(filePath) === 0 ? text : "",
              baseUrl,
              token: account.token,
              contextToken,
              cdnBaseUrl,
            });
          }
          return { content: [{ type: "text", text: "Message sent with attachments." }] };
        }

        await sendText({ to: chatId, text, baseUrl, token: account.token, contextToken });
        return { content: [{ type: "text", text: "Message sent." }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to send: ${err}` }],
          isError: true,
        };
      }
    }

    case "send_typing": {
      const chatId = args?.chat_id as string;
      if (!chatId) {
        return {
          content: [{ type: "text", text: "Missing chat_id parameter." }],
          isError: true,
        };
      }

      try {
        const contextToken = getContextToken(chatId);
        const config = await getConfig(baseUrl, account.token, chatId, contextToken);
        if (config.typing_ticket) {
          await sendTyping(baseUrl, account.token, {
            ilink_user_id: chatId,
            typing_ticket: config.typing_ticket,
            status: TypingStatus.TYPING,
          });
        }
        return { content: [{ type: "text", text: "Typing indicator sent." }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to send typing: ${err}` }],
          isError: true,
        };
      }
    }

    case "check_messages": {
      const limit = Math.min((args?.limit as number) || 10, MAX_RECENT);
      const msgs = recentMessages.slice(-limit);
      if (msgs.length === 0) {
        return { content: [{ type: "text", text: "No recent WeChat messages." }] };
      }
      const formatted = msgs
        .map((m) => {
          const attach = m.attachmentPath ? ` [${m.attachmentType || "file"}: ${m.attachmentPath}]` : "";
          return `[${m.receivedAt}] from=${m.fromUserId}\n${m.text}${attach}`;
        })
        .join("\n\n---\n\n");
      return { content: [{ type: "text", text: formatted }] };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// --- Main ---

async function main(): Promise<void> {
  // Standalone mode: running directly in a terminal (not spawned by Codex as a plugin).
  // In this mode we skip the MCP server and just run the poll loop + WebSocket bridge.
  // Logs go directly to stderr (visible in terminal).
  const standalone = process.stdin.isTTY === true;

  if (standalone) {
    process.stderr.write("[weixin-codex] Standalone bridge mode.\n");
    if (!acquireLock()) {
      process.stderr.write("[weixin-codex] Another instance is already running. Exiting.\n");
      process.exit(0);
    }
  } else {
    // Plugin mode: serve MCP tools only. The bridge runs via start-codex.sh (standalone mode).
    // Do NOT run the poll loop or WebSocket bridge here — that would conflict with the standalone instance.
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }

  const account = loadAccount();
  if (!account) {
    process.stderr.write(
      "[weixin-codex] No account configured. Run $weixin-configure first.\n",
    );
    return;
  }

  const baseUrl = account.baseUrl || DEFAULT_BASE_URL;
  const cdnBaseUrl = CDN_BASE_URL;

  // Connect to Codex App Server
  const codex = new CodexClient();
  process.stderr.write(`[weixin-codex] Connecting to Codex App Server at ${CODEX_WS_URL}...\n`);

  try {
    await codex.connect(CODEX_WS_URL);
  } catch {
    process.stderr.write(
      `[weixin-codex] Failed to connect to Codex App Server at ${CODEX_WS_URL}.\n` +
      `[weixin-codex] Make sure Codex is running with: codex app-server --listen ${CODEX_WS_URL}\n`,
    );
    // Continue running — MCP tools still work, bridge is just unavailable
  }

  let threadId: string | null = null;

  // Track which WeChat user triggered the current turn
  let currentChatId: string | null = null;

  // On Codex turn/completed → send reply back to WeChat
  const collector = new ResponseCollector(async (text: string) => {
    if (!currentChatId) return;
    const chatId = currentChatId;
    const contextToken = getContextToken(chatId) || "";
    try {
      await sendText({ to: chatId, text, baseUrl, token: account.token, contextToken });
      process.stderr.write(`[weixin-codex] → ${chatId}: ${text}\n`);
    } catch (err) {
      process.stderr.write(`[weixin-codex] Failed to send reply: ${err}\n`);
    }
  });

  // Register event listener before createThread so we don't miss early events.
  // Also logs turn lifecycle for diagnostics.
  codex.onEvent((event: CodexEvent) => {
    const m = event.method;
    if (m === "turn/started" || m === "turn/completed" || m === "thread/status/changed") {
      process.stderr.write(`[weixin-codex] ${m}: ${JSON.stringify(event.params).slice(0, 120)}\n`);
    }
    collector.handleEvent(event);
  });

  if (codex.isConnected) {
    // Wait for App Server to reach idle state before starting poll loop.
    // Register idle-listener BEFORE createThread to avoid missing the event.
    const readyPromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        process.stderr.write("[weixin-codex] App Server ready (timeout).\n");
        resolve();
      }, 30000);

      const onReady = (event: CodexEvent) => {
        if (
          event.method === "thread/status/changed" &&
          (event.params?.status as Record<string, unknown> | undefined)?.type === "idle"
        ) {
          clearTimeout(timeout);
          codex.offEvent(onReady);
          process.stderr.write("[weixin-codex] App Server ready.\n");
          resolve();
        }
      };
      codex.onEvent(onReady);
    });

    try {
      await codex.initialize();
      const thread = await codex.createThread();
      threadId = thread.threadId;
      process.stderr.write(`[weixin-codex] Thread created: ${threadId}\n`);
    } catch (err) {
      process.stderr.write(`[weixin-codex] App Server setup failed: ${err}\n`);
    }

    await readyPromise;
  }

  // Graceful shutdown
  const controller = new AbortController();
  const shutdown = () => {
    if (!controller.signal.aborted) {
      process.stderr.write("[weixin-codex] Shutting down...\n");
      controller.abort();
      codex.disconnect();
      releaseLock();
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGHUP", shutdown);

  // Periodically check if Codex App Server is still reachable
  const wsUrlObj = new URL(CODEX_WS_URL);
  const appServerHealthUrl = `http://${wsUrlObj.host}/healthz`;
  let consecutiveFailures = 0;
  const parentCheck = setInterval(async () => {
    try {
      const res = await fetch(appServerHealthUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
      }
    } catch {
      consecutiveFailures++;
    }
    if (consecutiveFailures >= 3) {
      process.stderr.write("[weixin-codex] App Server unreachable for 15s, shutting down...\n");
      clearInterval(parentCheck);
      shutdown();
    }
  }, 5000);

  process.stderr.write("[weixin-codex] Starting WeChat poll loop...\n");

  await startPollLoop({
    baseUrl,
    cdnBaseUrl,
    token: account.token,
    onMessage: async (msg: ParsedMessage) => {
      // Always queue for check_messages tool
      enqueueMessage(msg);

      // Bridge to Codex if connected
      if (!codex.isConnected || !threadId) {
        process.stderr.write(
          `[weixin-codex] Codex not connected — message from ${msg.fromUserId} queued only.\n`,
        );
        return;
      }

      currentChatId = msg.fromUserId;

      // Include sender's chat_id so the agent always knows who sent the message
      // and can reply or send files back without having to look it up.
      let inputText = `[WeChat message | chat_id: ${msg.fromUserId}]\n${msg.text}`;
      if (msg.attachmentPath) {
        inputText += `\n[Attachment (${msg.attachmentType || "file"}): ${msg.attachmentPath}]`;
      }

      process.stderr.write(`[weixin-codex] ← ${msg.fromUserId}: ${msg.text}\n`);

      const input = [{ type: "text" as const, text: inputText }];

      try {
        if (codex.activeTurnId) {
          process.stderr.write(`[weixin-codex] Steering active turn ${codex.activeTurnId}\n`);
          await codex.steerTurn({ threadId, input, expectedTurnId: codex.activeTurnId });
        } else {
          const { turnId } = await codex.startTurn({ threadId, input });
          process.stderr.write(`[weixin-codex] Turn injected: ${turnId || "(no id)"}\n`);
        }
      } catch (err) {
        process.stderr.write(`[weixin-codex] Failed to inject message: ${err}\n`);
        // Retry with startTurn if steer failed
        if (codex.activeTurnId) {
          try {
            const { turnId } = await codex.startTurn({ threadId, input });
            process.stderr.write(`[weixin-codex] Turn injected (retry): ${turnId || "(no id)"}\n`);
          } catch (retryErr) {
            process.stderr.write(`[weixin-codex] Retry also failed: ${retryErr}\n`);
          }
        }
      }
    },
    abortSignal: controller.signal,
  });

  clearInterval(parentCheck);
  await server.close();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[weixin-codex] Fatal error: ${err}\n`);
  process.exit(1);
});
