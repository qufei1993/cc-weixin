#!/usr/bin/env bun
/**
 * WeChat ↔ Codex Bridge.
 *
 * Connects WeChat to a running Codex App Server via WebSocket.
 * Receives WeChat messages via long-polling and injects them into Codex
 * using turn/start (idle) or turn/steer (busy). Monitors Codex events
 * and sends responses back to WeChat.
 */

import { loadAccount, DEFAULT_BASE_URL, CDN_BASE_URL } from "./src/accounts.js";
import { startPollLoop, getContextToken, type ParsedMessage } from "./src/monitor.js";
import { sendText, sendMediaFile } from "./src/send.js";
import { CodexClient, type CodexEvent } from "./src/codex-client.js";

// --- CLI argument parsing ---

function parseArgs(): { wsUrl: string } {
  const args = process.argv.slice(2);
  let wsUrl = "ws://127.0.0.1:4500";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ws" && args[i + 1]) {
      wsUrl = args[i + 1];
      i++;
    }
  }

  return { wsUrl };
}

// --- Response extraction from Codex events ---

/**
 * Collects text output from Codex turn events.
 * Accumulates item.completed events and flushes on turn/completed.
 */
class ResponseCollector {
  private pendingText: string[] = [];
  private onResponse: (text: string) => void;

  constructor(onResponse: (text: string) => void) {
    this.onResponse = onResponse;
  }

  handleEvent(event: CodexEvent): void {
    switch (event.method) {
      case "item/completed": {
        const item = event.params?.item as Record<string, unknown> | undefined;
        if (!item) break;
        // Only collect agentMessage responses, skip userMessage/reasoning
        if (item.type !== "agentMessage") break;
        const text = item.text as string | undefined;
        if (text) {
          this.pendingText.push(text);
        }
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

      case "turn/started": {
        // Reset for new turn
        this.pendingText = [];
        break;
      }
    }
  }
}

// --- Main ---

async function main(): Promise<void> {
  const { wsUrl } = parseArgs();

  // Load WeChat account
  const account = loadAccount();
  if (!account) {
    process.stderr.write(
      "[codex-bridge] No WeChat account configured. Run /weixin:configure first.\n",
    );
    process.exit(1);
  }

  const baseUrl = account.baseUrl || DEFAULT_BASE_URL;
  const cdnBaseUrl = CDN_BASE_URL;

  // Connect to Codex App Server
  const codex = new CodexClient();

  process.stderr.write(`[codex-bridge] Connecting to Codex App Server at ${wsUrl}...\n`);
  try {
    await codex.connect(wsUrl);
  } catch (err) {
    process.stderr.write(`[codex-bridge] Failed to connect: ${err}\n`);
    process.stderr.write(
      "[codex-bridge] Make sure Codex is running with: codex app-server --listen ws://127.0.0.1:4500\n",
    );
    process.exit(1);
  }

  // Initialize App Server handshake
  try {
    await codex.initialize();
    process.stderr.write("[codex-bridge] App Server initialized.\n");
  } catch (err) {
    process.stderr.write(`[codex-bridge] Initialize failed: ${err}\n`);
    process.exit(1);
  }

  // Create thread
  let threadId: string;
  try {
    const thread = await codex.createThread();
    threadId = thread.threadId;
    process.stderr.write(`[codex-bridge] Thread created: ${threadId}\n`);
  } catch (err) {
    process.stderr.write(`[codex-bridge] Failed to create thread: ${err}\n`);
    process.exit(1);
  }

  // Track which WeChat user triggered the current turn (for routing responses)
  let currentChatId: string | null = null;

  // Set up response collector: when Codex completes a turn, send reply to WeChat
  const collector = new ResponseCollector(async (text: string) => {
    if (!currentChatId) {
      process.stderr.write("[codex-bridge] Got response but no chat_id to reply to.\n");
      return;
    }

    const chatId = currentChatId;
    const contextToken = getContextToken(chatId) || "";

    try {
      await sendText({ to: chatId, text, baseUrl, token: account.token, contextToken });
      process.stderr.write(`[codex-bridge] Reply sent to ${chatId}.\n`);
    } catch (err) {
      process.stderr.write(`[codex-bridge] Failed to send reply: ${err}\n`);
    }
  });

  codex.onEvent((event: CodexEvent) => {
    // Debug: log all events from Codex
    process.stderr.write(`[codex-bridge] Event: ${event.method} ${JSON.stringify(event.params || {}).slice(0, 300)}\n`);
    collector.handleEvent(event);
  });

  // Start WeChat poll loop
  const controller = new AbortController();

  process.on("SIGINT", () => {
    process.stderr.write("[codex-bridge] Shutting down...\n");
    controller.abort();
    codex.disconnect();
  });
  process.on("SIGTERM", () => {
    controller.abort();
    codex.disconnect();
  });

  process.stderr.write("[codex-bridge] Starting WeChat message poll loop...\n");

  await startPollLoop({
    baseUrl,
    cdnBaseUrl,
    token: account.token,
    onMessage: async (msg: ParsedMessage) => {
      if (!codex.isConnected) {
        process.stderr.write("[codex-bridge] Codex not connected, message dropped.\n");
        return;
      }

      // Track which user sent the message
      currentChatId = msg.fromUserId;

      // Build input text
      let inputText = msg.text;
      if (msg.attachmentPath) {
        inputText += `\n[Attachment (${msg.attachmentType || "file"}): ${msg.attachmentPath}]`;
      }

      const input = [{ type: "text" as const, text: inputText }];

      try {
        if (codex.activeTurnId) {
          // Agent is busy — steer the active turn
          process.stderr.write(
            `[codex-bridge] Steering active turn with message from ${msg.fromUserId}\n`,
          );
          await codex.steerTurn({
            threadId,
            input,
            expectedTurnId: codex.activeTurnId,
          });
        } else {
          // Agent is idle — start a new turn
          process.stderr.write(
            `[codex-bridge] Starting new turn with message from ${msg.fromUserId}\n`,
          );
          const turnResult = await codex.startTurn({ threadId, input });
          process.stderr.write(`[codex-bridge] turn/start result: turnId=${turnResult.turnId}\n`);
        }
      } catch (err) {
        process.stderr.write(`[codex-bridge] Failed to inject message: ${err}\n`);

        // If steer failed (e.g. turn ended between check and call), try start
        if (codex.activeTurnId) {
          try {
            await codex.startTurn({ threadId, input });
          } catch (retryErr) {
            process.stderr.write(`[codex-bridge] Retry with turn/start also failed: ${retryErr}\n`);
          }
        }
      }
    },
    abortSignal: controller.signal,
  });
}

main().catch((err) => {
  process.stderr.write(`[codex-bridge] Fatal error: ${err}\n`);
  process.exit(1);
});
