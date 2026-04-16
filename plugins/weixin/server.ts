#!/usr/bin/env bun
/**
 * WeChat Channel MCP Server for Claude Code.
 *
 * Connects WeChat to Claude Code via the official iLink Bot API.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { existsSync } from "node:fs";

import { loadAccount, DEFAULT_BASE_URL, CDN_BASE_URL } from "./src/accounts.js";
import { startPollLoop, getContextToken, type ParsedMessage } from "./src/monitor.js";
import { sendText, sendMediaFile } from "./src/send.js";
import { getConfig, sendTyping } from "./src/api.js";
import { TypingStatus } from "./src/types.js";

const server = new Server(
  { name: "weixin", version: "0.2.1" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: `Messages from WeChat arrive as <channel source="weixin" chat_id="..." sender_id="...">.
Reply using the reply tool, passing the chat_id from the tag.
You can attach files using the files parameter (absolute paths only).`,
  },
);

// --- Tools ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "reply",
      description: "Reply to a WeChat message. Pass the chat_id from the channel tag.",
      inputSchema: {
        type: "object" as const,
        properties: {
          chat_id: { type: "string", description: "The chat_id from the channel notification" },
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
          chat_id: { type: "string", description: "The chat_id (user ID)" },
        },
        required: ["chat_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const account = loadAccount();
  if (!account) {
    return {
      content: [{ type: "text", text: "WeChat not connected. Run /weixin:configure first." }],
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
        // Send files if provided
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
          // If we already sent text with the first file, we're done
          if (files.length > 0) {
            return { content: [{ type: "text", text: "Message sent with attachments." }] };
          }
        }

        // Send text only
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
        // Get typing ticket
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

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// --- Startup ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const account = loadAccount();
  if (!account) {
    process.stderr.write(
      "[weixin] No account configured. Run /weixin:configure to connect your WeChat account.\n",
    );
    return;
  }

  const baseUrl = account.baseUrl || DEFAULT_BASE_URL;
  const cdnBaseUrl = CDN_BASE_URL;

  process.stderr.write("[weixin] Account loaded, starting poll loop...\n");

  const controller = new AbortController();

  // Graceful shutdown
  const shutdown = () => {
    if (!controller.signal.aborted) {
      process.stderr.write("[weixin] Shutting down...\n");
      controller.abort();
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGHUP", shutdown);

  // Periodically check if parent process is still alive
  const ppid = process.ppid;
  const parentCheck = setInterval(() => {
    try {
      process.kill(ppid, 0); // signal 0 = check existence, no actual signal sent
    } catch {
      // Parent process is gone — we're orphaned
      process.stderr.write("[weixin] Parent process exited, shutting down...\n");
      clearInterval(parentCheck);
      shutdown();
    }
  }, 5000);

  await startPollLoop({
    baseUrl,
    cdnBaseUrl,
    token: account.token,
    onMessage: async (msg: ParsedMessage) => {
      await server.notification({
        method: "notifications/claude/channel",
        params: {
          content: msg.text,
          meta: {
            chat_id: msg.fromUserId,
            sender_id: msg.fromUserId,
            message_id: msg.messageId,
            ...(msg.attachmentPath && { attachment_path: msg.attachmentPath }),
            ...(msg.attachmentType && { attachment_type: msg.attachmentType }),
          },
        },
      });
    },
    abortSignal: controller.signal,
  });

  // Poll loop ended — close server and exit
  await server.close();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[weixin] Fatal error: ${err}\n`);
  process.exit(1);
});
